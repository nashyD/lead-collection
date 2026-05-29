// /api/lead — Vercel serverless function
// Receives form submissions from the landing page, persists to Supabase, and sends two
// emails via MailerSend: a confirmation to the lead and a notification to the office. Each
// step is independent and fail-soft — a failure in one never blocks the others.
//
// Env vars (email is skipped if its vars are missing):
//   SUPABASE_URL                 e.g. https://abcd.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY    server-only key — never expose to the browser
//   MAILERSEND_API_KEY           from mailersend.com (free tier: 3,000 emails/mo)
//   FROM_EMAIL                   e.g. leads@gallantrenters.com (must be a domain verified in MailerSend)
//
// Office notification recipients are managed from the dashboard Settings panel and stored
// in the Supabase `settings` table (key = notify_emails). No env var needed for them.

const OFFICE_PHONE = '(704) 853-8001';
const FROM_NAME = 'Anthony Gallant State Farm';

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

  const firstName = String(body.firstName || '').trim().slice(0, 80);
  const phoneRaw  = String(body.phone || '').trim().slice(0, 40);
  const email     = String(body.email || '').trim().toLowerCase().slice(0, 200);

  if (!firstName || !phoneRaw || !email) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!/.+@.+\..+/.test(email)) {
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

  const lead = {
    firstName,
    phone: phoneE164,
    email,
    source,
    medium,
    campaign,
    receivedAt: new Date().toISOString(),
    userAgent: req.headers['user-agent'] || '',
    ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '',
  };

  // ALWAYS log so we can see it in Vercel function logs even if no integrations set.
  console.log('NEW_LEAD', JSON.stringify(lead));

  // Persist to Supabase first (so the dashboard always sees the lead). Fail-soft.
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      await saveLeadToSupabase(lead);
    } catch (e) {
      console.error('supabase_insert_failed', e);
    }
  }

  // Email notifications via MailerSend. Both are independent and fail-soft.
  if (process.env.MAILERSEND_API_KEY && process.env.FROM_EMAIL) {
    await Promise.all([
      // 1) Confirmation to the lead.
      emailLeadConfirmation(lead).catch(e => console.error('email_lead_confirmation_failed', e)),
      // 2) Notification to the office recipient list (managed in the dashboard).
      getNotifyRecipients()
        .then(recips => recips.length
          ? emailOffice(lead, recips)
          : console.log('no_notify_recipients_configured'))
        .catch(e => console.error('email_office_failed', e)),
    ]);
  } else {
    console.log('mailersend_not_configured_email_skipped');
  }

  return res.status(200).json({ ok: true });
}

// --- Supabase ---------------------------------------------------------------

async function saveLeadToSupabase(lead) {
  const url = `${process.env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/leads`;
  const row = {
    first_name: lead.firstName,
    phone:      lead.phone,
    email:      lead.email,
    source:     lead.source,
    medium:     lead.medium,
    campaign:   lead.campaign,
    user_agent: lead.userAgent,
    ip:         lead.ip,
  };
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey':        process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!resp.ok) throw new Error(`Supabase ${resp.status}: ${await resp.text()}`);
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

// --- Email (MailerSend) -----------------------------------------------------

async function emailLeadConfirmation(lead) {
  const subject = 'Thanks — we got your renters insurance request';
  const html = `
    <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;color:#111;">
      <p style="font-size:15px;">Hi ${escapeHtml(lead.firstName)},</p>
      <p style="font-size:15px;line-height:1.5;">
        Thanks for requesting a renters insurance quote with
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
  await mailersendSend({ to: [lead.email], subject, html, replyTo: process.env.FROM_EMAIL });
}

async function emailOffice(lead, recipients) {
  const subject = `New renters lead — ${lead.firstName} (${lead.source})`;
  const html = `
    <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:520px;">
      <h2 style="margin:0 0 12px;color:#E22925;">New lead — reach out fast</h2>
      <table style="border-collapse:collapse;width:100%;font-size:14px;">
        <tr><td style="padding:6px 0;color:#666;width:120px;">Name</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(lead.firstName)}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Phone</td><td style="padding:6px 0;font-weight:600;"><a href="sms:${lead.phone}">${lead.phone}</a> · <a href="tel:${lead.phone}">call</a></td></tr>
        <tr><td style="padding:6px 0;color:#666;">Email</td><td style="padding:6px 0;"><a href="mailto:${lead.email}">${escapeHtml(lead.email)}</a></td></tr>
        <tr><td style="padding:6px 0;color:#666;">Source</td><td style="padding:6px 0;">${escapeHtml(lead.source)}${lead.campaign ? ' / ' + escapeHtml(lead.campaign) : ''}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Received</td><td style="padding:6px 0;">${escapeHtml(lead.receivedAt)}</td></tr>
      </table>
      <p style="margin:18px 0 0;color:#666;font-size:12px;">Speed-to-lead matters — aim to reach out within a few minutes.</p>
    </div>`;
  await mailersendSend({ to: recipients, subject, html, replyTo: lead.email });
}

async function mailersendSend({ to, subject, html, replyTo }) {
  // MailerSend expects recipients as [{ email }] and from as { email, name }.
  const recipients = (Array.isArray(to) ? to : [to]).map(email => ({ email }));
  const payload = {
    from: { email: process.env.FROM_EMAIL, name: FROM_NAME },
    to: recipients,
    subject,
    html,
  };
  if (replyTo) payload.reply_to = { email: replyTo };
  const resp = await fetch('https://api.mailersend.com/v1/email', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.MAILERSEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  // MailerSend returns 202 Accepted on success.
  if (!resp.ok) throw new Error(`MailerSend ${resp.status}: ${await resp.text()}`);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
