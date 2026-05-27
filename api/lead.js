// /api/lead — Vercel serverless function
// Receives form submissions from the landing page, notifies Anthony, and (optionally)
// sends a confirmation text to the lead. Designed to no-op gracefully if env vars are
// missing so you can deploy first and wire integrations incrementally.
//
// Env vars (all optional; if missing, that channel is skipped):
//   ANTHONY_EMAIL         e.g. anthony.gallant.x9z2@statefarm.com
//   ANTHONY_PHONE         e.g. +17048538001 (E.164)
//   RESEND_API_KEY        from resend.com (free tier: 3,000 emails/mo)
//   FROM_EMAIL            e.g. leads@yourdomain.com (must be a domain verified in Resend)
//   TWILIO_ACCOUNT_SID    from twilio.com
//   TWILIO_AUTH_TOKEN
//   TWILIO_FROM_NUMBER    e.g. +17045550100 (a Twilio number you own)
//   SEND_LEAD_CONFIRMATION  "true" to also text the lead immediately

export default async function handler(req, res) {
  // CORS (in case form is ever hosted on a different domain)
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

  // Normalize US phone to E.164 (+1XXXXXXXXXX). Twilio is strict about format.
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

  // Fan out notifications in parallel. Don't let any one failure block the others.
  const tasks = [];
  if (process.env.RESEND_API_KEY && process.env.ANTHONY_EMAIL && process.env.FROM_EMAIL) {
    tasks.push(emailAnthony(lead).catch(e => console.error('email_anthony_failed', e)));
  }
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER && process.env.ANTHONY_PHONE) {
    tasks.push(smsAnthony(lead).catch(e => console.error('sms_anthony_failed', e)));
    if (process.env.SEND_LEAD_CONFIRMATION === 'true') {
      tasks.push(smsLead(lead).catch(e => console.error('sms_lead_failed', e)));
    }
  }
  await Promise.all(tasks);

  return res.status(200).json({ ok: true });
}

// --- Notification helpers ---------------------------------------------------

async function emailAnthony(lead) {
  const subject = `New renters insurance lead — ${lead.firstName} (${lead.source})`;
  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 520px;">
      <h2 style="margin:0 0 12px;color:#E22925;">New lead — text within 5 minutes</h2>
      <table style="border-collapse:collapse;width:100%;font-size:14px;">
        <tr><td style="padding:6px 0;color:#666;width:120px;">Name</td><td style="padding:6px 0;font-weight:600;">${escapeHtml(lead.firstName)}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Phone</td><td style="padding:6px 0;font-weight:600;"><a href="sms:${lead.phone}">${lead.phone}</a> · <a href="tel:${lead.phone}">call</a></td></tr>
        <tr><td style="padding:6px 0;color:#666;">Email</td><td style="padding:6px 0;"><a href="mailto:${lead.email}">${escapeHtml(lead.email)}</a></td></tr>
        <tr><td style="padding:6px 0;color:#666;">Source</td><td style="padding:6px 0;">${escapeHtml(lead.source)}${lead.campaign ? ' / ' + escapeHtml(lead.campaign) : ''}</td></tr>
        <tr><td style="padding:6px 0;color:#666;">Received</td><td style="padding:6px 0;">${escapeHtml(lead.receivedAt)}</td></tr>
      </table>
      <p style="margin:18px 0 0;color:#666;font-size:12px;">Speed-to-lead matters. Aim to reach out within 5 minutes.</p>
    </div>`;
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.FROM_EMAIL,
      to: [process.env.ANTHONY_EMAIL],
      subject,
      html,
      reply_to: lead.email,
    }),
  });
  if (!resp.ok) throw new Error(`Resend ${resp.status}: ${await resp.text()}`);
}

async function smsAnthony(lead) {
  const body = `🚨 New lead (${lead.source}): ${lead.firstName} · ${lead.phone} · ${lead.email}. Text within 5 min.`;
  await twilioSend(process.env.ANTHONY_PHONE, body);
}

async function smsLead(lead) {
  const body = `Hi ${lead.firstName}, this is Anthony Gallant's office at State Farm. Thanks for requesting a renters insurance quote — Anthony will text you personally within 5 minutes. Reply STOP to opt out.`;
  await twilioSend(lead.phone, body);
}

async function twilioSend(to, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const auth = Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
  const params = new URLSearchParams({
    To: to,
    From: process.env.TWILIO_FROM_NUMBER,
    Body: body,
  });
  const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  if (!resp.ok) throw new Error(`Twilio ${resp.status}: ${await resp.text()}`);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
