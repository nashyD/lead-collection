// DELETE /api/lead-delete?id=<uuid>   (POST with { id } also accepted)
//   Auth: requires sf_dash_session cookie. Permanently removes one lead.

import { requireSession } from '../lib/auth.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req, res) {
  if (req.method !== 'DELETE' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireSession(req, res)) return;

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  // id from query string first, then JSON body as a fallback.
  let id = req.query?.id;
  if (!id) {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    id = body?.id;
  }
  id = String(id || '').trim();
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid id' });

  const url = new URL(`${process.env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/leads`);
  url.searchParams.set('id', `eq.${id}`);

  const resp = await fetch(url, {
    method: 'DELETE',
    headers: {
      'apikey':        process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Prefer':        'return=representation',
    },
  });
  if (!resp.ok) {
    const text = await resp.text();
    console.error('supabase_delete_failed', resp.status, text);
    return res.status(502).json({ error: 'Failed to delete lead' });
  }
  const rows = await resp.json();
  return res.status(200).json({ deleted: rows.length, id });
}
