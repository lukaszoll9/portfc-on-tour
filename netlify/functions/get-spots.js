exports.handler = async (event) => {
  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID } = process.env;

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Airtable not configured' }) };
  }

  try {
    const res = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Sightings?sort[0][field]=Time&sort[0][direction]=desc&maxRecords=100`,
      {
        headers: { 'Authorization': `Bearer ${AIRTABLE_TOKEN}` }
      }
    );

    const data = await res.json();
    const spots = (data.records || []).map(r => ({
      id: r.id,
      name: r.fields.Name,
      city: r.fields.City,
      ig: r.fields.Instagram,
      photoUrl: r.fields.PhotoURL,
      lat: r.fields.Lat,
      lng: r.fields.Lng,
      time: r.fields.Time
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(spots)
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
