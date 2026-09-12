exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID } = process.env;

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Airtable not configured' }) };
  }

  try {
    const body = JSON.parse(event.body);
    const res = await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Sightings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AIRTABLE_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fields: {
          Name: body.name || '',
          City: body.city || '',
          Instagram: body.ig || '',
          PhotoURL: body.photoUrl || '',
          Lat: body.lat ? parseFloat(body.lat) : null,
          Lng: body.lng ? parseFloat(body.lng) : null,
          Time: body.time || new Date().toISOString()
        },
        typecast: true
      })
    });

    const data = await res.json();
    return {
      statusCode: res.ok ? 200 : res.status,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(data)
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
