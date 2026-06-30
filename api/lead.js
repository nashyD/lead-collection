// /api/lead — Vercel serverless function
// Receives form submissions from the landing page, persists to Supabase, and sends two
// emails via Resend: a confirmation to the lead and a notification to the office. Each
// step is independent and fail-soft — a failure in one never blocks the others.
//
// Env vars (email is skipped if its vars are missing):
//   SUPABASE_URL                 e.g. https://abcd.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY    server-only key — never expose to the browser
//   RESEND_API_KEY           from resend.com (free tier: 3,000/mo, 100/day)
//   FROM_EMAIL                   e.g. leads@gallantrenters.com (must be a domain verified in Resend)
//   META_PIXEL_ID                Meta pixel id (also served to the browser via /api/config)
//   META_CAPI_TOKEN              Meta Conversions API token — SERVER-ONLY secret. When set (with
//                                META_PIXEL_ID) a server-side Lead event is sent to Meta, deduped
//                                with the browser pixel via a shared event_id. Unset = no-op.
//
// Office notification recipients are managed from the dashboard Settings panel and stored
// in the Supabase `settings` table (key = notify_emails). No env var needed for them.

import { createHash } from 'node:crypto';

const OFFICE_PHONE = '(704) 853-8001';
const FROM_NAME = 'Anthony Gallant State Farm';
const LANGUAGE_LABELS = { en: 'English', es: 'Spanish', ht: 'Haitian Creole' };
const PRODUCT_LABELS = { renters: 'renters', homeowners: 'homeowners', auto: 'auto', life: 'life' };

