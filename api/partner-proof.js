// POST /api/partner-proof   { leadId }
//   Auth: requires sf_dash_session cookie.
//   Emails a renters-coverage confirmation to the lead's apartment community
//   (the leasing-office email stored on the complex), but ONLY when the resident
//   opted in (leads.share_with_property = true) AND the policy is bound. Records
//   leads.proof_sent_at so the dashboard shows it's done.
//
//   Honest by construction: it sends a COVERAGE CONFIRMATION (the lead is marked
//   bound), not a policy document the app doesn't hold — the declarations page is
//   offered on request (reply-to is the office). No tenant PII beyond the first
//   name + community the resident consented to share.

import { requireSession } from '../lib/auth.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FROM_NAME = 'Anthony Gallant State Farm';
const OFFICE_PHONE = '(704) 853-8001';

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
  const leadId = String(body.leadId || '').trim();
  if (!UUID_RE.test(leadId)) return res.status(400).json({ error: 'Invalid leadId' });

  const base = process.env.SUPABASE_URL.replace(/\/$/, '');
  try {
    // Load the lead.
    const lr = await fetch(
      `${base}/rest/v1/leads?id=eq.${leadId}&select=id,first_name,status,share_with_property,complex_id,proof_sent_at&limit=1`,
      { headers: sbHeaders() },
    );
    if (!lr.ok) throw new Error(`lead fetch ${lr.status}`);
    const lead = (await lr.json())[0];
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    // Idempotent: if proof already went to the office, don't re-email it.
    if (lead.proof_sent_at) {
      return res.status(200).json({ ok: true, alreadySent: true, proof_sent_at: lead.proof_sent_at });
    }
    if (lead.share_with_property !== true) {
      return res.status(400).json({ error: 'This resident did not opt in to share proof with their community.' });
    }
    if (lead.status !== 'bound') {
      return res.status(400).json({ error: 'Mark this lead Bound first — proof of coverage is only accurate once the policy is in force.' });
    }
    if (!lead.complex_id) {
      return res.status(400).json({ error: 'No community on file for this lead.' });
    }

    // Resolve the leasing-office email on the complex.
    const cr = await fetch(
      `${base}/rest/v1/complexes?id=eq.${lead.complex_id}&select=name,partner_email,partner_contact&limit=1`,
      { headers: sbHeaders() },
    );
    if (!cr.ok) throw new Error(`complex fetch ${cr.status}`);
    const complex = (await cr.json())[0];
    if (!complex) return res.status(404).json({ error: 'Community not found' });
    const partnerEmail = String(complex.partner_email || '').trim();
    if (!/.+@.+\..+/.test(partnerEmail)) {
      return res.status(400).json({ error: `Add a leasing-office email for ${complex.name || 'this community'} in the Complexes tab first.` });
    }

    // Send the coverage confirmation.
    const greeting = complex.partner_contact ? `Hi ${escapeHtml(complex.partner_contact)},` : 'Hello,';
    const resident = escapeHtml(lead.first_name || 'Your resident');
    const community = escapeHtml(complex.name || 'your community');
    const subject = `Proof of renters coverage — ${lead.first_name || 'resident'} at ${complex.name || 'your community'}`;
    const html = `
      <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:540px;color:#111;">
        <p style="font-size:15px;">${greeting}</p>
        <p style="font-size:15px;line-height:1.55;">
          This confirms that <strong>${resident}</strong>, a resident at <strong>${community}</strong>,
          has secured renters insurance through <strong>Anthony Gallant State Farm</strong>. They asked us
          to send this to your office to satisfy their lease's insurance requirement.
        </p>
        <p style="font-size:15px;line-height:1.55;">
          Need the full declarations page, or want ${community} listed as an interested party on the policy?
          Just reply to this email or call
          <a href="tel:+17048538001" style="color:#E22925;font-weight:600;">${OFFICE_PHONE}</a> and we'll send it right over.
        </p>
        <p style="font-size:13px;color:#666;margin-top:22px;">
          Anthony Gallant, State Farm Agent · Gastonia, NC<br/>
          State Farm Mutual Automobile Insurance Company, Bloomington, IL. Coverage subject to terms, conditions, and availability.
        </p>
      </div>`;
    await resendSend({ to: [partnerEmail], subject, html, replyTo: process.env.FROM_EMAIL });

    // Stamp proof_sent_at (best-effort — the email already went out).
    const sentAt = new Date().toISOString();
    try {
      await fetch(`${base}/rest/v1/leads?id=eq.${leadId}`, {
        method: 'PATCH',
        headers: sbHeaders({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
        body: JSON.stringify({ proof_sent_at: sentAt }),
      });
    } catch (e) { console.error('proof_stamp_failed', e); }

    return res.status(200).json({ ok: true, sentTo: partnerEmail, proof_sent_at: sentAt });
  } catch (e) {
    console.error('partner_proof_failed', e);
    return res.status(502).json({ error: 'Could not send the proof email.' });
  }
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
