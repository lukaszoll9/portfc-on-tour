/* Port FC on Tour — shared geo + data helpers (used by the site and /admin) */
(function () {
  const HOME = { lat: 13.7150, lng: 100.5597, name: "PAT Stadium, Khlong Toei" };
  const CDN = {
    world: "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json",
    ofm: "https://tiles.openfreemap.org/planet",
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf"
  };

  /* ---------- distance & routes ---------- */
  const R = 6371.0088, rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
  function km(a, b) {
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  // Points along the great circle, longitudes unwrapped so lines never jump across the dateline
  function greatCircle(a, b, n = 64) {
    const φ1 = rad(a.lat), λ1 = rad(a.lng), φ2 = rad(b.lat), λ2 = rad(b.lng);
    const d = 2 * Math.asin(Math.sqrt(Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2));
    if (d < 1e-6) return [[a.lng, a.lat], [b.lng, b.lat]];
    const out = [];
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const f = i / n, A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
      const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
      const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
      const z = A * Math.sin(φ1) + B * Math.sin(φ2);
      let lng = deg(Math.atan2(y, x));
      const lat = deg(Math.atan2(z, Math.sqrt(x * x + y * y)));
      if (prev !== null) { while (lng - prev > 180) lng -= 360; while (lng - prev < -180) lng += 360; }
      prev = lng;
      out.push([lng, lat]);
    }
    return out;
  }

  /* ---------- ISO 6346 container number: PFCU 000013 7 ---------- */
  const LETTER = { A:10,B:12,C:13,D:14,E:15,F:16,G:17,H:18,I:19,J:20,K:21,L:23,M:24,N:25,O:26,P:27,Q:28,R:29,S:30,T:31,U:32,V:34,W:35,X:36,Y:37,Z:38 };
  function containerCode(serial) {
    const s = "PFCU" + String(serial).padStart(6, "0");
    let sum = 0;
    for (let i = 0; i < 10; i++) { const c = s[i]; sum += (LETTER[c] ?? +c) * Math.pow(2, i); }
    const check = (sum % 11) % 10;
    return `PFCU ${s.slice(4)} ${check}`;
  }

  /* ---------- photos: Cloudinary does resizing + HEIC → web format ---------- */
  function photo(url, w, h) {
    if (!url) return "";
    const m = String(url).match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/);
    if (!m) return url;
    const dpr = Math.min(3, Math.max(1, Math.round((window.devicePixelRatio || 1) * 2) / 2));
    const t = ["f_auto", "q_auto", "c_fill", "g_auto", `w_${Math.round(w * dpr)}`];
    if (h) t.push(`h_${Math.round(h * dpr)}`);
    return m[1] + t.join(",") + "/" + m[2].replace(/\.(heic|heif)$/i, ".jpg");
  }

  /* ---------- countries: point-in-polygon on Natural Earth (world-atlas) ---------- */
  const NUM2A2 = {"716":"ZW","894":"ZM","887":"YE","704":"VN","862":"VE","336":"VA","548":"VU","860":"UZ","858":"UY","583":"FM","584":"MH","580":"MP","850":"VI","316":"GU","016":"AS","630":"PR","840":"US","239":"GS","086":"IO","654":"SH","612":"PN","660":"AI","238":"FK","136":"KY","060":"BM","092":"VG","796":"TC","500":"MS","832":"JE","831":"GG","833":"IM","826":"GB","784":"AE","804":"UA","800":"UG","795":"TM","792":"TR","788":"TN","780":"TT","776":"TO","768":"TG","626":"TL","764":"TH","834":"TZ","762":"TJ","158":"TW","760":"SY","756":"CH","752":"SE","748":"SZ","740":"SR","728":"SS","729":"SD","144":"LK","724":"ES","410":"KR","710":"ZA","706":"SO","090":"SB","703":"SK","705":"SI","702":"SG","694":"SL","690":"SC","688":"RS","686":"SN","682":"SA","678":"ST","674":"SM","882":"WS","670":"VC","662":"LC","659":"KN","646":"RW","643":"RU","642":"RO","634":"QA","620":"PT","616":"PL","608":"PH","604":"PE","600":"PY","598":"PG","591":"PA","585":"PW","586":"PK","512":"OM","578":"NO","408":"KP","566":"NG","562":"NE","558":"NI","554":"NZ","570":"NU","184":"CK","528":"NL","533":"AW","531":"CW","524":"NP","520":"NR","516":"NA","508":"MZ","504":"MA","732":"EH","499":"ME","496":"MN","498":"MD","492":"MC","484":"MX","480":"MU","478":"MR","470":"MT","466":"ML","462":"MV","458":"MY","454":"MW","450":"MG","807":"MK","442":"LU","440":"LT","438":"LI","434":"LY","430":"LR","426":"LS","422":"LB","428":"LV","418":"LA","417":"KG","414":"KW","296":"KI","404":"KE","398":"KZ","400":"JO","392":"JP","388":"JM","380":"IT","376":"IL","275":"PS","372":"IE","368":"IQ","364":"IR","360":"ID","356":"IN","352":"IS","348":"HU","340":"HN","332":"HT","328":"GY","624":"GW","324":"GN","320":"GT","308":"GD","300":"GR","288":"GH","276":"DE","268":"GE","270":"GM","266":"GA","250":"FR","666":"PM","876":"WF","663":"MF","652":"BL","258":"PF","540":"NC","260":"TF","248":"AX","246":"FI","242":"FJ","231":"ET","233":"EE","232":"ER","226":"GQ","222":"SV","818":"EG","218":"EC","214":"DO","212":"DM","262":"DJ","304":"GL","234":"FO","208":"DK","203":"CZ","196":"CY","192":"CU","191":"HR","384":"CI","188":"CR","180":"CD","178":"CG","174":"KM","170":"CO","156":"CN","446":"MO","344":"HK","152":"CL","148":"TD","140":"CF","132":"CV","124":"CA","120":"CM","116":"KH","104":"MM","108":"BI","854":"BF","100":"BG","096":"BN","076":"BR","072":"BW","070":"BA","068":"BO","064":"BT","204":"BJ","084":"BZ","056":"BE","112":"BY","052":"BB","050":"BD","048":"BH","044":"BS","031":"AZ","040":"AT","036":"AU","334":"HM","574":"NF","051":"AM","032":"AR","028":"AG","024":"AO","020":"AD","012":"DZ","008":"AL","004":"AF","010":"AQ","534":"SX"};
  let world = null, worldPromise = null;
  function loadWorld() {
    if (worldPromise) return worldPromise;
    worldPromise = fetch(CDN.world).then(r => r.json()).then(topo => {
      const fc = window.topojson.feature(topo, topo.objects.countries);
      fc.features.forEach(f => { f.properties.a2 = NUM2A2[f.id] || ""; f.bbox = bbox(f.geometry); });
      world = fc;
      return fc;
    }).catch(() => null);
    return worldPromise;
  }
  function bbox(g) {
    let a = 180, b = 90, c = -180, d = -90;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    polys.forEach(p => p[0].forEach(([x, y]) => { if (x < a) a = x; if (y < b) b = y; if (x > c) c = x; if (y > d) d = y; }));
    return [a, b, c, d];
  }
  function inRing(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function countryAt(lat, lng) {
    if (!world || lat == null || lng == null) return null;
    let best = null, bestD = 0.35; // fall back to the nearest coast within ~35 km for harbour/beach finds
    for (const f of world.features) {
      const [a, b, c, d] = f.bbox;
      const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
      if (lng >= a && lng <= c && lat >= b && lat <= d) {
        for (const p of polys) if (inRing(lng, lat, p[0]) && !p.slice(1).some(h => inRing(lng, lat, h))) return { a2: f.properties.a2, name: f.properties.name };
      }
      if (lng >= a - bestD && lng <= c + bestD && lat >= b - bestD && lat <= d + bestD) {
        for (const p of polys) for (const [x, y] of p[0]) { const dd = Math.hypot(x - lng, y - lat); if (dd < bestD) { bestD = dd; best = { a2: f.properties.a2, name: f.properties.name }; } }
      }
    }
    return best;
  }
  function countryName(a2, lang, fallback) {
    try { if (a2) return new Intl.DisplayNames([lang], { type: "region" }).of(a2); } catch (e) {}
    return fallback || a2 || "";
  }

  /* ---------- geocoding: Photon (komoot) with Nominatim fallback ---------- */
  const PLACE_TYPES = new Set(["city", "town", "village", "hamlet", "locality", "municipality", "suburb", "district"]);
  function photonLang(lang) { return lang === "de" ? "de" : "en"; }
  async function search(q, lang, near) {
    const u = new URL("https://photon.komoot.io/api/");
    u.searchParams.set("q", q); u.searchParams.set("limit", "6"); u.searchParams.set("lang", photonLang(lang));
    if (near) { u.searchParams.set("lat", near.lat.toFixed(3)); u.searchParams.set("lon", near.lng.toFixed(3)); }
    const r = await fetch(u); if (!r.ok) throw new Error("search");
    const j = await r.json();
    return (j.features || []).map(f => {
      const p = f.properties, [lng, lat] = f.geometry.coordinates;
      const sub = [p.street, p.city && p.city !== p.name ? p.city : null, p.state, p.country].filter(Boolean).join(", ");
      const isArea = PLACE_TYPES.has(p.type) || p.osm_key === "place" || p.type === "state" || p.type === "country";
      return { name: p.name || p.city || p.country, sub, lat, lng, zoom: p.type === "country" ? 5 : p.type === "state" ? 7 : isArea ? 12 : 17 };
    });
  }
  async function reverse(lat, lng) {
    try {
      const u = `https://photon.komoot.io/reverse?lat=${lat.toFixed(5)}&lon=${lng.toFixed(5)}&lang=en&limit=1`;
      const r = await fetch(u); const j = await r.json(); const p = j.features && j.features[0] && j.features[0].properties;
      if (p) {
        const locality = PLACE_TYPES.has(p.type) && p.type !== "suburb" && p.type !== "district" ? p.name : (p.city || p.town || p.village || p.county || p.state || p.name);
        return { city: locality || "", country: p.country || "", cc: (p.countrycode || "").toUpperCase() };
      }
    } catch (e) {}
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10&accept-language=en`);
      const j = await r.json(); const a = j.address || {};
      return { city: a.city || a.town || a.village || a.municipality || a.county || a.state || "", country: a.country || "", cc: (a.country_code || "").toUpperCase() };
    } catch (e) {}
    return null;
  }

  /* ---------- normalise raw spots from the API ---------- */
  function normalize(raw, lang) {
    const list = (raw || []).map(s => {
      const hasPos = typeof s.lat === "number" && typeof s.lng === "number" && isFinite(s.lat) && isFinite(s.lng);
      const cityRaw = String(s.city || "").trim();
      const parts = cityRaw.split(",").map(x => x.trim()).filter(Boolean);
      const c = hasPos ? countryAt(s.lat, s.lng) : null;
      const cityOnly = parts.length > 1 ? parts.slice(0, -1).join(", ") : (parts[0] || "");
      const countryTxt = parts.length > 1 ? parts[parts.length - 1] : "";
      return {
        id: s.id, name: String(s.name || "").trim() || "Fan", ig: String(s.ig || "").trim().replace(/^@?/, s.ig ? "@" : ""),
        city: cityOnly || cityRaw, cityRaw,
        cc: c ? c.a2 : "", country: c ? countryName(c.a2, lang, c.name) : countryTxt,
        lat: hasPos ? s.lat : null, lng: hasPos ? s.lng : null, hasPos,
        km: hasPos ? Math.round(km(HOME, { lat: s.lat, lng: s.lng })) : null,
        photoUrl: s.photoUrl || "", time: s.time || null, hidden: !!s.hidden
      };
    });
    list.slice().sort((a, b) => (a.time || "").localeCompare(b.time || "")).forEach((s, i) => { s.serial = i + 1; s.code = containerCode(i + 1); });
    return list.sort((a, b) => (b.time || "").localeCompare(a.time || ""));
  }

  /* ---------- map style: own navy chart + OpenFreeMap vector detail ---------- */
  const C = { ocean: "#0B1A2E", land: "#15294A", land2: "#183053", border: "#2C4C7A", road: "#22406B", road2: "#2E558D", label: "#8FA0BD", label2: "#C6D1E3", park: "#16304C" };
  function style({ globe = true, detail = true } = {}) {
    const name = ["coalesce", ["get", "name:en"], ["get", "name:latin"], ["get", "name"]];
    const s = {
      version: 8,
      projection: { type: globe ? "globe" : "mercator" },
      glyphs: CDN.glyphs,
      sources: {
        world: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
        ofm: { type: "vector", url: CDN.ofm }
      },
      layers: [
        { id: "bg", type: "background", paint: { "background-color": C.ocean } },
        { id: "land", type: "fill", source: "world", paint: { "fill-color": C.land, "fill-antialias": true } },
        { id: "land-edge", type: "line", source: "world", maxzoom: 5, paint: { "line-color": C.border, "line-width": ["interpolate", ["linear"], ["zoom"], 0, .4, 4, 1], "line-opacity": ["interpolate", ["linear"], ["zoom"], 3, 1, 5, 0] } }
      ]
    };
    if (detail) s.layers.push(
      { id: "ofm-landcover", type: "fill", source: "ofm", "source-layer": "landcover", minzoom: 7, filter: ["in", ["get", "class"], ["literal", ["wood", "grass", "farmland"]]], paint: { "fill-color": C.land2, "fill-opacity": .6 } },
      { id: "ofm-park", type: "fill", source: "ofm", "source-layer": "park", minzoom: 9, paint: { "fill-color": C.park, "fill-opacity": .8 } },
      { id: "ofm-water", type: "fill", source: "ofm", "source-layer": "water", minzoom: 3, paint: { "fill-color": C.ocean } },
      { id: "ofm-river", type: "line", source: "ofm", "source-layer": "waterway", minzoom: 8, paint: { "line-color": C.ocean, "line-width": ["interpolate", ["linear"], ["zoom"], 8, .6, 14, 3] } },
      { id: "ofm-building", type: "fill", source: "ofm", "source-layer": "building", minzoom: 14, paint: { "fill-color": "#1C3660", "fill-opacity": .7 } },
      { id: "ofm-road-minor", type: "line", source: "ofm", "source-layer": "transportation", minzoom: 11, filter: ["in", ["get", "class"], ["literal", ["minor", "service", "tertiary", "path", "track"]]], paint: { "line-color": C.road, "line-width": ["interpolate", ["linear"], ["zoom"], 11, .4, 16, 3] } },
      { id: "ofm-road-major", type: "line", source: "ofm", "source-layer": "transportation", minzoom: 5, filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary", "secondary"]]], paint: { "line-color": C.road2, "line-width": ["interpolate", ["linear"], ["zoom"], 5, .4, 10, 1.4, 16, 5] } },
      { id: "ofm-border", type: "line", source: "ofm", "source-layer": "boundary", minzoom: 3, filter: ["all", ["==", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1]], paint: { "line-color": C.border, "line-width": 1, "line-dasharray": [3, 2] } },
      { id: "ofm-place-town", type: "symbol", source: "ofm", "source-layer": "place", minzoom: 8, filter: ["in", ["get", "class"], ["literal", ["town", "village", "suburb"]]], layout: { "text-field": name, "text-font": ["Noto Sans Regular"], "text-size": 11.5 }, paint: { "text-color": C.label, "text-halo-color": C.ocean, "text-halo-width": 1.2 } },
      { id: "ofm-place-city", type: "symbol", source: "ofm", "source-layer": "place", minzoom: 4, filter: ["==", ["get", "class"], "city"], layout: { "text-field": name, "text-font": ["Noto Sans Regular"], "text-size": ["interpolate", ["linear"], ["zoom"], 4, 11, 10, 15] }, paint: { "text-color": C.label2, "text-halo-color": C.ocean, "text-halo-width": 1.4 } },
      { id: "ofm-place-country", type: "symbol", source: "ofm", "source-layer": "place", minzoom: 2.5, maxzoom: 7, filter: ["==", ["get", "class"], "country"], layout: { "text-field": ["upcase", name], "text-font": ["Noto Sans Bold"], "text-size": 11, "text-letter-spacing": .18, "text-max-width": 8 }, paint: { "text-color": "#5E7294", "text-halo-color": C.ocean, "text-halo-width": 1 } }
    );
    return s;
  }
  // Fill the base land layer once Natural Earth has loaded
  function attachWorld(map) {
    loadWorld().then(fc => {
      if (!fc) return;
      const apply = () => { const src = map.getSource("world"); if (src) src.setData(fc); };
      if (map.isStyleLoaded() && map.getSource("world")) apply(); else map.once("load", apply);
    });
  }

  function fmtKm(n, lang) { return new Intl.NumberFormat(lang === "th" ? "th-TH" : lang === "de" ? "de-DE" : "en-US").format(n); }
  function fmtDate(iso, lang) {
    if (!iso) return "";
    const d = new Date(iso), now = new Date();
    const loc = lang === "th" ? "th-TH-u-ca-gregory" : lang === "de" ? "de-DE" : "en-GB";
    return new Intl.DateTimeFormat(loc, { day: "numeric", month: "short", ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) }).format(d);
  }
  function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  window.PFC = { HOME, CDN, km, greatCircle, containerCode, photo, loadWorld, countryAt, countryName, search, reverse, normalize, style, attachWorld, fmtKm, fmtDate, esc };
})();
