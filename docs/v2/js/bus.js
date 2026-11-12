import { esc, fold, stateHtml, getPrefs, savePref, FetchError, isOffline } from "./store.js";

const BASE = "https://services3.arcgis.com/UorD5Aq73toK04Vs/arcgis/rest/services";
const STOPS_LAYER = `${BASE}/Pieturas_ar_sarakstiem_skats/FeatureServer/0`;
const ROUTES_LAYER = `${BASE}/visi_marsruti/FeatureServer/0`;
const WEBMAP = "https://www.arcgis.com/sharing/rest/content/items/144843f39b2b4bb9b7d1eb179c622d31/data";
const SOURCE_APP = "https://experience.arcgis.com/experience/67c47a3f53eb48dab7970827e04d5745/";
const LEAFLET = "https://unpkg.com/leaflet@1.9.4/dist/";
const LEAFLET_JS_SRI = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";
const LEAFLET_CSS_SRI = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
const TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_{tone}_Gray_{layer}/MapServer/tile/{z}/{y}/{x}";
const FALLBACK_COLOR = "#646262";
const STOP_ZOOM = 16;
const HIT_TOLERANCE_PX = 8;
const dark = matchMedia("(prefers-color-scheme: dark)");

let leafletPromise = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    const css = Object.assign(document.createElement("link"), { rel: "stylesheet", href: `${LEAFLET}leaflet.css`, integrity: LEAFLET_CSS_SRI, crossOrigin: "" });
    const js = Object.assign(document.createElement("script"), { src: `${LEAFLET}leaflet.js`, integrity: LEAFLET_JS_SRI, crossOrigin: "" });
    js.onload = () => resolve(window.L);
    js.onerror = () => { leafletPromise = null; css.remove(); js.remove(); reject(new FetchError("offline")); };
    document.head.append(css, js);
  });
  return leafletPromise;
}

async function arcgis(url, params) {
  let response;
  try {
    response = await fetch(`${url}?${new URLSearchParams({ f: "json", ...params })}`);
  } catch {
    throw new FetchError("offline");
  }
  if (!response.ok) throw new FetchError(`http_${response.status}`, response.status);
  const body = await response.json();
  if (body.error) throw new FetchError(`arcgis_${body.error.code}`);
  return body;
}

const routeNumber = text => { const match = String(text ?? "").match(/\d+/); return match ? Number(match[0]) : null; };
const routeNumbers = text => String(text || "").split("|").map(s => s.trim()).filter(s => /^\d+$/.test(s)).map(Number).sort((a, b) => a - b);

async function loadStops() {
  const body = await arcgis(`${STOPS_LAYER}/query`, { where: "1=1", outFields: "*", returnGeometry: "true", outSR: "4326", geometryPrecision: "5", orderByFields: "Nosaukums" });
  if (!Array.isArray(body.features)) throw new FetchError("invalid_stops");
  return body.features
    .map(({ attributes: a, geometry: g }) => ({ id: a.OBJECTID, name: String(a.Nosaukums || "").trim(), direction: String(a["Piezīmes"] || "").trim(), routes: routeNumbers(a["Maršruti"]), lat: g?.y, lon: g?.x }))
    .filter(s => s.name && Number.isFinite(s.lat) && Number.isFinite(s.lon));
}

async function loadRoutes() {
  const body = await arcgis(`${ROUTES_LAYER}/query`, { where: "1=1", outFields: "piezimes,galapunkti", returnGeometry: "true", outSR: "4326", maxAllowableOffset: "0.00005", geometryPrecision: "5" });
  if (!Array.isArray(body.features)) throw new FetchError("invalid_routes");
  return body.features
    .map(({ attributes: a, geometry: g }) => ({ number: routeNumber(a.piezimes), ends: String(a.galapunkti || "").trim(), paths: (g?.paths || []).map(path => path.map(([x, y]) => [y, x])) }))
    .filter(r => r.number !== null)
    .sort((a, b) => a.number - b.number);
}

async function loadColors() {
  try {
    const response = await fetch(`${WEBMAP}?f=json`);
    const layer = (await response.json()).operationalLayers?.find(l => /maršruti/i.test(l.title || "") && l.layerDefinition?.drawingInfo?.renderer?.uniqueValueInfos);
    const colors = new Map();
    for (const info of layer?.layerDefinition.drawingInfo.renderer.uniqueValueInfos || []) {
      const stroke = info.symbol?.symbol?.symbolLayers?.find(s => s.type === "CIMSolidStroke");
      const rgb = Array.isArray(stroke?.color) ? stroke.color : stroke?.color?.values;
      if (Array.isArray(rgb) && routeNumber(info.value) !== null) colors.set(routeNumber(info.value), `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`);
    }
    return colors;
  } catch {
    return new Map();
  }
}

