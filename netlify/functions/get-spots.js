// Public list of sticker spots for the map.
// Reads the Airtable "Sightings" table, drops hidden/empty rows and returns a
// small JSON array. Responses are cached at Netlify's CDN for a minute so a
// busy day doesn't burn through function invocations or Airtable's rate limit.

exports.handler = async () => {
  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID } = process.env;
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    return json(500, { error: 'Airtable not configured' });
  }

  try {
    const records = [];
    let offset = '';
    // Airtable pages at 100 rows; follow the offset up to 1,000 spots.
    for (let page = 0; page < 10; page++) {
      const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Sightings`);
      url.searchParams.set('pageSize', '100');
      url.searchParams.append('sort[0][field]', 'Submitted At');
      url.searchParams.append('sort[0][direction]', 'desc');
      if (offset) url.searchParams.set('offset', offset);
      const res = await fetch(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
      const data = await res.json();
      if (!res.ok) return json(502, { error: (data.error && data.error.message) || 'Airtable error' });
      records.push(...(data.records || []));
      if (!data.offset) break;
      offset = data.offset;
    }

    const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : (v !== undefined && v !== null && v !== '' && Number.isFinite(parseFloat(v)) ? parseFloat(v) : undefined));
    const spots = records
      // Opt-out moderation: tick the "Hidden" checkbox in Airtable (or use /admin) to remove a spot.
      .filter(r => !r.fields.Hidden)
      .filter(r => r.fields.Name || r.fields.City)
      .map(r => ({
        id: r.id,
        name: String(r.fields.Name || '').trim(),
        city: String(r.fields.City || '').trim(),
        ig: String(r.fields.Instagram || '').trim(),
        photoUrl: r.fields['Photo URL'] || '',
        lat: num(r.fields.Latitude),
        lng: num(r.fields.Longitude),
        time: r.fields['Submitted At'] || r.createdTime
      }));

    return json(200, spots, {
      'Cache-Control': 'public, max-age=30',
      'Netlify-CDN-Cache-Control': 'public, durable, s-maxage=60, stale-while-revalidate=600'
    });
  } catch (err) {
    return json(500, { error: err.message });
  }
};

function json(statusCode, body, headers = {}) {
  return { statusCode, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) };
}