export default async function handler(req, res) {
  // CORS (in case the form is ever hosted on a different domain)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  }
  body = body || {};

  // Honeypot — if a bot filled the hidden "website" field, pretend success.
  if ((body.website || '').toString().trim() !== '') {
    return res.status(200).json({ ok: true });
  }

  // Bot check (Cloudflare Turnstile). Only enforced once TURNSTILE_SECRET_KEY is
  // set, so the form keeps working before keys are added — but it is UNPROTECTED
  // until then. Set the key in Vercel before launch.
  if (process.env.TURNSTILE_SECRET_KEY) {
    const token = String(body.cf_turnstile_token || body['cf-turnstile-response'] || '');
    const human = await verifyTurnstile(token, req.headers['x-forwarded-for']);
    if (!human) return res.status(403).json({ error: 'Verification failed' });
  }

  const firstName = String(body.firstName || '').trim().slice(0, 80);
  const phoneRaw  = String(body.phone || '').trim().slice(0, 40);
  const email     = String(body.email || '').trim().toLowerCase().slice(0, 200);

  if (!firstName || !phoneRaw || !email) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  // Normalize US phone to E.164 (+1XXXXXXXXXX).
  const digits = phoneRaw.replace(/\D/g, '');
  const phoneE164 =
    digits.length === 10 ? `+1${digits}` :
    digits.length === 11 && digits.startsWith('1') ? `+${digits}` :
    null;

  if (!phoneE164) {
    return res.status(400).json({ error: 'Invalid phone number' });
  }

  const source   = String(body.utm_source   || 'direct').slice(0, 50);
  const medium   = String(body.utm_medium   || '').slice(0, 50);
  const campaign = String(body.utm_campaign || '').slice(0, 50);
  // Self-reported apartment community (optional). Resolved to a complex_id at
  // save time; falls back to free-text if it isn't a known complex.
  const community = String(body.community || '').trim().slice(0, 200);

  // Self-reported car dealership (auto form only, optional). Resolved to a
  // dealership_id at save time; falls back to free-text if it isn't known.
  const dealership = String(body.dealership || '').trim().slice(0, 200);

  // Self-reported preferred language so the office can route to a rep who speaks it.
  const langRaw = String(body.language || '').trim().toLowerCase();
  const language = ['en', 'es', 'ht'].includes(langRaw) ? langRaw : 'en';

  // Product line the lead came in on. The renters form omits it; the homeowners
  // form sends product=homeowners. Whitelisted so the column stays clean.
  const productRaw = String(body.product || '').trim().toLowerCase();
  const product = productRaw in PRODUCT_LABELS ? productRaw : 'renters';

  // Self-reported home address (homeowners form only, optional).
  const address = String(body.address || '').trim().slice(0, 200);

  // Self-reported vehicle — year/make/model (auto form only, optional).
  const vehicle = String(body.vehicle || '').trim().slice(0, 200);

  // Self-reported coverage amount the visitor is considering (life form only,
  // optional free text — never required). Mirrors 'address'/'vehicle'.
  const coverage = String(body.coverage || '').trim().slice(0, 200);

  // The exact consent language the visitor agreed to (sent by the form). Stored
  // with a server timestamp + the ip/user-agent captured below, as TCPA
  // proof-of-consent for the text/email outreach. Capped; optional/fail-soft.
  const consentText = String(body.consent_text || '').trim().slice(0, 600);

  // Tenant opt-in (renters partner channel): the resident agreed to have their
  // proof of coverage sent to their apartment community to satisfy the lease.
  // Only shown on the form when arriving via a partner QR / a community is picked.
  // Accepts a real boolean or the form's checkbox string ('on'/'true'/'1').
  const swp = body.share_with_property;
  const shareWithProperty = swp === true || swp === 1 || ['on', 'true', '1', 'yes'].includes(String(swp).toLowerCase());

  const lead = {
    firstName,
    phone: phoneE164,
    email,
    source,
    medium,
    campaign,
    community,
    dealership,
    language,
    product,
    address,
    vehicle,
    coverage,
    consentText,
    shareWithProperty,
    receivedAt: new Date().toISOString(),
    userAgent: req.headers['user-agent'] || '',
    ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '',
  };

  // Non-PII breadcrumb on every submission. Full lead detail is only logged on
  // the all-sinks-failed path below, as a last-resort recovery trail — we don't
  // want customer name/phone/email/IP sitting in function logs on every request.
  console.log('lead_received', JSON.stringify({ source, campaign, language, product, hasCommunity: !!community, hasDealership: !!dealership }));

  // Suppress an accidental duplicate (a double-tap or a network retry): if this
  // exact lead (same phone + email + product) already landed in the last few
  // minutes, treat it as success WITHOUT a second row or a second office alert.
  // Fail-OPEN — any error here must never block a genuine lead.
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      if (await isRecentDuplicate(lead)) {
        console.log('lead_duplicate_suppressed', JSON.stringify({ product }));
        return res.status(200).json({ ok: true, duplicate: true });
      }
    } catch (e) {
      console.error('dedupe_check_failed', e);  // fail open — proceed to capture
    }
  }

  // Capture the lead in at least one durable place. Each sink is fail-soft, but
  // if NONE succeeds we must not tell the visitor "we got it" (a paid lead is
  // too expensive to silently drop).
  let persisted = false;       // saved to Supabase — the dashboard's source of truth
  let officeNotified = false;  // office got an email alert — the human backstop

  // Persist to Supabase first (so the dashboard always sees the lead).
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      await saveLeadToSupabase(lead);
      persisted = true;
    } catch (e) {
      console.error('supabase_insert_failed', e);
    }
  }

  // Email notifications via Resend. Both are independent and fail-soft.
  if (process.env.RESEND_API_KEY && process.env.FROM_EMAIL) {
    await Promise.all([
      // 1) Confirmation to the lead — best-effort, never counts as "captured".
      emailLeadConfirmation(lead).catch(e => console.error('email_lead_confirmation_failed', e)),
      // 2) Notification to the office recipient list (managed in the dashboard).
      getNotifyRecipients()
        .then(recips => {
          if (!recips.length) return console.log('no_notify_recipients_configured');
          return emailOffice(lead, recips).then(() => { officeNotified = true; });
        })
        .catch(e => console.error('email_office_failed', e)),
    ]);
  } else {
    console.log('resend_not_configured_email_skipped');
  }

  // Server-side Meta Conversions API (best-effort, fail-soft). Dormant unless
  // META_PIXEL_ID + META_CAPI_TOKEN are set; deduped with the browser pixel via
  // the shared event_id. Pure measurement — never affects lead capture/response.
  await sendMetaCapiLead(lead, body, req).catch(e => console.error('meta_capi_failed', e));

  // Nowhere durable captured it — fail loudly so the visitor sees the "call us"
  // fallback instead of a false success.
  if (!persisted && !officeNotified) {
    console.error('LEAD_NOT_CAPTURED', JSON.stringify(lead));
    return res.status(502).json({ error: 'Could not save your request' });
  }

  return res.status(200).json({ ok: true });
}

