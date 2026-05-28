// GET /api/leads
//   Auth: requires sf_dash_session cookie (set by /api/dashboard-login).
//   Query: ?status=new|contacted|quoted|bound|lost   (optional)
//          ?limit=200                                (default 500, max 1000)
//   Returns: { leads: [...] }

import { requireSession } from '../lib/auth.js';

const ALLOWED_STATUS = new Set(['new', 'contacted', 'quoted', 'bound', 'lost']);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireSession(req, res)) return;

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const url = new URL(`${process.env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/leads`);
  url.searchParams.set('select', '*');
  url.searchParams.set('order', 'created_at.desc');

  const status = req.query?.status;
  if (status && ALLOWED_STATUS.has(String(status))) {
    url.searchParams.set('status', `eq.${status}`);
  }

  const limit = Math.min(parseInt(req.query?.limit, 10) || 500, 1000);
  url.searchParams.set('limit', String(limit));

  const resp = await fetch(url, {
    headers: {
      'apikey':        process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });
  if (!resp.ok) {
    const text = await resp.text();
    console.error('supabase_select_failed', resp.status, text);
    return res.status(502).json({ error: 'Failed to fetch leads' });
  }
  const leads = await resp.json();

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ leads });
}
