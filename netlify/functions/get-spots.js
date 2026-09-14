const ALLOWED_ORIGIN = 'https://portfc-on-tour.com';
const CORS_HEADERS = { 'Access-Control-Allow-Origin': ALLOWED_ORIGIN };

exports.handler = async (event) => {
  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID } = process.env;

  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Airtable not configured' }) };
  }

  try {
    const res = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Sightings?sort%5B0%5D%5Bfield%5D=Submitted+At&sort%5B0%5D%5Bdirection%5D=desc&maxRecords=100`,
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
      photoUrl: r.fields['Photo URL'],
      lat: r.fields.Latitude,
      lng: r.fields.Longitude,
      time: r.fields['Submitted At']
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      body: JSON.stringify(spots)
    };
  } catch (err) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message }) };
  }
};
