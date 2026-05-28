// POST /api/dashboard-login  { password }
//   -> Set-Cookie: sf_dash_session=<hmac>; HttpOnly; Secure; SameSite=Strict
// POST /api/dashboard-login  { logout: true }
//   -> clears the cookie

import { timingSafeEqual } from 'node:crypto';
import { issueToken, buildSessionCookie } from '../lib/auth.js';

const FAIL_DELAY_MS = 400; // crude rate-limit/timing-attack shim

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  }
  body = body || {};

  if (body.logout) {
    res.setHeader('Set-Cookie', buildSessionCookie('', { clear: true }));
    return res.status(200).json({ ok: true });
  }

  const expected = process.env.DASHBOARD_PASSWORD || '';
  const provided = String(body.password || '');

  if (!expected) {
    return res.status(500).json({ error: 'Dashboard password not configured on server' });
  }

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  const ok = a.length === b.length && timingSafeEqual(a, b);

  if (!ok) {
    await new Promise(r => setTimeout(r, FAIL_DELAY_MS));
    return res.status(401).json({ error: 'Wrong password' });
  }

  const secret = process.env.DASHBOARD_SESSION_SECRET;
  if (!secret) {
    return res.status(500).json({ error: 'Session secret not configured on server' });
  }

  const token = issueToken(secret);
  res.setHeader('Set-Cookie', buildSessionCookie(token));
  return res.status(200).json({ ok: true });
}
