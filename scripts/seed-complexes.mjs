// One-time seeder: pull Gaston County apartment complexes from the Google
// Places API (New) and insert them into the Supabase `complexes` table.
//
// Run locally (NOT deployed). Re-running is safe: it only INSERTS complexes it
// hasn't seen (dedupe on place_id, on-conflict = do nothing), so it never wipes
// canvassing progress (status/notes/last-contacted) you've entered.
//
// Usage:
//   GOOGLE_PLACES_API_KEY=...  SUPABASE_URL=...  SUPABASE_SERVICE_ROLE_KEY=...  \
//   node scripts/seed-complexes.mjs
//
// Needs Node 18+ (global fetch). Get a Places API (New) key at
// console.cloud.google.com → enable "Places API (New)".

const KEY = process.env.GOOGLE_PLACES_API_KEY;
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!KEY || !SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing env. Need GOOGLE_PLACES_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const CITIES = [
  'Gastonia', 'Belmont', 'Mount Holly', 'Bessemer City', 'Cherryville',
  'Dallas', 'Stanley', 'Lowell', 'McAdenville', 'High Shoals', 'Cramerton',
];
const MAX_PAGES_PER_CITY = 3;            // ~20 results/page
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function searchCity(city) {
  const out = [];
  let pageToken = null;
  for (let page = 0; page < MAX_PAGES_PER_CITY; page++) {
    // The Places API (New) requires paging requests to repeat the original
    // params (textQuery) alongside the pageToken — token-only is rejected.
    const body = { textQuery: `apartments in ${city}, North Carolina` };
    if (pageToken) body.pageToken = pageToken;
    const resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': KEY,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,nextPageToken',
      },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      console.error(`  ${city}: Places ${resp.status}: ${await resp.text()}`);
      break;
    }
    const data = await resp.json();
    for (const p of data.places || []) {
      out.push({
        place_id: p.id,
        name: p.displayName?.text || '',
        address: p.formattedAddress || '',
        city,
        lat: p.location?.latitude ?? null,
        lng: p.location?.longitude ?? null,
      });
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
    await sleep(2000); // let the page token activate
  }
  return out;
}

async function main() {
  console.log('Searching Places API across Gaston County cities…');
  const byId = new Map();
  for (const city of CITIES) {
    const found = await searchCity(city);
    for (const c of found) if (c.place_id && c.name && !byId.has(c.place_id)) byId.set(c.place_id, c);
    console.log(`  ${city}: ${found.length} found (running unique total: ${byId.size})`);
  }

  const rows = [...byId.values()];
  if (rows.length === 0) { console.log('Nothing found — check the API key / billing.'); return; }

  console.log(`\nUpserting ${rows.length} complexes (existing ones left untouched)…`);
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/complexes?on_conflict=place_id`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates,return=representation',
    },
    body: JSON.stringify(rows),
  });
  if (!resp.ok) { console.error(`Supabase ${resp.status}: ${await resp.text()}`); process.exit(1); }
  const inserted = await resp.json();
  console.log(`Done. ${inserted.length} new complexes inserted.`);
  console.log('Sample:');
  for (const c of inserted.slice(0, 8)) console.log(`  • ${c.name} — ${c.address}`);
  console.log('\nReview the list in the dashboard → Complexes tab and delete any non-apartment results.');
}

main().catch(e => { console.error(e); process.exit(1); });
