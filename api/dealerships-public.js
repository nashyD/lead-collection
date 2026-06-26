// GET /api/dealerships-public
//   PUBLIC (no auth). Returns [{ id, name, city }] for the /auto page
//   dealership picker. Names/cities are public business info — no canvassing
//   notes ever exposed here. Exact mirror of /api/complexes-public.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    // Fail soft: form still works, the picker is just empty.
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ dealerships: [] });
  }

  const url = new URL(`${process.env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/dealerships`);
  url.searchParams.set('select', 'id,name,city');
  url.searchParams.set('order', 'name.asc');
  url.searchParams.set('limit', '1000');

  try {
    const resp = await fetch(url, {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (!resp.ok) throw new Error(`Supabase ${resp.status}`);
    const dealerships = await resp.json();
    res.setHeader('Cache-Control', 'public, max-age=300');   // 5 min CDN cache
    return res.status(200).json({ dealerships });
  } catch (e) {
    console.error('dealerships_public_failed', e);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ dealerships: [] });  // never break the form
  }
}
