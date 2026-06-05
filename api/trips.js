// /api/trips — authed (sf_dash_session cookie). Stop-based mileage trips.
//   GET    ?driver=<name>&since=<iso>&limit=<n>   -> { trips: [...] }
//   POST   { driver, lat?, lng? }                 -> start a trip (origin = first stop)
//   PATCH  { id, miles?, last_lat?, last_lng?, stops?, note?, source?, end? }
//   DELETE ?id=<uuid>                             -> remove a trip
//
// Distances are computed client-side (straight-line between recorded stops × a
// road factor); the server just validates and stores the running total. 'driver'
// is a free-text label — the shared office password is the only real auth.

import { requireSession } from '../lib/auth.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MILES = 5000; // sanity cap on a single trip's total
const MAX_STOPS = 1000;

function base() { return `${process.env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/trips`; }
function headers(extra = {}) {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    ...extra,
  };
}

// Coerce to a finite number clamped to [min,max]; undefined if not a number.
function num(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, n));
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
    // ---- GET: list trips (optionally by driver / since) ----
    if (req.method === 'GET') {
      const url = new URL(base());
      url.searchParams.set('select', '*');
      url.searchParams.set('order', 'started_at.desc');
      const driver = String(req.query?.driver || '').trim();
      if (driver) url.searchParams.set('driver', `eq.${driver}`);
      const since = String(req.query?.since || '').trim();
      if (since) url.searchParams.set('started_at', `gte.${since}`);
      const limit = Math.min(parseInt(req.query?.limit, 10) || 500, 2000);
      url.searchParams.set('limit', String(limit));
      const r = await fetch(url, { headers: headers() });
      if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ trips: await r.json() });
    }

    // ---- POST: start a trip (the origin is the first stop) ----
    if (req.method === 'POST') {
      const driver = String(body.driver || '').trim().slice(0, 120);
      if (!driver) return res.status(400).json({ error: 'driver required' });
      const lat = num(body.lat, -90, 90) ?? null;
      const lng = num(body.lng, -180, 180) ?? null;
      const row = {
        driver,
        status: 'active',
        source: 'gps',
        started_at: new Date().toISOString(),
        miles: 0,
        stops: 1,
        start_lat: lat, start_lng: lng,
        last_lat: lat,  last_lng: lng,
      };
      const r = await fetch(base(), {
        method: 'POST',
        headers: headers({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
        body: JSON.stringify(row),
      });
      if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
      const rows = await r.json();
      return res.status(200).json({ trip: rows[0] || null });
    }

    // ---- PATCH: record a stop (new running total + last point) / finish / correct ----
    if (req.method === 'PATCH') {
      const id = String(body.id || '').trim();
      if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid id' });

      const patch = {};
      const miles = num(body.miles, 0, MAX_MILES);
      if (miles !== undefined) patch.miles = miles;
      const llat = num(body.last_lat, -90, 90);   if (llat !== undefined) patch.last_lat = llat;
      const llng = num(body.last_lng, -180, 180);  if (llng !== undefined) patch.last_lng = llng;
      if (Number.isFinite(Number(body.stops))) patch.stops = Math.min(MAX_STOPS, Math.max(1, Math.round(Number(body.stops))));
      if (typeof body.note === 'string') patch.note = body.note.slice(0, 500);
      if (body.source === 'manual' || body.source === 'gps') patch.source = body.source;
      if (body.end) {
        patch.status = 'completed';
        patch.ended_at = new Date().toISOString();
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
      return res.status(200).json({ trip: rows[0] || null });
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
    console.error('trips_error', e);
    return res.status(502).json({ error: 'Trips request failed' });
  }
}
