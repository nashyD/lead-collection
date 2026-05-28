// GET  /api/settings  -> { notify_emails: ["a@x.com", ...] }
// POST /api/settings   { notify_emails: "raw text (commas/newlines ok)" }
//   Auth: requires sf_dash_session cookie. Stores the office notification list.

import { requireSession } from '../lib/auth.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseEmails(raw) {
  return [...new Set(
    String(raw || '')
      .split(/[\s,;]+/)
      .map(s => s.trim().toLowerCase())
      .filter(e => EMAIL_RE.test(e))
  )];
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

export default async function handler(req, res) {
  if (!requireSession(req, res)) return;

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  try {
    if (req.method === 'GET') {
      const raw = await readSetting('notify_emails');
      return res.status(200).json({ notify_emails: parseEmails(raw) });
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
      const emails = parseEmails(body?.notify_emails);
      await writeSetting('notify_emails', emails.join(', '));
      return res.status(200).json({ notify_emails: emails });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('settings_error', e);
    return res.status(502).json({ error: 'Settings request failed' });
  }
}