// --- Supabase ---------------------------------------------------------------

async function saveLeadToSupabase(lead) {
  const base = process.env.SUPABASE_URL.replace(/\/$/, '');
  const url = `${base}/rest/v1/leads`;
  const row = {
    first_name: lead.firstName,
    phone:      lead.phone,
    email:      lead.email,
    language:   lead.language,
    product:    lead.product,
    address:    lead.address,
    vehicle:    lead.vehicle,
    coverage_amount: lead.coverage,
    source:     lead.source,
    medium:     lead.medium,
    campaign:   lead.campaign,
    user_agent: lead.userAgent,
    ip:         lead.ip,
  };

  // TCPA proof-of-consent: the exact language agreed to + a server timestamp
  // (paired with the ip/user_agent above). Optional column — see OPTIONAL_COLS.
  if (lead.consentText) {
    row.consent_text = lead.consentText;
    row.consented_at = new Date().toISOString();
  }

  // Tenant opt-in to share proof of coverage with their apartment community.
  // Only set when true so a DB missing the column (mid-migration) still inserts.
  if (lead.shareWithProperty) row.share_with_property = true;

  // Resolve the self-reported community to a known complex (case-insensitive
  // exact match); otherwise keep it as free text. Never block the insert.
  if (lead.community) {
    try {
      const q = new URL(`${base}/rest/v1/complexes`);
      q.searchParams.set('select', 'id');
      q.searchParams.set('name', ilikeExactFilter(lead.community));
      q.searchParams.set('order', 'name.asc');
      q.searchParams.set('limit', '1');
      const cr = await fetch(q, {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      });
      const match = cr.ok ? (await cr.json())[0] : null;
      if (match) row.complex_id = match.id;
      else row.complex_other = lead.community;
    } catch (e) {
      console.error('complex_resolve_failed', e);
      row.complex_other = lead.community;
    }
  }

  // Same resolution for the self-reported dealership (auto leads). Match by name
  // (case-insensitive exact) against known dealerships; otherwise keep free text.
  if (lead.dealership) {
    try {
      const q = new URL(`${base}/rest/v1/dealerships`);
      q.searchParams.set('select', 'id');
      q.searchParams.set('name', ilikeExactFilter(lead.dealership));
      q.searchParams.set('order', 'name.asc');
      q.searchParams.set('limit', '1');
      const dr = await fetch(q, {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      });
      const match = dr.ok ? (await dr.json())[0] : null;
      if (match) row.dealership_id = match.id;
      else row.dealership_other = lead.dealership;
    } catch (e) {
      console.error('dealership_resolve_failed', e);
      row.dealership_other = lead.dealership;
    }
  }
  const insert = (payload) => fetch(url, {
    method: 'POST',
    headers: {
      'apikey':        process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify(payload),
  });

  // Columns added by later migrations that may not exist yet in a given DB.
  // Everything NOT in this list (first_name/phone/email/source/medium/campaign/
  // user_agent/ip) is part of the original schema and always present.
  const OPTIONAL_COLS = ['language', 'product', 'address', 'vehicle', 'coverage_amount', 'complex_id', 'complex_other', 'dealership_id', 'dealership_other', 'consent_text', 'consented_at', 'share_with_property'];

  // Insert with a self-healing retry so a paid lead is never lost to a schema
  // that's mid-migration:
  //   1. If PostgREST names a missing optional column, drop just that one and retry.
  //   2. If it fails without naming a known column (wording changed, or several
  //      are missing at once), strip ALL optional columns and retry the core row.
  //   3. If even the core-only insert fails, it's a real error — throw.
  let resp = await insert(row);
  while (!resp.ok) {
    const errText = await resp.text();
    const named = OPTIONAL_COLS.find(c => c in row && new RegExp(`\\b${c}\\b`, 'i').test(errText));
    if (named) {
      delete row[named];
    } else if (OPTIONAL_COLS.some(c => c in row)) {
      OPTIONAL_COLS.forEach(c => delete row[c]);
    } else {
      throw new Error(`Supabase ${resp.status}: ${errText}`);
    }
    resp = await insert(row);
  }
}

async function getNotifyRecipients() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return [];
  const url = `${process.env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/settings?key=eq.notify_emails&select=value`;
  const resp = await fetch(url, {
    headers: {
      'apikey':        process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!resp.ok) return [];
  const rows = await resp.json();
  return String(rows[0]?.value || '')
    .split(/[\s,;]+/)
    .map(s => s.trim().toLowerCase())
    .filter(e => /.+@.+\..+/.test(e));
}

// --- Email (Resend) -----------------------------------------------------

async function emailLeadConfirmation(lead) {
  const productLabel = PRODUCT_LABELS[lead.product] || 'renters';
  const subject = `Thanks — we got your ${productLabel} insurance request`;
  const html = `
    <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;color:#111;">
      <p style="font-size:15px;">Hi ${escapeHtml(lead.firstName)},</p>
      <p style="font-size:15px;line-height:1.5;">
        Thanks for requesting a ${productLabel} insurance quote with
        <strong>Anthony Gallant State Farm</strong>. Someone from our office will reach out
        shortly to finish your quote.
      </p>
      <p style="font-size:15px;line-height:1.5;">
        Need us sooner? Call <a href="tel:+17048538001" style="color:#E22925;font-weight:600;">${OFFICE_PHONE}</a>.
      </p>
      <p style="font-size:13px;color:#666;margin-top:24px;">
        Anthony Gallant, State Farm Agent · Gastonia, NC<br/>
        State Farm Mutual Automobile Insurance Company, Bloomington, IL. Coverage subject to terms, conditions, and availability.
      </p>
    </div>`;
  await resendSend({ to: [lead.email], subject, html, replyTo: process.env.FROM_EMAIL });
}

async function emailOffice(lead, recipients) {
  const productLabel = PRODUCT_LABELS[lead.product] || 'renters';
  const subject = `New ${productLabel} lead — ${lead.firstName} · ${LANGUAGE_LABELS[lead.language] || lead.language} (${lead.source})`;
  const html = `
    <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;">
      <h2 style="margin:0 0 12px;color:#E22925;">New lead — reach out fast</h2>
      <table style="border-collapse:collapse;width:100%;font-size:14px;">
        <tr><td style="padding:6px 0;color:#666;width:120px;">Name</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(lead.firstName)}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Product</td><td style="padding:6px 0;font-weight:700;text-transform:capitalize;">${escapeHtml(productLabel)}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Speaks</td><td style="padding:6px 0;font-weight:700;color:#E22925;">${escapeHtml(LANGUAGE_LABELS[lead.language] || lead.language)}</td></tr>
        ${lead.shareWithProperty ? `<tr><td style="padding:6px 0;color:#666;">Share proof</td><td style="padding:6px 0;font-weight:700;color:#065F46;">Resident opted in — send proof to their community once bound</td></tr>` : ''}
        ${lead.address ? `<tr><td style="padding:6px 0;color:#666;">Address</td><td style="padding:6px 0;">${escapeHtml(lead.address)}</td></tr>` : ''}
        ${lead.vehicle ? `<tr><td style="padding:6px 0;color:#666;">Vehicle</td><td style="padding:6px 0;">${escapeHtml(lead.vehicle)}</td></tr>` : ''}
        ${lead.coverage ? `<tr><td style="padding:6px 0;color:#666;">Coverage</td><td style="padding:6px 0;">${escapeHtml(lead.coverage)}</td></tr>` : ''}
        ${lead.dealership ? `<tr><td style="padding:6px 0;color:#666;">Dealership</td><td style="padding:6px 0;">${escapeHtml(lead.dealership)}</td></tr>` : ''}
        <tr><td style="padding:6px 0;color:#666;">Phone</td><td style="padding:6px 0;font-weight:600;"><a href="sms:${lead.phone}">${lead.phone}</a> · <a href="tel:${lead.phone}">call</a></td></tr>
        <tr><td style="padding:6px 0;color:#666;">Email</td><td style="padding:6px 0;"><a href="mailto:${lead.email}">${escapeHtml(lead.email)}</a></td></tr>
        <tr><td style="padding:6px 0;color:#666;">Source</td><td style="padding:6px 0;">${escapeHtml(lead.source)}${lead.campaign ? ' / ' + escapeHtml(lead.campaign) : ''}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Received</td><td style="padding:6px 0;">${escapeHtml(lead.receivedAt)}</td></tr>
      </table>
      <p style="margin:18px 0 0;color:#666;font-size:12px;">Speed-to-lead matters — aim to reach out within a few minutes.</p>
    </div>`;
  await resendSend({ to: recipients, subject, html, replyTo: lead.email });
}

async function resendSend({ to, subject, html, replyTo }) {
  // Resend wants `to` as an array of email strings and `from` as "Name <email>".
  const recipients = Array.isArray(to) ? to : [to];
  const payload = {
    from: `${FROM_NAME} <${process.env.FROM_EMAIL}>`,
    to: recipients,
    subject,
    html,
  };
  if (replyTo) payload.reply_to = replyTo;

  // Two emails fire per lead and Resend's free tier rate-limits at ~2 req/sec, so
  // a burst can return 429 and silently drop one. Retry 429/5xx with short backoff.
  // (A 403 — e.g. an unverified sending domain — is NOT retried; it throws so the
  //  real reason lands in the logs.)
  for (let attempt = 0; ; attempt++) {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (resp.ok) return; // Resend returns 200 with { id } on success.
    if ((resp.status === 429 || resp.status >= 500) && attempt < 2) {
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
      continue;
    }
    throw new Error(`Resend ${resp.status}: ${await resp.text()}`);
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Build a PostgREST `name=ilike."…"` filter that matches the value EXACTLY but
// case-insensitively. Two layers of escaping:
//   1. SQL LIKE wildcards (% _ \) are backslash-escaped so a user-typed "%" can't
//      match every row (which would mis-attribute the lead to a random complex).
//   2. The result is wrapped in double quotes so PostgREST reserved characters
//      (commas, parentheses, spaces) are treated literally — e.g. a Google Places
//      name like `Toyota of Gastonia, Inc.` would otherwise break the filter.
function ilikeExactFilter(value) {
  const likeEscaped = String(value).replace(/[\\%_]/g, c => '\\' + c); // SQL LIKE: \ % _
  const quoted = likeEscaped.replace(/[\\"]/g, c => '\\' + c);         // PostgREST quoting: \ "
  return `ilike."${quoted}"`;
}

// True if an identical lead (same phone + email + product) was already saved in
// the last few minutes — i.e. a double-tap / retry rather than a fresh inquiry.
// A correction (e.g. a changed email) is NOT a duplicate, so it still gets saved.
// Matches only on the server-normalized phone (E.164: '+' + digits — no PostgREST
// special chars), so the filter can't be injected. Throws on a failed query so
// the caller can fail OPEN (treat as not-a-duplicate and save the lead).
async function isRecentDuplicate(lead) {
  const base = process.env.SUPABASE_URL.replace(/\/$/, '');
  const sinceIso = new Date(Date.now() - 3 * 60 * 1000).toISOString();  // 3-minute window
  const q = new URL(`${base}/rest/v1/leads`);
  q.searchParams.set('select', 'email,product');
  q.searchParams.set('phone', `eq.${lead.phone}`);
  q.searchParams.set('created_at', `gte.${sinceIso}`);
  q.searchParams.set('limit', '20');
  const r = await fetch(q, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!r.ok) throw new Error(`dedupe query ${r.status}`);
  const rows = await r.json();
  return rows.some(x => (x.email || '') === lead.email && (x.product || 'renters') === lead.product);
}

// Server-side Meta Conversions API "Lead" event. No-op unless META_PIXEL_ID +
// META_CAPI_TOKEN are both set. PII (email/phone/first name) is SHA-256 hashed
// per Meta's spec; ip/user-agent + the _fbp/_fbc cookies are sent as-is to lift
// match quality. event_id (from the form) dedups this against the browser pixel
// so the conversion is counted once. Throws on a non-2xx so the caller logs it;
// the caller never lets a CAPI failure affect the lead response.
async function sendMetaCapiLead(lead, body, req) {
  const pixelId = process.env.META_PIXEL_ID;
  const token = process.env.META_CAPI_TOKEN;
  if (!pixelId || !token) return;  // not configured — skip silently

  const hash = (s) => createHash('sha256').update(String(s == null ? '' : s).trim().toLowerCase()).digest('hex');
  const cookies = parseCookies(req.headers?.cookie);
  const phoneDigits = String(lead.phone || '').replace(/\D/g, '');  // e.g. 1XXXXXXXXXX (incl. country code)
  const userData = {
    em: [hash(lead.email)],
    ph: [hash(phoneDigits)],
    client_ip_address: String(lead.ip || '').split(',')[0].trim() || undefined,
    client_user_agent: lead.userAgent || undefined,
  };
  if (lead.firstName) userData.fn = [hash(lead.firstName)];
  if (cookies._fbp) userData.fbp = cookies._fbp;
  if (cookies._fbc) userData.fbc = cookies._fbc;

  const event = {
    event_name: 'Lead',
    event_time: Math.floor(Date.now() / 1000),
    action_source: 'website',
    user_data: userData,
    custom_data: { content_name: lead.product || 'renters' },
  };
  const eventId = String(body?.event_id || '').slice(0, 100);
  if (eventId) event.event_id = eventId;
  const referer = req.headers?.referer || req.headers?.referrer;
  if (referer) event.event_source_url = String(referer).slice(0, 500);

  const url = `https://graph.facebook.com/v19.0/${encodeURIComponent(pixelId)}/events?access_token=${encodeURIComponent(token)}`;
  // Bound the call so a slow/hung Meta API can't delay the visitor's success
  // screen (the lead is already captured by now; this is pure measurement). An
  // abort rejects → caught by the caller's .catch → fail-soft.
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 3000);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [event] }),
      signal: ac.signal,
    });
    if (!r.ok) throw new Error(`Meta CAPI ${r.status}: ${await r.text()}`);
  } finally {
    clearTimeout(timer);
  }
}

// Minimal Cookie-header parser (for the _fbp/_fbc Meta match cookies).
function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach(p => {
    const i = p.indexOf('=');
    if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

// --- Turnstile -------------------------------------------------------------

// Verify a Turnstile token with Cloudflare's siteverify endpoint. Fails closed
// (returns false) on a missing token or any error — abuse protection should not
// be bypassable by inducing an error.
async function verifyTurnstile(token, ip) {
  if (!token) return false;
  try {
    const params = new URLSearchParams({
      secret: process.env.TURNSTILE_SECRET_KEY,
      response: token,
    });
    if (ip) params.set('remoteip', String(ip).split(',')[0].trim());
    const resp = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    if (!resp.ok) return false;
    const data = await resp.json();
    return data.success === true;
  } catch (e) {
    console.error('turnstile_verify_failed', e);
    return false;
  }
}
