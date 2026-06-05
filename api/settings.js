// GET  /api/settings  -> { notify_emails: ["a@x.com", ...], mileage_rate: 0.70 }
// POST /api/settings   { notify_emails?: "raw text (commas/newlines ok)", mileage_rate?: number }
//   Auth: requires sf_dash_session cookie. Stores office notification list +
//   the IRS mileage rate used for the mileage-tracker $ estimate.

import { requireSession } from '../lib/auth.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_RATE = 0.70;

function parseEmails(raw) {
  return [...new Set(
    String(raw || '')
      .split(/[\s,;]+/)
      .map(s => s.trim().toLowerCase())
      .filter(e => EMAIL_RE.test(e))
  )];
}

// Dollars per mile: a non-negative number, capped at a sane ceiling. null = invalid.
function parseRate(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(Math.min(10, n) * 1000) / 1000;
}

async function readSetting(key) {
  const url = `${process.env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/settings?key=eq.${encodeURIComponent(key)}&select=value`;
  const resp = await fetch(url, {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!resp.ok) throw new Error(`Supabase ${resp.status}: ${await resp.text()}`);
  const rows = await resp.json();
  return rows[0]?.value || '';
}

async function writeSetting(key, value) {
  // Upsert the single key row.
  const url = `${process.env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/settings?on_conflict=key`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }),
  });
  if (!resp.ok) throw new Error(`Supabase ${resp.status}: ${await resp.text()}`);
}

async function currentRate() {
  const r = parseRate(await readSetting('mileage_rate'));
  return r === null ? DEFAULT_RATE : r;
}

export default async function handler(req, res) {
  if (!requireSession(req, res)) return;

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  try {
    if (req.method === 'GET') {
      const [emailsRaw, rate] = await Promise.all([readSetting('notify_emails'), currentRate()]);
      return res.status(200).json({ notify_emails: parseEmails(emailsRaw), mileage_rate: rate });
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
      body = body || {};

      const out = {};
      if ('notify_emails' in body) {
        const emails = parseEmails(body.notify_emails);
        await writeSetting('notify_emails', emails.join(', '));
        out.notify_emails = emails;
      }
      if ('mileage_rate' in body) {
        const rate = parseRate(body.mileage_rate);
        if (rate === null) return res.status(400).json({ error: 'Invalid mileage rate' });
        await writeSetting('mileage_rate', String(rate));
        out.mileage_rate = rate;
      }
      // Always return the full current settings so the client can refresh both.
      if (!('notify_emails' in out)) out.notify_emails = parseEmails(await readSetting('notify_emails'));
      if (!('mileage_rate' in out)) out.mileage_rate = await currentRate();
      return res.status(200).json(out);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('settings_error', e);
    return res.status(502).json({ error: 'Settings request failed' });
  }
}
