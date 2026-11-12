import { esc, fold, stateHtml, getPrefs, savePref, FetchError, isOffline } from "./store.js";

const BASE = "https://services3.arcgis.com/UorD5Aq73toK04Vs/arcgis/rest/services";
const STOPS_LAYER = `${BASE}/Pieturas_ar_sarakstiem_skats/FeatureServer/0`;
const ROUTES_LAYER = `${BASE}/visi_marsruti/FeatureServer/0`;
const SOURCE_APP = "https://experience.arcgis.com/experience/67c47a3f53eb48dab7970827e04d5745/";

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

const routeNumbers = text => String(text || "").split("|").map(s => s.trim()).filter(s => /^\d+$/.test(s)).map(Number).sort((a, b) => a - b);

async function loadStops() {
  const body = await arcgis(`${STOPS_LAYER}/query`, { where: "1=1", outFields: "*", returnGeometry: "false", orderByFields: "Nosaukums" });
  if (!Array.isArray(body.features)) throw new FetchError("invalid_stops");
  return body.features.map(({ attributes: a }) => ({ id: a.OBJECTID, name: String(a.Nosaukums || "").trim(), direction: String(a["Piezīmes"] || "").trim(), routes: routeNumbers(a["Maršruti"]) })).filter(s => s.name);
}

async function loadRoutes() {
  const body = await arcgis(`${ROUTES_LAYER}/query`, { where: "1=1", outFields: "piezimes,galapunkti", returnGeometry: "false" });
  if (!Array.isArray(body.features)) throw new FetchError("invalid_routes");
  return body.features.map(({ attributes: a }) => ({ number: Number(a.piezimes), ends: String(a.galapunkti || "").trim() })).filter(r => Number.isInteger(r.number)).sort((a, b) => a.number - b.number);
}

