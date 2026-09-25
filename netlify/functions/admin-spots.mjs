// Admin API for /admin: list every spot (including hidden ones) and edit
// location, city, name or visibility. Protected by the ADMIN_PASSWORD
// environment variable (Netlify → Project configuration → Environment variables).
import { timingSafeEqual, createHash } from "node:crypto";

const sha = s => createHash("sha256").update(String(s)).digest();
const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" }
});

export default async (req) => {
  const token = Netlify.env.get("AIRTABLE_TOKEN");
  const base = Netlify.env.get("AIRTABLE_BASE_ID");
  const pass = Netlify.env.get("ADMIN_PASSWORD");
  if (!pass) return json(503, { error: "ADMIN_PASSWORD is not set in Netlify yet." });
  if (!token || !base) return json(500, { error: "Airtable not configured" });

  const given = req.headers.get("x-admin-key") || "";
  if (!timingSafeEqual(sha(given), sha(pass))) {
    await new Promise(r => setTimeout(r, 600)); // slow down guessing
    return json(401, { error: "Wrong password" });
  }

  const api = `https://api.airtable.com/v0/${base}/Sightings`;
  const auth = { Authorization: `Bearer ${token}` };

  if (req.method === "GET") {
    const out = [];
    let offset = "";
    for (let i = 0; i < 10; i++) {
      const u = new URL(api);
      u.searchParams.set("pageSize", "100");
      u.searchParams.append("sort[0][field]", "Submitted At");
      u.searchParams.append("sort[0][direction]", "desc");
      if (offset) u.searchParams.set("offset", offset);
      const r = await fetch(u, { headers: auth });
      const d = await r.json();
      if (!r.ok) return json(502, { error: d.error?.message || "Airtable error" });
      out.push(...(d.records || []));
      if (!d.offset) break;
      offset = d.offset;
    }
    return json(200, out.map(r => ({
      id: r.id,
      name: r.fields.Name || "",
      city: r.fields.City || "",
      ig: r.fields.Instagram || "",
      photoUrl: r.fields["Photo URL"] || "",
      lat: r.fields.Latitude ?? null,
      lng: r.fields.Longitude ?? null,
      time: r.fields["Submitted At"] || r.createdTime,
      hidden: !!r.fields.Hidden
    })));
  }

  if (req.method === "PATCH") {
    let b;
    try { b = await req.json(); } catch { return json(400, { error: "Invalid JSON" }); }
    if (!b.id || !/^rec[a-zA-Z0-9]{10,}$/.test(b.id)) return json(400, { error: "Missing record id" });
    const fields = {};
    if (b.name !== undefined) fields.Name = String(b.name).trim().slice(0, 60);
    if (b.city !== undefined) fields.City = String(b.city).trim().slice(0, 120);
    if (b.ig !== undefined) fields.Instagram = String(b.ig).trim().slice(0, 40);
    if (b.lat !== undefined || b.lng !== undefined) {
      const lat = Number(b.lat), lng = Number(b.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return json(400, { error: "Invalid coordinates" });
      fields.Latitude = Math.round(lat * 1e5) / 1e5;
      fields.Longitude = Math.round(lng * 1e5) / 1e5;
    }
    if (b.hidden !== undefined) fields.Hidden = !!b.hidden;
    const r = await fetch(`${api}/${b.id}`, {
      method: "PATCH",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ fields, typecast: true })
    });
    const d = await r.json();
    if (!r.ok) {
      const msg = d.error?.message || "Airtable error";
      const hint = /Hidden/.test(msg) ? " Create a checkbox column called “Hidden” in the Airtable table once." : "";
      return json(r.status, { error: msg + hint });
    }
    return json(200, { ok: true });
  }

  return json(405, { error: "Method not allowed" });
};

export const config = { path: "/api/admin/spots" };
