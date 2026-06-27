// POST /api/partner-recap   (optional { month: 'YYYY-MM' })
//   Auth: requires sf_dash_session cookie.
//   Emails each PARTNER community (a complex with a leasing-office email on file)
//   a no-PII recap: "N of your new residents got their renters insurance set up
//   through us this month." The relationship-renewing loop — it carries only a
//   count, never a tenant's name or contact info. Counts leads that became BOUND
//   in the window (status=bound, status_updated_at within the month).

import { requireSession } from '../lib/auth.js';

const FROM_NAME = 'Anthony Gallant State Farm';

function sbHeaders(extra = {}) {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    ...extra,
  };
}
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireSession(req, res)) return;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }
  if (!process.env.RESEND_API_KEY || !process.env.FROM_EMAIL) {
    return res.status(500).json({ error: 'Email not configured' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  // Resolve the month window [start, end). Default: the current calendar month (UTC).
  const now = new Date();
  let year = now.getUTCFullYear(), month = now.getUTCMonth(); // 0-based
  const m = String(body.month || '').match(/^(\d{4})-(\d{2})$/);
  if (m) { year = Number(m[1]); month = Number(m[2]) - 1; }
  const start = new Date(Date.UTC(year, month, 1)).toISOString();
  const end = new Date(Date.UTC(year, month + 1, 1)).toISOString();
  const monthLabel = new Date(Date.UTC(year, month, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

  const base = process.env.SUPABASE_URL.replace(/\/$/, '');
  try {
    // Leads that became BOUND this month, with a resolved complex.
    const lr = await fetch(
      `${base}/rest/v1/leads?status=eq.bound&status_updated_at=gte.${start}&status_updated_at=lt.${end}&complex_id=not.is.null&select=complex_id&limit=10000`,
      { headers: sbHeaders() },
    );
    if (!lr.ok) throw new Error(`leads fetch ${lr.status}`);
    const rows = await lr.json();
    const counts = {};
    for (const r of rows) counts[r.complex_id] = (counts[r.complex_id] || 0) + 1;

    // Partner complexes = those with a valid leasing-office email on file.
    const cr = await fetch(
      `${base}/rest/v1/complexes?select=id,name,partner_email,partner_contact&limit=2000`,
      { headers: sbHeaders() },
    );
    if (!cr.ok) throw new Error(`complexes fetch ${cr.status}`);
    const partners = (await cr.json()).filter(c => /.+@.+\..+/.test(String(c.partner_email || '').trim()));

    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    const sent = [], skipped = [], failed = [];
    for (const c of partners) {
      const count = counts[c.id] || 0;
      if (count < 1) continue; // nothing to report — don't email an empty recap
      // Claim the (community, month) slot BEFORE sending so a double-click, a retry,
      // or two staff running this can't email the same leasing office twice. The PK
      // on (complex_id, month) makes the claim atomic — concurrent runs race to
      // insert and only one wins.
      const claim = await claimRecap(base, c.id, monthKey);
      if (claim === 'duplicate') { skipped.push({ name: c.name || '(unnamed)', count }); continue; }
      if (claim === 'error') { failed.push({ name: c.name || '(unnamed)', count }); continue; }
      try {
        await resendSend({
          to: [String(c.partner_email).trim()],
          subject: `${c.name || 'Your community'} — ${count} resident${count === 1 ? '' : 's'} covered this month`,
          html: recapHtml(c, count, monthLabel),
          replyTo: process.env.FROM_EMAIL,
        });
        sent.push({ name: c.name || '(unnamed)', count });
      } catch (e) {
        console.error('recap_send_failed', c.id, e);
        // Roll the claim back so a later retry can re-send this one.
        await releaseRecap(base, c.id, monthKey);
        failed.push({ name: c.name || '(unnamed)', count });
      }
    }
    return res.status(200).json({ ok: true, month: monthLabel, sent, skipped, failed });
  } catch (e) {
    console.error('partner_recap_failed', e);
    return res.status(502).json({ error: 'Could not send recaps.' });
  }
}

// Atomically claim a (complex, month) recap slot via an insert that ignores PK
// conflicts. Returns 'claimed' when THIS call inserted the row (safe to send),
// 'duplicate' when the row already existed (already sent this month — skip), or
// 'error' when the ledger write itself failed (skip rather than risk an
// unrecorded send). The (complex_id, month) primary key is the concurrency lock.
async function claimRecap(base, complexId, month) {
  try {
    const r = await fetch(`${base}/rest/v1/partner_recaps_sent`, {
      method: 'POST',
      headers: sbHeaders({ 'Content-Type': 'application/json', Prefer: 'return=representation,resolution=ignore-duplicates' }),
      body: JSON.stringify({ complex_id: complexId, month }),
    });
    if (!r.ok) return 'error';
    const rows = await r.json().catch(() => []);
    return Array.isArray(rows) && rows.length > 0 ? 'claimed' : 'duplicate';
  } catch (e) {
    console.error('recap_claim_failed', complexId, e);
    return 'error';
  }
}

// Release a claimed slot — only when the email send failed — so a retry can
// re-send. Best-effort: a failed release just means that office misses this
// month's recap, which is the safe direction (never a double-send).
async function releaseRecap(base, complexId, month) {
  try {
    await fetch(`${base}/rest/v1/partner_recaps_sent?complex_id=eq.${encodeURIComponent(complexId)}&month=eq.${encodeURIComponent(month)}`, {
      method: 'DELETE',
      headers: sbHeaders({ Prefer: 'return=minimal' }),
    });
  } catch (e) { console.error('recap_release_failed', complexId, e); }
}

function recapHtml(c, count, monthLabel) {
  const greeting = c.partner_contact ? `Hi ${escapeHtml(c.partner_contact)},` : 'Hello,';
  const community = escapeHtml(c.name || 'your community');
  return `
    <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:540px;color:#111;">
      <p style="font-size:15px;">${greeting}</p>
      <p style="font-size:15px;line-height:1.55;">
        Quick note for <strong>${monthLabel}</strong>: <strong>${count}</strong> new resident${count === 1 ? '' : 's'} at
        <strong>${community}</strong> got their renters insurance set up through
        <strong>Anthony Gallant State Farm</strong> — one less move-in box for your team to chase.
      </p>
      <p style="font-size:15px;line-height:1.55;">
        Thanks for pointing them our way. If you'd like a fresh stack of the resident flyers, or anything else, just reply.
      </p>
      <p style="font-size:13px;color:#666;margin-top:22px;">
        Anthony Gallant, State Farm Agent · Gastonia, NC · (704) 853-8001<br/>
        State Farm Mutual Automobile Insurance Company, Bloomington, IL.
      </p>
    </div>`;
}

async function resendSend({ to, subject, html, replyTo }) {
  const payload = { from: `${FROM_NAME} <${process.env.FROM_EMAIL}>`, to: Array.isArray(to) ? to : [to], subject, html };
  if (replyTo) payload.reply_to = replyTo;
  for (let attempt = 0; ; attempt++) {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (resp.ok) return;
    if ((resp.status === 429 || resp.status >= 500) && attempt < 2) {
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
      continue;
    }
    throw new Error(`Resend ${resp.status}: ${await resp.text()}`);
  }
}