async function loadAttachments(stopId) {
  const body = await arcgis(`${STOPS_LAYER}/queryAttachments`, { objectIds: String(stopId) });
  const infos = body.attachmentGroups?.[0]?.attachmentInfos || [];
  return infos.filter(i => /^image\//.test(i.contentType)).map(i => ({ name: i.name, url: `${STOPS_LAYER}/${stopId}/attachments/${i.id}` }));
}

const chips = routes => `<span class="route-chips">${routes.map(n => `<span class="route-chip">${n}</span>`).join("")}</span>`;

export function createBus(root) {
  let stops = null;
  let routes = [];
  let query = "";
  let routeFilter = null;
  let selectedId = getPrefs().v2.busStop || null;
  let loading = null;
  let detailToken = 0;

  function filtered() {
    const needle = fold(query.trim());
    return stops.filter(s => (!needle || fold(`${s.name} ${s.direction}`).includes(needle)) && (routeFilter === null || s.routes.includes(routeFilter)));
  }

  function renderList() {
    const list = root.querySelector("[data-stops]");
    const matches = filtered();
    list.innerHTML = matches.length
      ? matches.map(s => `<button type="button" class="list-item" data-stop="${s.id}" aria-current="${s.id === selectedId}"><b>${esc(s.name)}</b><small>${esc(s.direction || "—")}</small>${chips(s.routes)}</button>`).join("")
      : stateHtml("Pietura nav atrasta", "Pamēģini citu nosaukumu vai noņem maršruta filtru.");
    for (const button of root.querySelectorAll("[data-route]")) button.setAttribute("aria-pressed", String(Number(button.dataset.route) === routeFilter || (button.dataset.route === "" && routeFilter === null)));
    const route = routes.find(r => r.number === routeFilter);
    root.querySelector("[data-route-info]").textContent = route ? `${route.number}. maršruts: ${route.ends}` : `${stops.length} pieturas · ${routes.length} maršruti`;
  }

  async function renderDetail() {
    const panel = root.querySelector("[data-detail]");
    const split = root.querySelector(".split");
    const stop = stops.find(s => s.id === selectedId);
    split.classList.toggle("has-detail", !!stop);
    if (!stop) {
      panel.innerHTML = stateHtml("Izvēlies pieturu", "Pieturas kustības saraksts parādīsies šeit.");
      return;
    }
    const token = ++detailToken;
    const routeLines = stop.routes.map(n => `<li><span class="route-chip">${n}</span><span>${esc(routes.find(r => r.number === n)?.ends || "")}</span></li>`).join("");
    const head = `<div class="panel-head"><div><button type="button" class="icon-button back" data-back aria-label="Atpakaļ uz pieturām">‹</button> <h2 style="display:inline">${esc(stop.name)}</h2><p class="dim" style="margin:0">${esc(stop.direction)}</p></div><a class="button button-secondary button-small" href="${SOURCE_APP}" target="_blank" rel="noopener">Karte ↗</a></div>`;
    panel.innerHTML = `${head}<ul class="route-lines">${routeLines}</ul><div class="timetable-img"><div class="skeleton"></div></div>`;
    try {
      const images = await loadAttachments(stop.id);
      if (token !== detailToken) return;
      panel.querySelector(".timetable-img").innerHTML = images.length
        ? images.map(img => `<a href="${esc(img.url)}" target="_blank" rel="noopener" aria-label="Atvērt kustības sarakstu pilnā izmērā"><img src="${esc(img.url)}" alt="Pieturas ${esc(stop.name)} kustības saraksts (${esc(stop.direction)})" loading="lazy"></a>`).join("") + '<p class="foot">Oficiālais VTU Valmiera kustības saraksts. Pieskaries attēlam, lai to palielinātu.</p>'
        : stateHtml("Kustības saraksts nav pievienots", "Šai pieturai ArcGIS kartē nav pievienots saraksta attēls.");
    } catch (error) {
      if (token !== detailToken) return;
      panel.querySelector(".timetable-img").innerHTML = stateHtml(isOffline(error) ? "Nepieciešams internets" : "Neizdevās ielādēt sarakstu", isOffline(error) ? "Autobusu saraksti tiek ielādēti tiešsaistē." : "Mēģini vēlreiz pēc brīža.", "error");
    }
  }

  function renderShell() {
    const routeButtons = [`<button type="button" data-route="" aria-pressed="true">Visi</button>`, ...routes.map(r => `<button type="button" data-route="${r.number}" title="${esc(r.ends)}" aria-pressed="false">${r.number}</button>`)].join("");
    root.innerHTML = `<div class="split">
      <div class="bus-list-col">
        <div class="bus-tools">
          <input class="input" type="search" data-search placeholder="Meklēt pieturu…" value="${esc(query)}" aria-label="Meklēt pieturu" autocomplete="off">
          <div class="chips" role="group" aria-label="Maršruts">${routeButtons}</div>
          <p class="dim" data-route-info style="margin:0"></p>
        </div>
        <div class="list" data-stops></div>
      </div>
      <div class="panel bus-detail" data-detail></div>
    </div>`;
    renderList();
    renderDetail();
  }

  root.addEventListener("click", event => {
    if (!stops) return;
    const stopButton = event.target.closest("[data-stop]");
    if (stopButton) {
      selectedId = Number(stopButton.dataset.stop);
      savePref("busStop", selectedId);
      renderList();
      renderDetail();
      return;
    }
    const routeButton = event.target.closest("[data-route]");
    if (routeButton) {
      routeFilter = routeButton.dataset.route === "" ? null : Number(routeButton.dataset.route);
      renderList();
      return;
    }
    if (event.target.closest("[data-back]")) {
      selectedId = null;
      renderList();
      renderDetail();
    }
  });
  root.addEventListener("input", event => {
    if (!event.target.matches("[data-search]") || !stops) return;
    query = event.target.value;
    renderList();
  });

  return {
    async open() {
      if (stops || loading) return loading;
      root.innerHTML = '<div class="skeleton" aria-label="Ielādē"></div>';
      loading = Promise.all([loadStops(), loadRoutes()]).then(([s, r]) => {
        stops = s;
        routes = r;
        if (!stops.some(x => x.id === selectedId)) selectedId = null;
        renderShell();
      }).catch(error => {
        root.innerHTML = stateHtml(isOffline(error) ? "Nepieciešams internets" : "Neizdevās ielādēt pieturas", isOffline(error) ? "Pilsētas autobusu pieturas un saraksti tiek ielādēti tiešsaistē no Valmieras novada kartes." : "ArcGIS karte pašlaik neatbild. Mēģini vēlreiz pēc brīža.", "error");
      }).finally(() => { loading = null; });
      return loading;
    },
  };
}
