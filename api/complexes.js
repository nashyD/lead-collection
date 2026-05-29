// /api/complexes — authed (sf_dash_session cookie). Canvassing list management.
//   GET                              -> { complexes: [...] }  (full rows)
//   POST   { name, address?, city? } -> add a complex manually
//   PATCH  { id, canvass_status?, notes?, last_contacted_by?, mark_contacted? }
//   DELETE ?id=<uuid>                -> remove a complex
//
// Per-complex lead counts (the "top complexes by business" ranking) are
// computed client-side in the dashboard by joining /api/leads (which now
// carries complex_id) against this list — no heavy server aggregation needed.

import { requireSession } from '../lib/auth.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = new Set(['not_started', 'flyered', 'contacted', 'declined', 'partner']);

function base() { return `${process.env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/complexes`; }
function headers(extra = {}) {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    ...extra,
  };
}

export default async function handler(req, res) {
  if (!requireSession(req, res)) return;
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  try {
    // ---- GET: full list (newest-contacted handling done client-side) ----
    if (req.method === 'GET') {
      const url = new URL(base());
      url.searchParams.set('select', '*');
      url.searchParams.set('order', 'name.asc');
      url.searchParams.set('limit', '2000');
      const r = await fetch(url, { headers: headers() });
      if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ complexes: await r.json() });
    }

    // ---- POST: add a complex manually ----
    if (req.method === 'POST') {
      const name = String(body.name || '').trim().slice(0, 200);
      if (!name) return res.status(400).json({ error: 'name required' });
      const row = {
        name,
        address: String(body.address || '').slice(0, 300),
        city: String(body.city || '').slice(0, 120),
      };
      const r = await fetch(base(), {
        method: 'POST',
        headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
        body: JSON.stringify(row),
      });
      if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
      const rows = await r.json();
      return res.status(200).json({ complex: rows[0] || null });
    }

    // ---- PATCH: update status / notes / contacted ----
    if (req.method === 'PATCH') {
      const id = String(body.id || '').trim();
      if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid id' });

      const patch = {};
      if (typeof body.canvass_status === 'string') {
        if (!STATUSES.has(body.canvass_status)) return res.status(400).json({ error: 'Invalid status' });
        patch.canvass_status = body.canvass_status;
      }
      if (typeof body.notes === 'string') patch.notes = body.notes.slice(0, 2000);
      if (typeof body.last_contacted_by === 'string') patch.last_contacted_by = body.last_contacted_by.slice(0, 120);
      if (body.mark_contacted) {
        patch.last_contacted_at = new Date().toISOString();
        if (typeof body.last_contacted_by === 'string') patch.last_contacted_by = body.last_contacted_by.slice(0, 120);
      }
      if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nothing to update' });

      const url = new URL(base());
      url.searchParams.set('id', `eq.${id}`);
      const r = await fetch(url, {
        method: 'PATCH',
        headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
        body: JSON.stringify(patch),
      });
      if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
      const rows = await r.json();
      return res.status(200).json({ complex: rows[0] || null });
    }

    // ---- DELETE ----
    if (req.method === 'DELETE') {
      const id = String(req.query?.id || body.id || '').trim();
      if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid id' });
      const url = new URL(base());
      url.searchParams.set('id', `eq.${id}`);
      const r = await fetch(url, { method: 'DELETE', headers: headers({ Prefer: 'return=minimal' }) });
      if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    console.error('complexes_error', e);
    return res.status(502).json({ error: 'Complexes request failed' });
  }
}
