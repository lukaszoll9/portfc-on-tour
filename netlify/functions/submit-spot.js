// Saves a new sticker spot to Airtable.
// The page uploads the photo to Cloudinary first and sends the resulting URL here.
// Spots appear on the map straight away; hide unwanted ones via /admin or the
// "Hidden" checkbox in Airtable.

const URL_PATTERN = /https?:\/\/|www\./i;
const MAX_LEN = { name: 60, city: 120, ig: 40 };
const clean = (str, maxLen) => String(str || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, maxLen);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method Not Allowed' });

  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID } = process.env;
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) return json(500, { error: 'Airtable not configured' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'Invalid JSON' }); }

  // Honeypot: real visitors never fill this hidden field in.
  if (body.website) return json(200, { ok: true, id: 'ignored' });

  const name = clean(body.name, MAX_LEN.name);
  const city = clean(body.city, MAX_LEN.city);
  let ig = clean(body.ig, MAX_LEN.ig).replace(/\s+/g, '');
  if (ig && !ig.startsWith('@')) ig = '@' + ig;
  const photoUrl = clean(body.photoUrl, 500);

  if (!name) return json(400, { error: 'Name required' });
  if (URL_PATTERN.test(name) || URL_PATTERN.test(city) || URL_PATTERN.test(ig)) return json(400, { error: 'Links are not allowed' });
  if (photoUrl && !/^https:\/\/res\.cloudinary\.com\//.test(photoUrl)) return json(400, { error: 'Unexpected photo host' });

  const toNum = v => (v === undefined || v === null || v === '' ? null : Number(v));
  const lat = toNum(body.lat), lng = toNum(body.lng);
  const safeLat = Number.isFinite(lat) && lat >= -90 && lat <= 90 ? Math.round(lat * 1e5) / 1e5 : null;
  const safeLng = Number.isFinite(lng) && lng >= -180 && lng <= 180 ? Math.round(lng * 1e5) / 1e5 : null;

  try {
    const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Sightings`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          Name: name,
          City: city,
          Instagram: ig,
          'Photo URL': photoUrl,
          Latitude: safeLat,
          Longitude: safeLng,
          'Submitted At': new Date().toISOString()
        },
        typecast: true
      })
    });
    const data = await res.json();
    if (!res.ok) return json(res.status, { error: (data.error && data.error.message) || 'Airtable error' });
    return json(200, { ok: true, id: data.id });
  } catch (err) {
    return json(500, { error: err.message });
  }
};

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) };
}
