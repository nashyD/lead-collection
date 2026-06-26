// GET /api/config — PUBLIC. Non-secret client config for the landing pages.
// The Turnstile *site* key is public by design (it ships in the page HTML); the
// matching secret key stays server-side and is used only by /api/lead to verify
// each submission. The Meta (Facebook) Pixel ID is likewise public — it ships in
// the page either way — so it's served here too, as are the GA4 + Google Ads tag
// IDs (likewise public, they ship in the page). All return an empty string when
// unset, so the pages degrade gracefully (no widget, no pixel, no Google tag)
// until the values are configured in Vercel.

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'public, max-age=300');
  return res.status(200).json({
    turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || '',
    metaPixelId: process.env.META_PIXEL_ID || '',
    ga4Id: process.env.GA4_MEASUREMENT_ID || '',
    googleAdsId: process.env.GOOGLE_ADS_CONVERSION_ID || '',
    googleAdsLabel: process.env.GOOGLE_ADS_CONVERSION_LABEL || '',
  });
}
