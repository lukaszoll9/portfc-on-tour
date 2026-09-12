exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  const { AIRTABLE_TOKEN, AIRTABLE_BASE_ID } = process.env;
  if (!AIRTABLE_TOKEN || !AIRTABLE_BASE_ID) return { statusCode: 500, body: '{"error":"not configured"}' };
  try {
    const b = JSON.parse(event.body);
    const res = await fetch('https://api.airtable.com/v0/' + AIRTABLE_BASE_ID + '/Spots', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + AIRTABLE_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { Name: b.name||'', City: b.city||'', Instagram: b.ig||'',
        PhotoURL: b.photoUrl||'', Lat: b.lat?+b.lat:null, Lng: b.lng?+b.lng:null, Time: b.time||new Date().toISOString() }})
    });
    return { statusCode: res.ok?200:res.status,
      headers: {'Content-Type':'application/json','Access-Control-Allow-Origin':'*'},
      body: JSON.stringify(await res.json()) };
  } catch(e) { return { statusCode: 500, body: JSON.stringify({error: e.message}) }; }
};
