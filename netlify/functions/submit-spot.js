const ALLOWED_ORIGIN = 'https://portfc-on-tour.com';
const CORS_HEADERS = { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };

// Very small first line of defense against obvious spam/abuse — this is
// not a replacement for the human-in-the-loop moderation Lukas should
// still do in Airtable before treating submissions as fully trustworthy.
const URL_PATTERN = /https?:\/\/|www\./i;
const MAX_LEN = { name: 60, city: 100, ig: 40 };

function clean(str, maxLen) {
  return String(str || '').trim().slice(0, maxLen);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: 'Method Not Allowed' };
  }

  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID } = process.env;

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Airtable not configured' }) };
  }

  try {
    const body = JSON.parse(event.body);

    // Honeypot: a real browser never fills this hidden field in; a bot
    // filling every input on the form will.
    if (body.website) {
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ ok: true }) };
    }

    const name = clean(body.name, MAX_LEN.name);
    const city = clean(body.city, MAX_LEN.city);
    const ig = clean(body.ig, MAX_LEN.ig);

    if (!name) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Name required' }) };
    }
    if (URL_PATTERN.test(name) || URL_PATTERN.test(city)) {
      return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Links are not allowed in name/city' }) };
    }

    const lat = body.lat !== undefined && body.lat !== null && body.lat !== '' ? parseFloat(body.lat) : null;
    const lng = body.lng !== undefined && body.lng !== null && body.lng !== '' ? parseFloat(body.lng) : null;
    const safeLat = (lat !== null && Number.isFinite(lat) && lat >= -90 && lat <= 90) ? lat : null;
    const safeLng = (lng !== null && Number.isFinite(lng) && lng >= -180 && lng <= 180) ? lng : null;

    const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Sightings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: {
          Name: name,
          City: city,
          Instagram: ig,
          'Photo URL': clean(body.photoUrl, 500),
          Latitude: safeLat,
          Longitude: safeLng,
          'Submitted At': new Date().toISOString()
        },
        typecast: true
      })
    });

    const data = await res.json();
    return {
      statusCode: res.ok ? 200 : res.status,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      body: JSON.stringify(data)
    };
  } catch (err) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
