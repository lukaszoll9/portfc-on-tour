/* Port FC on Tour — admin: move pins, fix place names, hide spots */
(function () {
  "use strict";
  const P = window.PFC, $ = s => document.querySelector(s), $$ = s => Array.from(document.querySelectorAll(s)), esc = P.esc;
  const API = "/api/admin/spots";
  let key = "";
  try { key = sessionStorage.getItem("pfc_admin") || ""; } catch (e) {}
  let moderated = false;
  let all = [], filter = "all", cur = null, pick = null, detected = null, moved = false;

  function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2200); }
  async function api(method, body) {
    const r = await fetch(API, { method, headers: { "x-admin-key": key, ...(body ? { "Content-Type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || "Fehler " + r.status), { status: r.status });
    if (method === "GET") moderated = r.headers.get("X-Moderation") === "on";
    return j;
  }
  async function load() {
    try {
      await P.loadWorld();
      all = await api("GET");
      $("#loginForm").hidden = true; $("#panel").hidden = false; $("#logout").hidden = false;
      $("#fOpen").hidden = !moderated; $("#eApprovedRow").hidden = !moderated;
      render();
    } catch (e) {
      if (e.status === 401) { key = ""; try { sessionStorage.removeItem("pfc_admin"); } catch (x) {} }
      $("#loginForm").hidden = false; $("#panel").hidden = true;
      const n = $("#loginErr"); n.innerHTML = `<svg><use href="#i-info"/></svg><span>${esc(e.message)}</span>`; n.hidden = false;
    }
  }
  $("#loginForm").addEventListener("submit", e => { e.preventDefault(); key = $("#pw").value; try { sessionStorage.setItem("pfc_admin", key); } catch (x) {} load(); });
  $("#logout").addEventListener("click", () => { try { sessionStorage.removeItem("pfc_admin"); } catch (e) {} location.reload(); });
  $$(".filters button").forEach(b => b.addEventListener("click", () => { filter = b.dataset.f; $$(".filters button").forEach(x => x.setAttribute("aria-pressed", String(x === b))); render(); }));

  const hasPos = s => typeof s.lat === "number" && typeof s.lng === "number";
  function render() {
    const list = all.filter(s => filter === "all" || (filter === "nopin" && !hasPos(s)) || (filter === "hidden" && s.hidden) || (filter === "open" && !s.approved));
    $("#list").innerHTML = list.map(s => {
      const km = hasPos(s) ? P.fmtKm(Math.round(P.km(P.HOME, s)), "de") + " km" : "";
      const badges = [!hasPos(s) ? '<span class="badge warn">OHNE PIN</span>' : "", s.hidden ? '<span class="badge off">AUSGEBLENDET</span>' : "", moderated && !s.approved ? '<span class="badge warn">OFFEN</span>' : ""].join(" ");
      return `<button type="button" class="item${s.hidden ? " is-hidden" : ""}" data-id="${esc(s.id)}">
        ${s.photoUrl ? `<img src="${esc(P.photo(s.photoUrl, 64, 64))}" alt="" loading="lazy">` : '<span class="ph"></span>'}
        <span style="min-width:0"><span class="c" style="display:block">${esc(s.city || "— kein Ort —")}</span><span class="s" style="display:block">${esc(s.name)} · ${esc(P.fmtDate(s.time, "de"))}${km ? " · " + km : ""}</span></span>
        <span style="display:grid;gap:4px;justify-items:end">${badges}</span>
      </button>`;
    }).join("") || '<p class="fine">Keine Einträge.</p>';
  }
  $("#list").addEventListener("click", e => { const b = e.target.closest(".item"); if (b) openEdit(all.find(s => s.id === b.dataset.id)); });

  /* ---- editor ---- */
  function openEdit(s) {
    cur = s; detected = null; moved = false;
    $("#ePhoto").src = s.photoUrl ? P.photo(s.photoUrl, 560, 280) : ""; $("#ePhoto").hidden = !s.photoUrl;
    $("#eCity").value = s.city; $("#eName").value = s.name; $("#eIg").value = s.ig; $("#eHidden").checked = s.hidden; $("#eApproved").checked = !!s.approved;
    $("#eErr").hidden = true; $("#eSearch").value = ""; $("#ePinLabel").hidden = true;
    $("#scrim").hidden = false; requestAnimationFrame(() => $("#scrim").classList.add("show"));
    const sh = $("#editSheet"); sh.hidden = false; requestAnimationFrame(() => requestAnimationFrame(() => sh.classList.add("show")));
    document.body.style.overflow = "hidden";
    setTimeout(() => {
      if (!pick) {
        pick = new maplibregl.Map({ container: "pickMap", style: P.style({ globe: false }), center: [100.56, 13.72], zoom: 2, dragRotate: false, attributionControl: { compact: true } });
        pick.touchZoomRotate.disableRotation();
        P.attachWorld(pick);
        pick.on("moveend", onMove);
      }
      pick.resize();
      if (hasPos(s)) pick.jumpTo({ center: [s.lng, s.lat], zoom: 15 });
      else pick.jumpTo({ center: [100.56, 13.72], zoom: 3 });
      onMove();
    }, 60);
  }
  function closeEdit() {
    $("#editSheet").classList.remove("show"); $("#scrim").classList.remove("show");
    setTimeout(() => { $("#editSheet").hidden = true; $("#scrim").hidden = true; }, 350);
    document.body.style.overflow = "";
  }
  $("#editClose").addEventListener("click", closeEdit); $("#eCancel").addEventListener("click", closeEdit); $("#scrim").addEventListener("click", closeEdit);
  let rt = 0;
  function onMove(e) {
    if (!pick) return;
    if (e && e.originalEvent) moved = true;
    const c = pick.getCenter();
    $("#eCoords").textContent = `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`;
    clearTimeout(rt);
    if (!moved && cur && !hasPos(cur)) { detected = null; $("#ePinLabel").textContent = "Ort suchen oder Karte verschieben"; $("#ePinLabel").hidden = false; return; }
    rt = setTimeout(async () => {
      const r = await P.reverse(c.lat, c.lng);
      detected = r && r.city ? [r.city, r.country].filter(Boolean).join(", ") : null;
      $("#ePinLabel").textContent = detected || "?"; $("#ePinLabel").hidden = false;
    }, 450);
  }
  $("#eUseDetected").addEventListener("click", () => { if (detected) $("#eCity").value = detected; });
  let st = 0;
  $("#eSearch").addEventListener("input", e => {
    clearTimeout(st); const q = e.target.value.trim(); const box = $("#eResults");
    if (q.length < 2) { box.hidden = true; return; }
    st = setTimeout(async () => {
      let res = []; try { res = await P.search(q, "de"); } catch (x) {}
      box.innerHTML = res.map((r, i) => `<button type="button" data-i="${i}">${esc(r.name)}<small>${esc(r.sub)}</small></button>`).join("") || '<button type="button" disabled>Nichts gefunden</button>';
      box._res = res; box.hidden = false;
    }, 350);
  });
  $("#eResults").addEventListener("click", e => {
    const b = e.target.closest("button[data-i]"); if (!b) return;
    const r = $("#eResults")._res[+b.dataset.i]; $("#eResults").hidden = true;
    pick.jumpTo({ center: [r.lng, r.lat], zoom: r.zoom }); moved = true;
  });
  $("#eSave").addEventListener("click", async () => {
    const c = pick.getCenter();
    const body = { id: cur.id, city: $("#eCity").value.trim(), name: $("#eName").value.trim(), ig: $("#eIg").value.trim(), hidden: $("#eHidden").checked, ...(moderated ? { approved: $("#eApproved").checked } : {}) };
    if (moved || hasPos(cur)) { body.lat = c.lat; body.lng = ((c.lng + 540) % 360) - 180; }
    $("#eSave").disabled = true;
    try {
      await api("PATCH", body);
      if (body.lat !== undefined) Object.assign(cur, { lat: +body.lat.toFixed(5), lng: +body.lng.toFixed(5) });
      Object.assign(cur, { city: body.city, name: body.name, ig: body.ig, hidden: body.hidden }, body.approved !== undefined ? { approved: body.approved } : {});
      render(); closeEdit(); toast("Gespeichert – live in ca. 1 Minute");
    } catch (e) {
      const n = $("#eErr"); n.innerHTML = `<svg><use href="#i-info"/></svg><span>${esc(e.message)}</span>`; n.hidden = false;
    } finally { $("#eSave").disabled = false; }
  });

  if (key) load();
})();
