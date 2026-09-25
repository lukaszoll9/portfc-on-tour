/* ==========================================================
   PORT FC ON TOUR — main page
   ========================================================== */
(function () {
  "use strict";
  const P = window.PFC, I18N = window.PFC_I18N;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = P.esc;
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const CONFIG = {
    spotsUrl: "/.netlify/functions/get-spots",
    submitUrl: "/.netlify/functions/submit-spot",
    cloudinary: { url: "https://api.cloudinary.com/v1_1/nwrw8zei/image/upload", preset: "portfc_sightings" },
    formspree: "https://formspree.io/f/xwlewgne",
    exifr: "https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/lite.umd.js",
    igPosts: [
      "https://www.instagram.com/p/DcgE7NoKJ_P/",
      "https://www.instagram.com/p/DdWZNckiYmS/",
      "https://www.instagram.com/p/DdgyDpxmlD_/"
    ],
    site: "https://portfc-on-tour.com"
  };

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  /* ======================= i18n ======================= */
  let lang = store.get("portfc_lang") || ((navigator.language || "en").slice(0, 2).toLowerCase());
  if (!I18N[lang]) lang = "en";
  function t(key, vars) {
    let s = (I18N[lang] && I18N[lang][key]) ?? I18N.en[key] ?? key;
    if (vars) for (const k in vars) s = s.replace("{" + k + "}", vars[k]);
    return s;
  }
  function applyLang() {
    document.documentElement.lang = lang;
    document.title = t("meta_title");
    $$("[data-i18n]").forEach(el => { el.innerHTML = t(el.dataset.i18n); });
    $$("[data-i18n-ph]").forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
    $$(".lang button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
  }
  $$(".lang button").forEach(b => b.addEventListener("click", () => {
    if (b.dataset.lang === lang) return;
    lang = b.dataset.lang; store.set("portfc_lang", lang);
    applyLang();
    if (rawSpots) { spots = P.normalize(rawSpots, lang); mergeLocal(); renderAll(false); }
    if (openSpot) fillSpotSheet(spots.find(s => s.id === openSpot.id) || openSpot);
  }));

  /* ======================= helpers ======================= */
  function toast(msg) {
    const el = $("#toast"); el.textContent = msg; el.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove("show"), 2200);
  }
  function kmLabel(s) {
    if (s.km == null) return "";
    return s.km < 30 ? t("at_home") : t("km_from_home", { km: P.fmtKm(s.km, lang) });
  }
  function placeLabel(s) { return s.city || s.cityRaw || t("geo_unknown"); }
  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.async = true; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  }
  async function copyText(text, okMsg) {
    try { await navigator.clipboard.writeText(text); toast(okMsg || t("copied")); }
    catch (e) { window.prompt("", text); }
  }

  /* ======================= layers + history (back button closes sheets/map) ======================= */
  const layers = [];
  function pushLayer(name, close) { layers.push({ name, close }); history.pushState({ pfc: name }, ""); syncChrome(); }
  function closeTop() { if (layers.length) history.back(); }
  window.addEventListener("popstate", () => { const l = layers.pop(); if (l) l.close(); syncChrome(); });
  function syncChrome() {
    const anySheet = layers.some(l => l.name !== "map");
    const scrim = $("#scrim");
    if (anySheet) { scrim.hidden = false; requestAnimationFrame(() => scrim.classList.add("show")); }
    else { scrim.classList.remove("show"); setTimeout(() => { if (!layers.some(l => l.name !== "map")) scrim.hidden = true; }, 250); }
    document.body.style.overflow = layers.length ? "hidden" : "";
    updateDock();
  }
  $("#scrim").addEventListener("click", closeTop);
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeTop(); });

  function showSheet(el) { el.hidden = false; requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("show"))); }
  function hideSheet(el) { el.classList.remove("show"); setTimeout(() => { if (!el.classList.contains("show")) el.hidden = true; }, 380); }
  $$(".sheet [data-close]").forEach(b => b.addEventListener("click", closeTop));
  // swipe down on a sheet's head to close
  $$(".sheet").forEach(sh => {
    let y0 = null, dy = 0;
    const zone = [$(".sheet-grab", sh), $(".sheet-head", sh)];
    zone.forEach(z => {
      z.addEventListener("touchstart", e => { y0 = e.touches[0].clientY; dy = 0; sh.style.transition = "none"; }, { passive: true });
      z.addEventListener("touchmove", e => { if (y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); sh.style.transform = `translateY(${dy}px)`; }, { passive: true });
      z.addEventListener("touchend", () => { sh.style.transition = ""; sh.style.transform = ""; if (dy > 90) closeTop(); y0 = null; });
    });
  });

  /* ======================= data ======================= */
  let rawSpots = null, spots = [], localAdds = [];
  async function fetchSpots() {
    try {
      const r = await fetch(CONFIG.spotsUrl, { headers: { accept: "application/json" } });
      if (!r.ok) throw new Error(r.status);
      const j = await r.json();
      if (!Array.isArray(j)) throw new Error("bad");
      return j;
    } catch (e) {
      return Array.isArray(window.PFC_DEMO) ? window.PFC_DEMO : [];
    }
  }
  function mergeLocal() {
    // a just-submitted spot may not be in the cached API response yet
    localAdds.forEach(a => { if (!spots.some(s => s.id === a.id)) spots.unshift(a); });
  }

  /* ======================= stats board (split-flap) ======================= */
  function computeStats() {
    const withPos = spots.filter(s => s.hasPos);
    const countries = new Set(spots.map(s => s.cc).filter(Boolean));
    const farthest = withPos.reduce((m, s) => Math.max(m, s.km || 0), 0);
    const total = withPos.reduce((m, s) => m + (s.km || 0), 0);
    return { spots: spots.length, countries: countries.size, farthest, total };
  }
  function renderBoard(animate) {
    const st = computeStats();
    $$("[data-flap]").forEach((el, idx) => {
      const val = st[el.dataset.flap];
      const txt = P.fmtKm(val, lang === "th" ? "en" : lang);
      const unit = el.dataset.unit ? `<span class="unit">${el.dataset.unit}</span>` : "";
      el.innerHTML = txt.split("").map(ch => /\d/.test(ch) ? `<span class="flap">${ch}</span>` : `<span class="flap sep">${ch}</span>`).join("") + unit;
      if (!animate || REDUCED) return;
      $$(".flap:not(.sep)", el).forEach((f, i) => {
        const final = f.textContent; let n = 0; const max = 8 + i * 3 + idx * 2;
        const tick = () => { if (n++ >= max) { f.textContent = final; return; } f.textContent = String((Math.random() * 10) | 0); setTimeout(tick, 45); };
        tick();
      });
    });
  }

  /* ======================= cargo tags ======================= */
  function tagHTML(s, extra = "") {
    const img = s.localPhoto || P.photo(s.photoUrl, 240, 300);
    const stamp = s.cc ? `<span class="stamp">${esc(s.cc)}</span>` : "";
    return `<button type="button" class="tag ${extra}" data-spot="${esc(s.id)}" aria-label="${esc(placeLabel(s))}">
      <div class="tag-photo">${img ? `<img src="${esc(img)}" alt="" loading="lazy" decoding="async" onerror="this.remove()">` : ""}<span class="noimg">${t("no_photo")}</span>${stamp}</div>
      <div class="tag-code">${esc(s.code || "")}</div>
      <div class="tag-city">${esc(placeLabel(s))}</div>
      <div class="tag-km">${esc(kmLabel(s) || s.country || "")}</div>
      <div class="tag-foot"><span>${esc(t("by", { name: s.name }))}</span><span class="mono">${esc(P.fmtDate(s.time, lang))}</span></div>
    </button>`;
  }
  function renderRail() {
    const rail = $("#latestRail");
    const list = spots.slice(0, 8);
    let html = list.map(s => tagHTML(s)).join("");
    const rest = spots.length - list.length;
    html += `<button type="button" class="tag more" data-action="map"><div><strong>${rest > 0 ? esc(t("more_spots", { n: rest })) : "→"}</strong><span>${esc(rest > 0 ? t("more_spots_sub") : t("see_all"))}</span></div></button>`;
    if (!list.length) html = `<button type="button" class="tag more" data-action="report"><div><strong>#1</strong><span>${esc(t("cta_found"))}</span></div></button>`;
    rail.innerHTML = html;
  }

  /* ======================= ranks ======================= */
  let rankTab = "countries";
  function renderRanks() {
    const rows = $("#rankRows");
    let data;
    if (rankTab === "countries") {
      const m = new Map();
      spots.forEach(s => { if (!s.cc) return; const e = m.get(s.cc) || { key: s.cc, label: s.country, n: 0, cities: new Set() }; e.n++; e.cities.add(s.city); m.set(s.cc, e); });
      data = [...m.values()].sort((a, b) => b.n - a.n).slice(0, 6).map(e => ({ lead: `<span class="cc">${esc(e.key)}</span>${esc(e.label)}`, n: e.n }));
    } else {
      const m = new Map();
      spots.forEach(s => { const k = s.name.toLowerCase(); const e = m.get(k) || { name: s.name, n: 0, cc: new Set() }; e.n++; if (s.cc) e.cc.add(s.cc); m.set(k, e); });
      data = [...m.values()].sort((a, b) => b.n - a.n).slice(0, 6).map(e => ({ lead: `${esc(e.name)} <span class="row-sub">· ${[...e.cc].join(" ")}</span>`, n: e.n }));
    }
    const max = Math.max(1, ...data.map(d => d.n));
    rows.innerHTML = data.map((d, i) => `<li class="row"><span class="row-rank">${String(i + 1).padStart(2, "0")}</span><span class="row-name">${d.lead}</span><span class="row-val">${d.n}</span><span class="row-bar"><i style="width:${Math.round(d.n / max * 100)}%"></i></span></li>`).join("") || `<li class="row"><span class="row-rank">—</span><span class="row-name" style="color:var(--muted)">${esc(t("cta_found"))}</span></li>`;
    $$(".tabs button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === rankTab)));
    // record: farthest from home
    const far = spots.filter(s => s.hasPos).sort((a, b) => b.km - a.km)[0];
    $("#recordBox").innerHTML = far ? `<button type="button" class="record" data-spot="${esc(far.id)}">
        <div class="record-km">${P.fmtKm(far.km, lang === "th" ? "en" : lang)}<small> km</small></div>
        <div><div class="record-t">${esc(t("record_label"))}</div><div class="record-c">${esc(placeLabel(far))}${far.cc ? " · " + esc(far.cc) : ""}</div><div class="row-sub">${esc(t("by", { name: far.name }))}</div></div>
      </button>` : "";
  }
  $$(".tabs button").forEach(b => b.addEventListener("click", () => { rankTab = b.dataset.tab; renderRanks(); }));

  function renderAll(animate) {
    renderBoard(animate); renderRail(); renderRanks(); renderMini(); updateMapData(); fillIgGate();
  }

  /* ======================= click delegation ======================= */
  document.addEventListener("click", e => {
    const a = e.target.closest("[data-action]");
    if (a) {
      if (a.dataset.action === "report") { e.preventDefault(); openReport(); }
      if (a.dataset.action === "map") { e.preventDefault(); openMap(); }
      return;
    }
    const sp = e.target.closest("[data-spot]");
    if (sp) { const s = spots.find(x => x.id === sp.dataset.spot); if (s) openSpotSheet(s); return; }
    const link = e.target.closest('a[href^="#"]');
    if (link) {
      const target = document.getElementById(link.getAttribute("href").slice(1));
      if (target && target.tagName === "DETAILS") {
        e.preventDefault();
        while (layers.length) { const l = layers.pop(); l.close(); } syncChrome();
        target.open = true; setTimeout(() => target.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
      }
    }
  });
  function openLegalFromHash() {
    const id = location.hash.slice(1);
    const el = id && document.getElementById(id);
    if (el && el.tagName === "DETAILS") { el.open = true; setTimeout(() => el.scrollIntoView({ block: "start" }), 100); }
  }

  /* ======================= MAP ======================= */
  let map = null, mapReady = false, full = false, stageVisible = true, activeId = null;
  let arcs = [], arcStart = 0, rotBase = 80, rafId = 0;
  const heroZoom = () => (innerWidth < 500 ? 1.3 : innerWidth < 960 ? 1.6 : 1.9);

  function initMap() {
    if (!window.maplibregl) { $("#map").innerHTML = `<div class="map-fallback">Map could not load.</div>`; return; }
    try {
      map = new maplibregl.Map({
        container: "map", style: P.style({ globe: true }), center: [rotBase, 22], zoom: heroZoom(),
        attributionControl: false,
        maxPitch: 0, renderWorldCopies: false, fadeDuration: 150
      });
    } catch (e) { $("#map").innerHTML = `<div class="map-fallback">Map needs WebGL, which this browser has turned off.</div>`; return; }
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>' }), "top-right");
    setInteractive(false);
    P.attachWorld(map);
    map.on("load", () => {
      map.addSource("arcs", { type: "geojson", data: fc([]) });
      map.addSource("ships", { type: "geojson", data: fc([]) });
      map.addSource("spots", { type: "geojson", data: fc([]), cluster: true, clusterRadius: 38, clusterMaxZoom: 11 });
      map.addLayer({ id: "arcs-glow", type: "line", source: "arcs", layout: { "line-cap": "round" }, paint: { "line-color": "#EE7D2B", "line-width": 6, "line-blur": 5, "line-opacity": ["interpolate", ["linear"], ["zoom"], 2, .35, 7, .08] } });
      map.addLayer({ id: "arcs", type: "line", source: "arcs", layout: { "line-cap": "round" }, paint: { "line-color": "#EE7D2B", "line-width": ["interpolate", ["linear"], ["zoom"], 1, 1.3, 6, 2], "line-opacity": ["interpolate", ["linear"], ["zoom"], 2, .9, 8, .25] } });
      map.addLayer({ id: "ships", type: "circle", source: "ships", paint: { "circle-radius": 3, "circle-color": "#FFD7B0", "circle-blur": .3, "circle-opacity": ["interpolate", ["linear"], ["zoom"], 3, 1, 6, 0] } });
      map.addLayer({ id: "cluster", type: "circle", source: "spots", filter: ["has", "point_count"], paint: { "circle-color": "#EE7D2B", "circle-stroke-color": "#0B1A2E", "circle-stroke-width": 2.5, "circle-radius": ["step", ["get", "point_count"], 12, 5, 15, 15, 19] } });
      map.addLayer({ id: "cluster-n", type: "symbol", source: "spots", filter: ["has", "point_count"], layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Bold"], "text-size": 12, "text-allow-overlap": true }, paint: { "text-color": "#1A0D02" } });
      map.addLayer({ id: "spot", type: "circle", source: "spots", filter: ["!", ["has", "point_count"]], paint: { "circle-color": "#EE7D2B", "circle-stroke-color": "#0B1A2E", "circle-stroke-width": 2, "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 5, 10, 8] } });
      map.addLayer({ id: "spot-active", type: "circle", source: "spots", filter: ["==", ["get", "id"], "__none"], paint: { "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#FFFFFF", "circle-stroke-width": 2.5, "circle-radius": 14 } });

      // home port marker
      const el = document.createElement("div");
      el.className = "home-mk"; el.innerHTML = '<img src="/assets/lion.webp" alt="Home port: PAT Stadium">';
      new maplibregl.Marker({ element: el }).setLngLat([P.HOME.lng, P.HOME.lat]).setPopup(new maplibregl.Popup({ offset: 26, closeButton: false }).setHTML(t("home_popup"))).addTo(map);

      map.on("click", "cluster", e => {
        if (!full) return;
        const f = e.features[0];
        map.getSource("spots").getClusterExpansionZoom(f.properties.cluster_id).then(z => map.easeTo({ center: f.geometry.coordinates, zoom: z + .5 }));
      });
      map.on("click", "spot", e => { if (!full) return; const s = spots.find(x => x.id === e.features[0].properties.id); if (s) { setActive(s.id, true); openSpotSheet(s); } });
      ["cluster", "spot"].forEach(l => { map.on("mouseenter", l, () => { if (full) map.getCanvas().style.cursor = "pointer"; }); map.on("mouseleave", l, () => map.getCanvas().style.cursor = ""); });
      map.on("click", () => { if (!full) openMap(); });
      ["dragstart", "zoomstart", "rotatestart"].forEach(ev => map.on(ev, e => { if (e.originalEvent) userMoved = true; }));

      mapReady = true;
      updateMapData();
      loop();
    });
    map.on("error", () => { /* missing tiles/glyphs are non-fatal: the base land layer still renders */ });
    new IntersectionObserver(es => { stageVisible = es[0].isIntersecting; if (stageVisible) loop(); }, { threshold: 0 }).observe($(".globe-stage"));
  }
  let userMoved = false;
  function setInteractive(on) {
    ["dragPan", "scrollZoom", "boxZoom", "dragRotate", "keyboard", "doubleClickZoom", "touchZoomRotate"].forEach(h => map[h] && (on ? map[h].enable() : map[h].disable()));
    if (map.touchZoomRotate) on && map.touchZoomRotate.disableRotation();
    if (map.dragRotate) map.dragRotate.disable();
  }
  const fc = features => ({ type: "FeatureCollection", features });

  function updateMapData() {
    if (!mapReady) return;
    const pos = spots.filter(s => s.hasPos);
    map.getSource("spots").setData(fc(pos.map(s => ({ type: "Feature", properties: { id: s.id }, geometry: { type: "Point", coordinates: [s.lng, s.lat] } }))));
    // one arc per distinct place (~5 km grid)
    const seen = new Map();
    pos.forEach(s => { const k = s.lat.toFixed(1) + "," + s.lng.toFixed(1); if (!seen.has(k) && s.km >= 30) seen.set(k, s); });
    arcs = [...seen.values()].map((s, i) => ({ coords: P.greatCircle(P.HOME, s, 80), km: s.km, phase: (i * 0.37) % 1 }));
    arcStart = performance.now();
    // centre the hero globe between home and the finds
    if (pos.length) {
      const lngs = pos.map(s => { let l = s.lng; while (l - P.HOME.lng > 180) l -= 360; while (l - P.HOME.lng < -180) l += 360; return l; });
      const mean = lngs.reduce((a, b) => a + b, 0) / lngs.length;
      rotBase = (mean + P.HOME.lng) / 2;
    }
    if (!full && !userMoved) map.jumpTo({ center: [rotBase, 24] });
    drawArcs(REDUCED ? 1 : 0);
    loop();
  }
  function drawArcs(progress) {
    const feats = arcs.map(a => {
      const n = Math.max(2, Math.round(a.coords.length * Math.min(1, progress)));
      return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: a.coords.slice(0, n) } };
    });
    map.getSource("arcs").setData(fc(feats));
  }
  function loop() {
    if (!mapReady || rafId || REDUCED) return;
    let last = 0;
    const frame = now => {
      rafId = 0;
      if (!(stageVisible || full) || document.hidden) return;
      if (now - last < 32) { rafId = requestAnimationFrame(frame); return; } // ~30 fps is plenty and saves battery
      last = now;
      const grow = Math.min(1, (now - arcStart) / 1600);
      if (grow < 1) drawArcs(1 - Math.pow(1 - grow, 3));
      // "shipments" travelling from the home port along each route
      if (grow >= 1 && map.getZoom() < 6) {
        const pts = arcs.map(a => {
          const period = Math.max(2600, a.km * 0.55);
          const f = ((now / period) + a.phase) % 1;
          const idx = f * (a.coords.length - 1), i0 = Math.floor(idx), i1 = Math.min(a.coords.length - 1, i0 + 1), k = idx - i0;
          const c = [a.coords[i0][0] + (a.coords[i1][0] - a.coords[i0][0]) * k, a.coords[i0][1] + (a.coords[i1][1] - a.coords[i0][1]) * k];
          return { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: c } };
        });
        map.getSource("ships").setData(fc(pts));
      }
      // slow drift of the hero globe
      if (!full && !userMoved) map.jumpTo({ center: [rotBase + Math.sin(now / 9000) * 22, 24 + Math.sin(now / 13000) * 4] });
      rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);
  }

  /* ----- fullscreen map mode ----- */
  function openMap(focus) {
    if (!map) return;
    if (!full) {
      full = true;
      $("#map").classList.add("full"); $("#mapui").hidden = false; document.body.classList.add("map-open");
      map.resize(); setInteractive(true); map.getCanvas().style.cursor = "";
      pushLayer("map", closeMap);
      renderMini();
      loop();
    }
    const pos = spots.filter(s => s.hasPos);
    if (focus && focus.hasPos) { flyToSpot(focus); return; }
    if (pos.length && window.maplibregl) {
      const b = new maplibregl.LngLatBounds([P.HOME.lng, P.HOME.lat], [P.HOME.lng, P.HOME.lat]);
      pos.forEach(s => b.extend([s.lng, s.lat]));
      map.fitBounds(b, { padding: { top: 90, bottom: 190, left: 40, right: 40 }, maxZoom: 5, duration: REDUCED ? 0 : 1400 });
    }
  }
  function closeMap() {
    full = false; userMoved = false; setActive(null);
    $("#map").classList.remove("full"); $("#mapui").hidden = true; document.body.classList.remove("map-open");
    setInteractive(false); map.resize();
    map.jumpTo({ center: [rotBase, 24], zoom: heroZoom(), bearing: 0, pitch: 0 });
    loop();
  }
  $("#mapClose").addEventListener("click", closeTop);
  function flyToSpot(s) {
    setActive(s.id);
    map.flyTo({ center: [s.lng, s.lat], zoom: Math.max(map.getZoom(), 11.5), speed: 1.6, padding: { bottom: 170 }, essential: true, duration: REDUCED ? 0 : undefined });
  }
  function setActive(id, scrollRail) {
    activeId = id;
    if (mapReady) map.setFilter("spot-active", ["==", ["get", "id"], id || "__none"]);
    $$("#miniRail .mini").forEach(m => m.classList.toggle("active", m.dataset.id === id));
    if (scrollRail && id) { const el = $(`#miniRail .mini[data-id="${CSS.escape(id)}"]`); el && el.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" }); }
  }
  let sortMode = "newest";
  function renderMini() {
    if (!full) return;
    const list = spots.filter(s => s.hasPos).slice().sort((a, b) => sortMode === "farthest" ? b.km - a.km : (b.time || "").localeCompare(a.time || ""));
    $("#miniRail").innerHTML = list.map(s => {
      const img = s.localPhoto || P.photo(s.photoUrl, 64, 64);
      return `<button type="button" class="mini${s.id === activeId ? " active" : ""}" data-id="${esc(s.id)}">
        ${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : `<span class="ph"></span>`}
        <span style="min-width:0"><span class="c" style="display:block">${esc(placeLabel(s))}</span><span class="k" style="display:block">${esc(s.km < 30 ? t("at_home") : P.fmtKm(s.km, lang === "th" ? "en" : lang) + " km")}</span><span class="n" style="display:block">${esc(t("by", { name: s.name }))} · ${esc(P.fmtDate(s.time, lang))}</span></span>
      </button>`;
    }).join("");
    $$(".sort-toggle button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.sort === sortMode)));
  }
  $$(".sort-toggle button").forEach(b => b.addEventListener("click", () => { sortMode = b.dataset.sort; renderMini(); $("#miniRail").scrollLeft = 0; }));
  $("#miniRail").addEventListener("click", e => {
    const m = e.target.closest(".mini"); if (!m) return;
    const s = spots.find(x => x.id === m.dataset.id); if (!s) return;
    if (activeId === s.id) openSpotSheet(s); else flyToSpot(s);
  });

  /* ======================= SPOT SHEET ======================= */
  let openSpot = null;
  function fillSpotSheet(s) {
    openSpot = s;
    const img = s.localPhoto || P.photo(s.photoUrl, 560, 700);
    $("#spotPhoto").innerHTML = img ? `<img src="${esc(img)}" alt="">` : "";
    $("#spotCode").textContent = s.code || "";
    $("#spotCity").textContent = placeLabel(s) + (s.country ? ", " + s.country : "");
    $("#spotKm").textContent = kmLabel(s);
    const ig = s.ig ? ` · <a href="https://instagram.com/${esc(s.ig.replace("@", ""))}" target="_blank" rel="noopener">${esc(s.ig)}</a>` : "";
    $("#spotBy").innerHTML = `${esc(t("by", { name: s.name }))}${ig} · ${esc(P.fmtDate(s.time, lang))}`;
    $("#spotMap").hidden = !s.hasPos;
  }
  function openSpotSheet(s) {
    fillSpotSheet(s);
    const sh = $("#spotSheet");
    if (!layers.some(l => l.name === "spot")) pushLayer("spot", () => { hideSheet(sh); openSpot = null; });
    showSheet(sh);
  }
  const spotUrl = s => `${CONFIG.site}/?spot=${encodeURIComponent(s.id)}`;
  async function shareSpot(s) {
    const text = `Port FC spotted in ${placeLabel(s)}${s.km >= 30 ? ` — ${P.fmtKm(s.km, "en")} km from Khlong Toei` : ""} 🦁 #PortFConTour @portfc_tour`;
    if (navigator.share) { try { await navigator.share({ title: "Port FC on Tour", text, url: spotUrl(s) }); return; } catch (e) { if (e.name === "AbortError") return; } }
    copyText(spotUrl(s), t("link_copied"));
  }
  $("#spotShare").addEventListener("click", () => openSpot && shareSpot(openSpot));
  $("#spotStory").addEventListener("click", () => openSpot && makeStory(openSpot));
  $("#spotMap").addEventListener("click", () => {
    const s = openSpot; if (!s) return;
    closeTop();
    setTimeout(() => { openMap(s); setActive(s.id, true); }, 60);
  });

  /* ======================= STORY IMAGE (1080×1920) ======================= */
  const lionImg = new Image(); lionImg.src = "/assets/lion.png";
  function loadImg(src) {
    return new Promise(res => { if (!src) return res(null); const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
  }
  async function makeStory(s) {
    toast("…");
    try {
      await Promise.all(['900 120px "Big Shoulders Stencil"', '700 60px "IBM Plex Sans"', '500 30px "IBM Plex Mono"', '600 30px "IBM Plex Mono"'].map(f => document.fonts.load(f)));
    } catch (e) {}
    const photo = await loadImg(s.localPhoto || P.photo(s.photoUrl, 420, 480));
    const W = 1080, H = 1920, c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d");
    g.fillStyle = "#0B1A2E"; g.fillRect(0, 0, W, H);
    g.strokeStyle = "rgba(58,134,208,.08)"; g.lineWidth = 2;
    for (let x = 0; x <= W; x += 72) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    for (let y = 0; y <= H; y += 72) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    if (lionImg.complete && lionImg.naturalWidth) g.drawImage(lionImg, 80, 96, 170, 187);
    g.textBaseline = "alphabetic";
    g.font = '900 150px "Big Shoulders Stencil", Impact, sans-serif';
    g.fillStyle = "#EE7D2B"; g.fillText("PORT FC", 280, 208);
    g.fillStyle = "#3A86D0"; g.fillText("ON TOUR", 280, 336);
    // cargo tag
    const tx = 110, ty = 430, tw = 860, th = 1200, cut = 44;
    g.save(); g.translate(W / 2, ty + th / 2); g.rotate(-1.6 * Math.PI / 180); g.translate(-W / 2, -(ty + th / 2));
    g.shadowColor = "rgba(0,0,0,.5)"; g.shadowBlur = 50; g.shadowOffsetY = 24;
    g.fillStyle = "#EFE6D3";
    g.beginPath(); g.moveTo(tx + cut, ty); g.lineTo(tx + tw - cut, ty); g.lineTo(tx + tw, ty + cut); g.lineTo(tx + tw, ty + th); g.lineTo(tx, ty + th); g.lineTo(tx, ty + cut); g.closePath(); g.fill();
    g.shadowColor = "transparent";
    g.fillStyle = "#0B1A2E"; g.beginPath(); g.arc(W / 2, ty + 34, 16, 0, Math.PI * 2); g.fill();
    const px = tx + 34, py = ty + 72, pw = tw - 68, ph = 820;
    g.fillStyle = "#C9BCA2"; g.fillRect(px, py, pw, ph);
    if (photo) {
      const r = Math.max(pw / photo.width, ph / photo.height), sw = pw / r, sh = ph / r;
      g.drawImage(photo, (photo.width - sw) / 2, (photo.height - sh) / 2, sw, sh, px, py, pw, ph);
    }
    if (s.cc) {
      g.save(); g.translate(px + pw - 110, py + ph - 70); g.rotate(-6 * Math.PI / 180);
      g.fillStyle = "rgba(239,230,211,.94)"; g.strokeStyle = "#EE7D2B"; g.lineWidth = 5;
      g.beginPath(); g.roundRect(-60, -34, 120, 68, 10); g.fill(); g.stroke();
      g.fillStyle = "#EE7D2B"; g.font = '600 38px "IBM Plex Mono", monospace'; g.textAlign = "center"; g.fillText(s.cc, 0, 14); g.restore();
    }
    g.textAlign = "left";
    g.fillStyle = "#6B5E47"; g.font = '500 28px "IBM Plex Mono", monospace'; g.fillText(s.code || "", px, py + ph + 60);
    g.fillStyle = "#0B1A2E"; g.font = '700 64px "IBM Plex Sans", sans-serif';
    let city = placeLabel(s); while (g.measureText(city).width > pw && city.length > 4) city = city.slice(0, -2);
    if (city !== placeLabel(s)) city = city.trim() + "…";
    g.fillText(city, px, py + ph + 138);
    g.fillStyle = "#9A4A0F"; g.font = '600 38px "IBM Plex Mono", monospace';
    g.fillText(s.km >= 30 ? `${P.fmtKm(s.km, "en")} KM FROM KHLONG TOEI` : "HOME GROUND · KHLONG TOEI", px, py + ph + 200);
    g.restore();
    // footer
    g.fillStyle = "#E8EDF5"; g.font = '600 40px "IBM Plex Mono", monospace'; g.textAlign = "center";
    g.fillText("@portfc_tour  #PortFConTour", W / 2, 1760);
    g.fillStyle = "#93A4BF"; g.font = '500 32px "IBM Plex Mono", monospace';
    g.fillText("portfc-on-tour.com", W / 2, 1816);

    c.toBlob(async blob => {
      if (!blob) { toast(t("r_error")); return; }
      const file = new File([blob], "portfc-on-tour-story.jpg", { type: "image/jpeg" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: "Port FC on Tour" }); return; } catch (e) { if (e.name === "AbortError") return; }
      }
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.name;
      document.body.appendChild(a); a.click(); a.remove();
      toast(t("story_saved"));
    }, "image/jpeg", 0.92);
  }

  /* ======================= REPORT FLOW ======================= */
  const R_ = { step: 1, file: null, blob: null, preview: "", exif: null, pos: null, place: null, locSet: false, pickMap: null, busy: false, submitted: null };
  const rs = $("#reportSheet");
  function openReport() {
    if (R_.submitted) resetReport();
    if (!layers.some(l => l.name === "report")) pushLayer("report", () => hideSheet(rs));
    showSheet(rs);
    goStep(R_.step);
  }
  function resetReport() {
    Object.assign(R_, { step: 1, file: null, blob: null, preview: "", exif: null, place: null, locSet: false, submitted: null, busy: false });
    $("#photoPreview").hidden = true; $("#photoSwap").hidden = true; $("#dropInner").hidden = false; $("#r1Next").disabled = true;
    $("#photoInput").value = ""; $("#placeSearch").value = ""; $("#locNote").hidden = true; $("#submitErr").hidden = true;
    $("#pickerEmpty").hidden = false; $("#pinLabel").hidden = true; $("#r2Next").disabled = true;
  }
  function goStep(n) {
    R_.step = n;
    $$("#reportForm .step").forEach(s => s.hidden = +s.dataset.step !== n);
    $$("#rSteps i").forEach((i, k) => i.classList.toggle("on", k < Math.min(n, 3)));
    $("#rSteps").style.visibility = n === 4 ? "hidden" : "";
    $("#rBack").style.visibility = n === 2 || n === 3 ? "visible" : "hidden";
    $(".sheet-body", rs).scrollTop = 0;
    if (n === 2) initPicker();
    if (n === 3) {
      const saved = store.get("portfc_me"); if (saved && !$("#inpName").value) { try { const m = JSON.parse(saved); $("#inpName").value = m.name || ""; $("#inpIg").value = m.ig || ""; } catch (e) {} }
      renderSummary(); checkSubmit();
    }
  }
  $("#rBack").addEventListener("click", () => goStep(Math.max(1, R_.step - 1)));

  // --- step 1: photo
  $("#photoInput").addEventListener("change", async e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    R_.file = f; R_.blob = null; R_.exif = null;
    const prev = $("#photoPreview");
    if (R_.preview) URL.revokeObjectURL(R_.preview);
    R_.preview = URL.createObjectURL(f);
    prev.onerror = () => { prev.hidden = true; $("#dropInner").hidden = false; $("#dropInner strong").textContent = "✓ " + f.name; };
    prev.src = R_.preview; prev.hidden = false; $("#dropInner").hidden = true; $("#photoSwap").hidden = false;
    $("#r1Next").disabled = false;
    // GPS from the photo (works for many Android photos and files shared with location)
    readExif(f).then(p => { if (p) R_.exif = p; });
    shrink(f).then(b => {
      R_.blob = b;
      if (b && b !== f) { URL.revokeObjectURL(R_.preview); R_.preview = URL.createObjectURL(b); prev.src = R_.preview; prev.hidden = false; $("#dropInner").hidden = true; }
    });
  });
  $("#r1Next").addEventListener("click", () => goStep(2));
  async function readExif(file) {
    try {
      if (!window.exifr) await loadScript(CONFIG.exifr);
      const g = await window.exifr.gps(file);
      if (g && isFinite(g.latitude) && isFinite(g.longitude) && !(g.latitude === 0 && g.longitude === 0)) return { lat: g.latitude, lng: g.longitude };
    } catch (e) {}
    return null;
  }
  async function shrink(file) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      const max = 1800, sc = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas"); c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      const b = await new Promise(r => c.toBlob(r, "image/jpeg", 0.86));
      return b && b.size < file.size ? b : file;
    } catch (e) { return file; } // e.g. HEIC in browsers that can't decode it — Cloudinary converts it
  }

  // --- step 2: location
  function note(kind, msg) {
    const n = $("#locNote");
    if (!msg) { n.hidden = true; return; }
    const icon = kind === "ok" ? "i-check" : "i-info";
    n.className = "note " + (kind || ""); n.innerHTML = `<svg><use href="#${icon}"/></svg><span>${esc(msg)}</span>`; n.hidden = false;
  }
  function setLocated(lat, lng, zoom, how) {
    R_.locSet = true; $("#pickerEmpty").hidden = true; $("#r2Next").disabled = false;
    if (R_.pickMap) R_.pickMap.jumpTo({ center: [lng, lat], zoom });
    R_.pos = { lat, lng };
    if (how) note("ok", t(how));
    reverseSoon();
  }
  function initPicker() {
    if (R_.pickMap || !window.maplibregl) {
      if (!window.maplibregl) { $("#picker").hidden = true; }
      applyInitialLocation(); return;
    }
    try {
      R_.pickMap = new maplibregl.Map({ container: "pickMap", style: P.style({ globe: false }), center: [100.56, 13.72], zoom: 1, attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false, touchPitch: false });
      R_.pickMap.touchZoomRotate.disableRotation();
      P.attachWorld(R_.pickMap);
      const pm = R_.pickMap, pk = $("#picker");
      pm.on("movestart", e => { if (e.originalEvent) pk.classList.add("moving"); });
      pm.on("moveend", e => {
        pk.classList.remove("moving");
        const c = pm.getCenter(); R_.pos = { lat: c.lat, lng: ((c.lng + 540) % 360) - 180 };
        if (e.originalEvent && !R_.locSet) { R_.locSet = true; $("#pickerEmpty").hidden = true; $("#r2Next").disabled = false; }
        if (R_.locSet) reverseSoon();
      });
      pm.on("load", () => applyInitialLocation());
    } catch (e) { $("#picker").hidden = true; applyInitialLocation(); }
  }
  function applyInitialLocation() {
    if (R_.locSet) return;
    if (R_.exif) { setLocated(R_.exif.lat, R_.exif.lng, 16, "r_loc_exif"); return; }
    // wait briefly: EXIF parsing may still be running
    setTimeout(() => { if (!R_.locSet && R_.exif) setLocated(R_.exif.lat, R_.exif.lng, 16, "r_loc_exif"); }, 700);
  }
  let revT = 0, revSeq = 0;
  function reverseSoon() {
    clearTimeout(revT);
    const lbl = $("#pinLabel");
    revT = setTimeout(async () => {
      const p = R_.pos; if (!p) return; const seq = ++revSeq;
      const r = await P.reverse(p.lat, p.lng);
      if (seq !== revSeq) return;
      R_.place = r;
      lbl.textContent = r && r.city ? r.city + (r.country ? ", " + r.country : "") : `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`;
      lbl.hidden = false;
    }, 450);
  }
  $("#locateBtn").addEventListener("click", () => {
    if (!navigator.geolocation) { note("warn", t("r_loc_failed")); return; }
    note("", t("r_loc_locating"));
    navigator.geolocation.getCurrentPosition(
      p => setLocated(p.coords.latitude, p.coords.longitude, 16, "r_loc_gps"),
      err => note("warn", t(err.code === 1 ? "r_loc_denied" : "r_loc_failed")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  });
  let sT = 0, sSeq = 0;
  $("#placeSearch").addEventListener("input", e => {
    clearTimeout(sT);
    const q = e.target.value.trim(); const box = $("#placeResults");
    if (q.length < 2) { box.hidden = true; return; }
    sT = setTimeout(async () => {
      const seq = ++sSeq;
      let res = [];
      try { res = await P.search(q, lang, R_.locSet ? R_.pos : null); } catch (err) {}
      if (seq !== sSeq) return;
      box.innerHTML = res.length ? res.map((r, i) => `<button type="button" data-i="${i}">${esc(r.name)}<small>${esc(r.sub)}</small></button>`).join("") : `<button type="button" disabled>${esc(t("r_no_results"))}</button>`;
      box.hidden = false; box._res = res;
    }, 350);
  });
  $("#placeSearch").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); const b = $("#placeResults button[data-i]"); b && b.click(); } });
  $("#placeResults").addEventListener("click", e => {
    const b = e.target.closest("button[data-i]"); if (!b) return;
    const r = $("#placeResults")._res[+b.dataset.i];
    $("#placeResults").hidden = true; $("#placeSearch").value = r.name; $("#placeSearch").blur();
    setLocated(r.lat, r.lng, r.zoom, null); note("", t("r_step2_hint"));
  });
  document.addEventListener("click", e => { if (!e.target.closest(".search")) $("#placeResults").hidden = true; });
  $("#r2Next").addEventListener("click", () => { if (!R_.locSet) { note("warn", t("r_loc_needed")); return; } goStep(3); });

  // --- step 3: who + submit
  function draftSpot() {
    const p = R_.pos || { lat: 0, lng: 0 };
    const c = P.countryAt(p.lat, p.lng);
    return {
      id: "local", name: $("#inpName").value.trim() || "Fan", ig: $("#inpIg").value.trim(),
      city: (R_.place && R_.place.city) || "", cityRaw: "", cc: (R_.place && R_.place.cc) || (c && c.a2) || "",
      country: (R_.place && R_.place.cc) ? P.countryName(R_.place.cc, lang, R_.place.country) : (c ? P.countryName(c.a2, lang, c.name) : ""),
      lat: p.lat, lng: p.lng, hasPos: true, km: Math.round(P.km(P.HOME, p)), time: new Date().toISOString(), localPhoto: R_.preview,
      code: P.containerCode(spots.length + 1)
    };
  }
  function renderSummary() {
    const d = draftSpot();
    $("#rSummary").innerHTML = `<img src="${esc(R_.preview)}" alt="" onerror="this.style.visibility='hidden'"><div><div class="c">${esc(placeLabel(d))}${d.country ? ", " + esc(d.country) : ""}</div><div class="k">${esc(kmLabel(d))}</div></div>`;
  }
  function checkSubmit() { $("#rSubmit").disabled = !$("#inpName").value.trim() || R_.busy; }
  $("#inpName").addEventListener("input", checkSubmit);
  $("#reportForm").addEventListener("submit", async e => {
    e.preventDefault();
    if (R_.busy || !$("#inpName").value.trim()) return;
    R_.busy = true; checkSubmit(); $("#submitErr").hidden = true;
    const btnLabel = $("#rSubmit span");
    const name = $("#inpName").value.trim().slice(0, 40);
    let ig = $("#inpIg").value.trim().replace(/\s+/g, ""); if (ig && !ig.startsWith("@")) ig = "@" + ig;
    store.set("portfc_me", JSON.stringify({ name, ig }));
    try {
      btnLabel.textContent = t("r_uploading");
      const fd = new FormData();
      fd.append("file", R_.blob || R_.file, (R_.file && R_.file.name) || "spot.jpg");
      fd.append("upload_preset", CONFIG.cloudinary.preset);
      const up = await fetch(CONFIG.cloudinary.url, { method: "POST", body: fd });
      const upj = await up.json();
      if (!up.ok || !upj.secure_url) throw new Error("upload");

      btnLabel.textContent = t("r_saving");
      const d = draftSpot();
      const cityStr = [d.city || (R_.place && R_.place.city) || "", (R_.place && R_.place.country) || (d.cc ? P.countryName(d.cc, "en", "") : "")].filter(Boolean).join(", ");
      const body = { name, ig, city: cityStr, photoUrl: upj.secure_url, lat: +R_.pos.lat.toFixed(5), lng: +R_.pos.lng.toFixed(5), website: $("#inpWebsite").value };
      const res = await fetch(CONFIG.submitUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const rj = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(rj.error || "save");

      // email heads-up for the admin; never blocks the user
      const fd2 = new FormData();
      Object.entries({ name, city: cityStr, instagram: ig, photo_url: upj.secure_url, lat: body.lat, lng: body.lng, map: `https://www.openstreetmap.org/?mlat=${body.lat}&mlon=${body.lng}#map=16/${body.lat}/${body.lng}`, _subject: `🦁 New Port FC spot: ${cityStr || "unknown"} by ${name}` }).forEach(([k, v]) => fd2.append(k, v));
      fetch(CONFIG.formspree, { method: "POST", body: fd2, headers: { Accept: "application/json" } }).catch(() => {});

      const fresh = Object.assign(draftSpot(), { id: rj.id || "local-" + Date.now(), name, ig, photoUrl: upj.secure_url, cityRaw: cityStr });
      localAdds.push(fresh);
      spots.unshift(fresh);
      spots.forEach(s => { if (s !== fresh) return; s.code = P.containerCode(spots.length); });
      R_.submitted = fresh;
      renderAll(false);
      $("#doneTag").innerHTML = tagHTML(fresh);
      goStep(4);
    } catch (err) {
      $("#submitErr").innerHTML = `<svg><use href="#i-info"/></svg><span>${esc(t("r_error"))}</span>`; $("#submitErr").hidden = false;
    } finally {
      R_.busy = false; btnLabel.textContent = t("r_submit"); checkSubmit();
    }
  });
  $("#doneStory").addEventListener("click", () => R_.submitted && makeStory(R_.submitted));
  $("#doneShare").addEventListener("click", () => R_.submitted && shareSpot(R_.submitted));
  $("#doneView").addEventListener("click", () => { const s = R_.submitted; closeTop(); setTimeout(() => openMap(s), 80); });
  $("#doneAgain").addEventListener("click", () => { resetReport(); goStep(1); });

  /* ======================= INSTAGRAM (2-click) ======================= */
  function fillIgGate() {
    const ph = $$("#igGate .ph"); const withPhoto = spots.filter(s => s.photoUrl).slice(0, 3);
    ph.forEach((p, i) => { const s = withPhoto[i]; p.innerHTML = s ? `<img src="${esc(P.photo(s.photoUrl, 120, 120))}" alt="" loading="lazy">` : ""; });
  }
  function loadIg() {
    store.set("portfc_ig_ok", "1");
    $("#igGate").hidden = true;
    const box = $("#igPosts"); box.hidden = false;
    box.innerHTML = CONFIG.igPosts.map(u => `<div class="ig-post"><blockquote class="instagram-media" data-instgrm-permalink="${esc(u)}" data-instgrm-version="14"><a href="${esc(u)}" target="_blank" rel="noopener">Instagram</a></blockquote></div>`).join("");
    if (window.instgrm) window.instgrm.Embeds.process();
    else loadScript("https://www.instagram.com/embed.js").then(() => window.instgrm && window.instgrm.Embeds.process()).catch(() => {});
  }
  $("#igLoad").addEventListener("click", loadIg);
  if (store.get("portfc_ig_ok") === "1") {
    const io = new IntersectionObserver(es => { if (es[0].isIntersecting) { io.disconnect(); loadIg(); } }, { rootMargin: "400px" });
    io.observe($("#instagram"));
  }
  $("#copyTags").addEventListener("click", () => copyText("#PortFConTour #PortFC #KhlongToeiArmy #การท่าเรือ @portfc_tour"));

  /* ======================= dock + reveal ======================= */
  let ctasVisible = true;
  function updateDock() { $("#dock").classList.toggle("show", !ctasVisible && !layers.length); }
  new IntersectionObserver(es => { ctasVisible = es[0].isIntersecting || es[0].boundingClientRect.top > 0; updateDock(); }).observe($("#heroCtas"));
  /* ======================= boot ======================= */
  $("#year").textContent = new Date().getFullYear();
  applyLang();
  openLegalFromHash();
  window.addEventListener("hashchange", openLegalFromHash);
  initMap();
  Promise.all([fetchSpots(), P.loadWorld()]).then(([raw]) => {
    rawSpots = raw;
    spots = P.normalize(raw, lang);
    mergeLocal();
    renderAll(true);
    const want = new URLSearchParams(location.search).get("spot");
    if (want) { const s = spots.find(x => x.id === want); if (s) openSpotSheet(s); }
    if (location.hash === "#report") openReport();
  });
  // PWA: register nothing new; keep install banner out of the way (native prompt still works)
})();
