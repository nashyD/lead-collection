// PATCH /api/lead-update   { id, status?, notes? }
//   Auth: requires sf_dash_session cookie.
//   At least one of status/notes must be present.

import { requireSession } from '../lib/auth.js';

const ALLOWED_STATUS = new Set(['new', 'contacted', 'quoted', 'bound', 'lost']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (req.method !== 'PATCH' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireSession(req, res)) return;

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  }
  body = body || {};

  const id = String(body.id || '').trim();
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid id' });

  const patch = {};
  if (typeof body.status === 'string') {
    if (!ALLOWED_STATUS.has(body.status)) return res.status(400).json({ error: 'Invalid status' });
    patch.status = body.status;
  }
  if (typeof body.notes === 'string') {
    patch.notes = body.notes.slice(0, 2000);
  }
  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: 'Nothing to update' });
  }

  const url = new URL(`${process.env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/leads`);
  url.searchParams.set('id', `eq.${id}`);

  const resp = await fetch(url, {
    method: 'PATCH',
    headers: {
      'apikey':        process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=representation',
    },
    body: JSON.stringify(patch),
  });
  if (!resp.ok) {
    const text = await resp.text();
    console.error('supabase_update_failed', resp.status, text);
    return res.status(502).json({ error: 'Failed to update lead' });
  }
  const rows = await resp.json();
  return res.status(200).json({ lead: rows[0] || null });
}