async function loadAttachments(stopId) {
  const body = await arcgis(`${STOPS_LAYER}/queryAttachments`, { objectIds: String(stopId) });
  const infos = body.attachmentGroups?.[0]?.attachmentInfos || [];
  return infos.filter(i => /^image\//.test(i.contentType)).map(i => ({ name: i.name, url: `${STOPS_LAYER}/${stopId}/attachments/${i.id}` }));
}

function distanceM(a, b) {
  const rad = Math.PI / 180;
  const x = (b.lon - a.lon) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  return Math.hypot(x, (b.lat - a.lat) * rad) * 6371000;
}

export function createBus(root) {
  const prefs = getPrefs().v2;
  let L = null;
  let map = null;
  let stops = null;
  let routes = [];
  let colors = new Map();
  let query = "";
  let activeRoute = Number.isInteger(prefs.busRoute) ? prefs.busRoute : null;
  let selectedId = prefs.busStop || null;
  let loading = null;
  let detailToken = 0;
  const routeLayers = new Map();
  const stopMarkers = new Map();

  const colorOf = number => colors.get(number) || FALLBACK_COLOR;
  const chip = (n, tag = "span", extra = "") => `<${tag} class="route-chip" style="--route:${colorOf(n)}" ${extra}>${n}</${tag}>`;
  const visibleStops = () => stops.filter(s => activeRoute === null || s.routes.includes(activeRoute));
  const $ = selector => root.querySelector(selector);

  function renderRouteBar() {
    const cards = [`<button type="button" class="route-card" data-route="" aria-pressed="${activeRoute === null}"><b>Visi</b><small>${routes.length} maršruti</small></button>`,
      ...routes.map(r => `<button type="button" class="route-card" data-route="${r.number}" aria-pressed="${r.number === activeRoute}" style="--route:${colorOf(r.number)}"><b>${r.number}. maršruts</b><small>${esc(r.ends)}</small></button>`)];
    $("[data-routes]").innerHTML = cards.join("");
  }

  function renderList() {
    const needle = fold(query.trim());
    const matches = visibleStops().filter(s => !needle || fold(`${s.name} ${s.direction}`).includes(needle));
    const route = routes.find(r => r.number === activeRoute);
    $("[data-count]").textContent = route ? `${route.number}. maršruts · ${matches.length} pieturas` : `${matches.length} no ${stops.length} pieturām`;
    $("[data-stops]").innerHTML = matches.length
      ? matches.map(s => `<button type="button" class="list-item stop-item" data-stop="${s.id}" aria-current="${s.id === selectedId}"><b>${esc(s.name)}</b><small>${esc(s.direction || "—")}</small><span class="route-chips">${s.routes.map(n => chip(n)).join("")}</span></button>`).join("")
      : stateHtml("Pietura nav atrasta", "Pamēģini citu nosaukumu vai izvēlies visus maršrutus.");
  }

  async function renderDetail() {
    const panel = $("[data-detail]");
    const stop = stops.find(s => s.id === selectedId);
    root.querySelector(".bus").classList.toggle("has-stop", !!stop);
    if (!stop) { panel.innerHTML = ""; return; }
    const token = ++detailToken;
    panel.innerHTML = `
      <div class="stop-head">
        <button type="button" class="icon-button" data-close aria-label="Atpakaļ uz pieturu sarakstu">‹</button>
        <div><h2>${esc(stop.name)}</h2><p class="dim">${esc(stop.direction)}</p></div>
      </div>
      <p class="eyebrow">Izvēlies maršrutu kartē</p>
      <div class="stop-routes">${stop.routes.map(n => `<button type="button" class="route-pill" data-route="${n}" aria-pressed="${n === activeRoute}" style="--route:${colorOf(n)}">${n}. maršruts</button>`).join("")}</div>
      <div class="timetable-img"><div class="skeleton"></div></div>
      <p class="foot"><a href="${SOURCE_APP}" target="_blank" rel="noopener">Valmieras novada karte ↗</a></p>`;
    try {
      const images = await loadAttachments(stop.id);
      if (token !== detailToken) return;
      panel.querySelector(".timetable-img").innerHTML = images.length
        ? images.map(img => `<a href="${esc(img.url)}" target="_blank" rel="noopener" aria-label="Atvērt kustības sarakstu pilnā izmērā"><img src="${esc(img.url)}" alt="Pieturas ${esc(stop.name)} kustības saraksts (${esc(stop.direction)})"></a>`).join("") + '<p class="foot">Oficiālais VTU Valmiera kustības saraksts · pieskaries, lai palielinātu</p>'
        : stateHtml("Kustības saraksts nav pievienots", "Šai pieturai kartē nav pievienots saraksta attēls.");
    } catch (error) {
      if (token !== detailToken) return;
      panel.querySelector(".timetable-img").innerHTML = stateHtml(isOffline(error) ? "Nepieciešams internets" : "Neizdevās ielādēt sarakstu", isOffline(error) ? "Autobusu saraksti tiek ielādēti tiešsaistē." : "Mēģini vēlreiz pēc brīža.", "error");
    }
  }

  function styleMap() {
    for (const [number, layer] of routeLayers) {
      const isActive = activeRoute === null || number === activeRoute;
      layer.setStyle({ opacity: isActive ? 0.9 : 0.12, weight: number === activeRoute ? 6 : 4 });
      if (number === activeRoute) layer.bringToFront();
    }
    for (const stop of stops) {
      const marker = stopMarkers.get(stop.id);
      const isSelected = stop.id === selectedId;
      const isVisible = activeRoute === null || stop.routes.includes(activeRoute);
      marker.setStyle({ radius: isSelected ? 9 : 5, weight: isSelected ? 3 : 2, color: isSelected ? "#007aff" : "#201d1d", fillColor: isSelected ? "#007aff" : "#fdfcfc", fillOpacity: 1 });
      if (isVisible && !map.hasLayer(marker)) marker.addTo(map);
      if (!isVisible && map.hasLayer(marker)) marker.remove();
      if (isSelected && isVisible) marker.bringToFront();
    }
  }

  function fitAll() {
    const bounds = L.latLngBounds(stops.map(s => [s.lat, s.lon]));
    map.fitBounds(bounds, { padding: [24, 24] });
  }

  function selectRoute(number, { fit = true } = {}) {
    activeRoute = number;
    savePref("busRoute", number);
    renderRouteBar();
    renderList();
    styleMap();
    for (const pill of root.querySelectorAll(".route-pill")) pill.setAttribute("aria-pressed", String(Number(pill.dataset.route) === activeRoute));
    if (!fit) return;
    const layer = routeLayers.get(number);
    if (layer) map.flyToBounds(layer.getBounds(), { padding: [32, 32], duration: 0.5 });
    else fitAll();
    $(`[data-route="${number ?? ""}"].route-card`)?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }

  function selectStop(id, { pan = true } = {}) {
    selectedId = id;
    savePref("busStop", id);
    renderList();
    renderDetail();
    styleMap();
    const stop = stops.find(s => s.id === id);
    if (stop && pan) map.flyTo([stop.lat, stop.lon], Math.max(map.getZoom(), STOP_ZOOM), { duration: 0.5 });
    if (stop) $(`[data-stop="${id}"]`)?.scrollIntoView({ block: "nearest" });
  }

  function locate() {
    const button = $("[data-locate]");
    if (!navigator.geolocation) return;
    button.disabled = true;
    navigator.geolocation.getCurrentPosition(position => {
      button.disabled = false;
      const here = { lat: position.coords.latitude, lon: position.coords.longitude };
      const nearest = visibleStops().reduce((best, s) => (!best || distanceM(here, s) < distanceM(here, best) ? s : best), null);
      if (nearest) selectStop(nearest.id);
    }, () => {
      button.disabled = false;
      $("[data-count]").textContent = "Atrašanās vieta nav pieejama — atļauj to pārlūkā";
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  }

  function buildMap() {
    map = L.map($("[data-map]"), { zoomControl: false, attributionControl: true, renderer: L.canvas({ padding: 0.5, tolerance: HIT_TOLERANCE_PX }) });
    L.control.zoom({ position: "bottomright", zoomInTitle: "Pietuvināt", zoomOutTitle: "Attālināt" }).addTo(map);
    L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);
    const selected = stops.find(s => s.id === selectedId);
    if (selected) map.setView([selected.lat, selected.lon], STOP_ZOOM);
    else if (routes.some(r => r.number === activeRoute)) map.fitBounds(L.latLngBounds(routes.find(r => r.number === activeRoute).paths.flat()), { padding: [32, 32] });
    else fitAll();
    const tone = dark.matches ? "Dark" : "Light";
    L.tileLayer(TILES.replace("{tone}", tone).replace("{layer}", "Base"), { maxZoom: 19, maxNativeZoom: 16, attribution: "© Esri, Valmieras novada pašvaldība" }).addTo(map);
    map.createPane("labels").style.pointerEvents = "none";
    map.getPane("labels").style.zIndex = "350";
    L.tileLayer(TILES.replace("{tone}", tone).replace("{layer}", "Reference"), { maxZoom: 19, maxNativeZoom: 16, pane: "labels" }).addTo(map);
    for (const route of routes) {
      const layer = L.polyline(route.paths, { color: colorOf(route.number), weight: 4, opacity: 0.9, lineCap: "round", lineJoin: "round" })
        .bindTooltip(`${route.number}. maršruts · ${esc(route.ends)}`, { sticky: true })
        .on("click", () => selectRoute(route.number === activeRoute ? null : route.number, { fit: false }))
        .addTo(map);
      routeLayers.set(route.number, layer);
    }
    for (const stop of stops) {
      const marker = L.circleMarker([stop.lat, stop.lon], { radius: 5 })
        .bindTooltip(`<b>${esc(stop.name)}</b><br>${esc(stop.direction)}`, { direction: "top", offset: [0, -6] })
        .on("click", () => selectStop(stop.id, { pan: false }))
        .addTo(map);
      stopMarkers.set(stop.id, marker);
    }
    styleMap();
  }

  function renderShell() {
    root.innerHTML = `<div class="bus">
      <aside class="bus-side">
        <div class="bus-search">
          <input class="input" type="search" data-search placeholder="Meklēt pieturu…" value="${esc(query)}" aria-label="Meklēt pieturu" autocomplete="off">
          <p class="dim" data-count></p>
        </div>
        <div class="bus-stops list" data-stops></div>
        <div class="bus-detail" data-detail></div>
      </aside>
      <div class="bus-map-wrap">
        <div class="bus-map" data-map role="application" aria-label="Autobusu maršrutu karte"></div>
        <div class="map-tools">
          <button type="button" class="icon-button" data-home aria-label="Rādīt visu karti" title="Visa karte">⌂</button>
          <button type="button" class="icon-button" data-locate aria-label="Tuvākā pietura" title="Tuvākā pietura">◎</button>
        </div>
        <div class="route-bar"><span class="eyebrow">Maršruti</span><div class="route-cards" data-routes></div></div>
      </div>
    </div>`;
    if (!stops.some(s => s.id === selectedId)) selectedId = null;
    if (!routes.some(r => r.number === activeRoute)) activeRoute = null;
    renderRouteBar();
    renderList();
    renderDetail();
    buildMap();
  }

  root.addEventListener("click", event => {
    if (!stops) return;
    const stopButton = event.target.closest("[data-stop]");
    if (stopButton) return selectStop(Number(stopButton.dataset.stop));
    const routeButton = event.target.closest("[data-route]");
    if (routeButton) {
      const number = routeButton.dataset.route === "" ? null : Number(routeButton.dataset.route);
      return selectRoute(routeButton.classList.contains("route-pill") && number === activeRoute ? null : number);
    }
    if (event.target.closest("[data-close]")) { selectedId = null; savePref("busStop", null); renderList(); renderDetail(); styleMap(); return; }
    if (event.target.closest("[data-home]")) return selectRoute(null);
    if (event.target.closest("[data-locate]")) locate();
  });
  root.addEventListener("input", event => {
    if (!event.target.matches("[data-search]") || !stops) return;
    query = event.target.value;
    renderList();
  });

  return {
    async open() {
      if (map) { requestAnimationFrame(() => map.invalidateSize()); return; }
      if (loading) return loading;
      root.innerHTML = '<div class="skeleton" aria-label="Ielādē"></div>';
      loading = Promise.all([loadLeaflet(), loadStops(), loadRoutes(), loadColors()]).then(([leaflet, s, r, c]) => {
        L = leaflet;
        stops = s;
        routes = r;
        colors = c;
        renderShell();
      }).catch(error => {
        console.error("bus map failed", error);
        stops = null;
        root.innerHTML = stateHtml(isOffline(error) ? "Nepieciešams internets" : "Neizdevās ielādēt karti", isOffline(error) ? "Pilsētas autobusu karte un saraksti tiek ielādēti tiešsaistē no Valmieras novada kartes." : "Karte pašlaik neatbild. Mēģini vēlreiz pēc brīža.", "error") + `<p class="foot"><a href="${SOURCE_APP}" target="_blank" rel="noopener">Atvērt Valmieras novada karti ↗</a></p>`;
      }).finally(() => { loading = null; });
      return loading;
    },
  };
}
