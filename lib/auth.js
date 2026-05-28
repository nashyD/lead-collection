// Stateless HMAC session cookie for the dashboard.
//
// Issued cookie value: "<expEpochSeconds>.<base64urlHmacSha256>"
// The HMAC covers the expiration timestamp signed with DASHBOARD_SESSION_SECRET.
// No server-side state — verifying just recomputes the HMAC and checks the timestamp.

import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'sf_dash_session';
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sign(secret, payload) {
  return b64url(createHmac('sha256', secret).update(payload).digest());
}

export function issueToken(secret, ttlSeconds = DEFAULT_TTL_SECONDS) {
  if (!secret) throw new Error('DASHBOARD_SESSION_SECRET not set');
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = sign(secret, String(exp));
  return `${exp}.${sig}`;
}

export function verifyToken(secret, token) {
  if (!secret || typeof token !== 'string') return false;
  const dot = token.indexOf('.');
  if (dot < 1) return false;
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!/^\d+$/.test(exp)) return false;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return false;

  const expected = sign(secret, exp);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function parseCookies(req) {
  const header = req.headers?.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

export function getSessionToken(req) {
  return parseCookies(req)[COOKIE_NAME] || null;
}

export function buildSessionCookie(value, { maxAge = DEFAULT_TTL_SECONDS, clear = false } = {}) {
  const parts = [
    `${COOKIE_NAME}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Secure',
  ];
  parts.push(`Max-Age=${clear ? 0 : maxAge}`);
  return parts.join('; ');
}

export function requireSession(req, res) {
  const secret = process.env.DASHBOARD_SESSION_SECRET;
  const token = getSessionToken(req);
  if (!verifyToken(secret, token)) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
