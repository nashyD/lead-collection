// GET /api/config — PUBLIC. Non-secret client config for the landing page.
// The Turnstile *site* key is public by design (it ships in the page HTML); the
// matching secret key stays server-side and is used only by /api/lead to verify
// each submission. Returns an empty string when unset, so the form degrades
// gracefully (no widget) until the key is configured in Vercel.

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'public, max-age=300');
  return res.status(200).json({ turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || '' });
}
