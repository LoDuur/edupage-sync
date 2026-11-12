import { API, esc, fold, stateHtml, getPrefs, savePref, fetchJSON, addDays, todayIso, formatStamp, isOffline } from "./store.js";

const SUGGEST_LIMIT = 8;
const TRAIN_TYPE = 2;
const LINK_1188 = "https://www.1188.lv/satiksme";

const clock = minutes => {
  const day = Math.floor(minutes / 1440);
  const m = minutes % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}${day ? `<sup>+${day}</sup>` : ""}`;
};
const duration = minutes => (minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`);
const nowMinutes = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

export function createIntercity(root) {
  let core = null;
  let router = null;
  let loading = null;
  let placeContext = null;
  const fares = new Map();
  const saved = getPrefs().v2.trip || {};
  const picked = { from: null, to: null };

  function contextOf(placeIdx) {
    if (!placeContext) {
      placeContext = new Map();
      for (const [routeIdx, , , stopIdxs] of core.trips) {
        for (const stopIdx of stopIdxs) {
          const place = core.stops[stopIdx][3];
          if (!placeContext.has(place)) placeContext.set(place, core.routes[routeIdx][1]);
        }
      }
    }
    return placeContext.get(placeIdx) || "";
  }

  function resolveSaved(value) {
    if (!value || typeof value.name !== "string") return null;
    let best = null;
    core.places.forEach(([name, lat, lon], idx) => {
      if (name !== value.name) return;
      const distance = Math.hypot(lat - value.lat, lon - value.lon);
      if (!best || distance < best.distance) best = { idx, distance };
    });
    return best ? best.idx : null;
  }

  function suggestions(text) {
    const needle = fold(text.trim());
    if (needle.length < 2) return [];
    const starts = [];
    const contains = [];
    core.places.forEach(([name], idx) => {
      const folded = fold(name);
      if (folded.startsWith(needle)) starts.push(idx);
      else if (folded.includes(needle)) contains.push(idx);
    });
    return [...starts, ...contains].slice(0, SUGGEST_LIMIT);
  }

  function setPlace(which, idx) {
    picked[which] = idx;
    const input = root.querySelector(`[data-place="${which}"]`);
    input.value = idx === null ? "" : core.places[idx][0];
    root.querySelector(`[data-suggest="${which}"]`).hidden = true;
  }

  function showSuggestions(which) {
    const box = root.querySelector(`[data-suggest="${which}"]`);
    const list = suggestions(root.querySelector(`[data-place="${which}"]`).value);
    box.innerHTML = list.map((idx, i) => `<button type="button" data-pick="${which}:${idx}" aria-selected="${i === 0}">${esc(core.places[idx][0])}<br><small>${esc(contextOf(idx))}</small></button>`).join("");
    box.hidden = !list.length;
  }

  function fareShard(key) {
    const shard = router.shardOf(key, core.fareShards);
    if (!fares.has(shard)) fares.set(shard, fetchJSON(`${API}/transit/fares/${shard}`).then(r => r.body).catch(() => null));
    return fares.get(shard);
  }

  async function legPrice(leg) {
    for (const key of router.fareKeys(core, leg.routeIdx)) {
      const price = router.legFare(await fareShard(key), key, leg.fromStop, leg.toStop);
      if (price !== null) return price;
    }
    return null;
  }

  async function priceOf(journey) {
    const prices = await Promise.all(journey.legs.map(legPrice));
    const known = prices.filter(p => p !== null);
    return { total: known.reduce((sum, p) => sum + p, 0), known: known.length, complete: known.length === prices.length };
  }

  function legHtml(leg, previous) {
    const [shortName, longName, agencyIdx, type] = core.routes[leg.routeIdx];
    const headsign = core.trips[leg.tripIdx][2];
    const walk = previous && previous.toStop !== leg.fromStop ? `<li class="leg"><time>${clock(previous.arr)}</time><p class="walk">[·] kājām uz pieturu ${esc(core.stops[leg.fromStop][0])}</p></li>` : "";
    return `${walk}<li class="leg"><time>${clock(leg.dep)}–${clock(leg.arr)}</time><p><b>${type === TRAIN_TYPE ? "Vilciens" : "Autobuss"} ${esc(shortName)}</b> ${esc(longName)}${headsign ? ` → ${esc(headsign)}` : ""}<br><span class="dim">${esc(core.stops[leg.fromStop][0])} → ${esc(core.stops[leg.toStop][0])} · ${esc(core.agencies[agencyIdx][0])}</span></p></li>`;
  }

  function journeyHtml(journey, i) {
    const agencies = [...new Set(journey.legs.map(l => core.routes[l.routeIdx][2]))];
    const links = agencies.map(a => core.agencies[a][1] ? `<a class="button button-secondary button-small" href="${esc(core.agencies[a][1])}" target="_blank" rel="noopener">Biļetes: ${esc(core.agencies[a][0])} ↗</a>` : "").join("");
    return `<article class="journey">
      <div class="journey-head">
        <div class="journey-times">${clock(journey.dep)} → ${clock(journey.arr)}</div>
        <div class="journey-sum">${duration(journey.duration)} · ${journey.transfers ? `${journey.transfers} pārsēšanās` : "bez pārsēšanās"}</div>
        <div class="journey-price" data-price="${i}">…<small>cena</small></div>
      </div>
      <ol class="legs">${journey.legs.map((leg, j) => legHtml(leg, journey.legs[j - 1])).join("")}</ol>
      <div class="journey-links">${links}<a class="button button-secondary button-small" href="${LINK_1188}" target="_blank" rel="noopener">Pārbaudīt 1188.lv ↗</a></div>
    </article>`;
  }

  async function runSearch() {
    const results = root.querySelector("[data-results]");
    const date = root.querySelector("[data-date]").value;
    const time = root.querySelector("[data-time]").value || "00:00";
    if (picked.from === null || picked.to === null) {
      results.innerHTML = stateHtml("Izvēlies abas pieturas", "Sāc rakstīt nosaukumu un izvēlies pieturu no saraksta.");
      return;
    }
    if (picked.from === picked.to) {
      results.innerHTML = stateHtml("Izvēlies dažādas pieturas", "Sākuma un galamērķa pietura ir vienāda.");
      return;
    }
    const lastDate = addDays(core.start, core.days - 1);
    if (!date || date < core.start || date > lastDate) {
      results.innerHTML = stateHtml("Datums ārpus pieejamā saraksta", `Saraksti pieejami no ${core.start} līdz ${lastDate}.`);
      return;
    }
    const remember = idx => ({ name: core.places[idx][0], lat: core.places[idx][1], lon: core.places[idx][2] });
    savePref("trip", { from: remember(picked.from), to: remember(picked.to) });
    const [h, m] = time.split(":").map(Number);
    const journeys = router.search(core, { fromPlace: picked.from, toPlace: picked.to, date, afterMinutes: h * 60 + m });
    if (!journeys.length) {
      results.innerHTML = stateHtml("Savienojums nav atrasts", "Šajā dienā pēc izvēlētā laika nav reisu ar ne vairāk kā 2 pārsēšanās. Pamēģini agrāku laiku vai citu dienu.");
      return;
    }
    results.innerHTML = `<div class="journeys">${journeys.map(journeyHtml).join("")}</div><p class="foot">Dati: Autotransporta direkcijas un VIVI atvērtie GTFS saraksti, atjaunoti ${esc(formatStamp(core.generated))}. Pirms brauciena pārbaudi pārvadātāja vietnē.</p>`;
    journeys.forEach(async (journey, i) => {
      const price = await priceOf(journey);
      const cell = results.querySelector(`[data-price="${i}"]`);
      if (!cell) return;
      if (!price.known) cell.innerHTML = "—<small>cena nav zināma</small>";
      else if (price.complete) cell.innerHTML = `${price.total.toFixed(2)} €<small>${journey.legs.length > 1 ? "kopā" : "biļete"}</small>`;
      else cell.innerHTML = `no ${price.total.toFixed(2)} €<small>daļai posmu cena nav zināma</small>`;
    });
  }

  function renderForm() {
    const today = todayIso();
    const first = core.start > today ? core.start : today;
    root.innerHTML = `<form class="trip-form" data-form novalidate>
        <label class="field suggest from"><span>No</span><input class="input" data-place="from" placeholder="piem. Valmieras AO" autocomplete="off" spellcheck="false"><div class="suggest-list" data-suggest="from" hidden></div></label>
        <button class="icon-button swap" type="button" data-swap aria-label="Samainīt virzienus">⇄</button>
        <label class="field suggest to"><span>Uz</span><input class="input" data-place="to" placeholder="piem. Rīgas SAO" autocomplete="off" spellcheck="false"><div class="suggest-list" data-suggest="to" hidden></div></label>
        <div class="when" style="display:contents">
          <label class="field"><span>Datums</span><input class="input" type="date" data-date value="${first}" min="${core.start}" max="${addDays(core.start, core.days - 1)}"></label>
          <label class="field"><span>Laiks no</span><input class="input" type="time" data-time value="${String(Math.floor(nowMinutes() / 60)).padStart(2, "0")}:${String(nowMinutes() % 60).padStart(2, "0")}"></label>
          <button class="button button-primary" type="submit">Meklēt</button>
        </div>
      </form>
      <div data-results></div>`;
    const from = resolveSaved(saved.from);
    const to = resolveSaved(saved.to);
    if (from !== null) setPlace("from", from);
    if (to !== null) setPlace("to", to);
  }

  root.addEventListener("input", event => {
    const which = event.target.dataset?.place;
    if (!which || !core) return;
    picked[which] = null;
    showSuggestions(which);
  });
  root.addEventListener("keydown", event => {
    const which = event.target.dataset?.place;
    if (!which || event.key !== "Enter") return;
    const first = root.querySelector(`[data-suggest="${which}"]:not([hidden]) button`);
    if (first) { event.preventDefault(); first.click(); }
  });
  root.addEventListener("click", event => {
    const pick = event.target.closest("[data-pick]");
    if (pick) {
      const [which, idx] = pick.dataset.pick.split(":");
      setPlace(which, Number(idx));
      return;
    }
    if (event.target.closest("[data-swap]") && core) {
      const { from, to } = picked;
      setPlace("from", to);
      setPlace("to", from);
    }
  });
  root.addEventListener("focusout", event => {
    const which = event.target.dataset?.place;
    if (which) setTimeout(() => { const box = root.querySelector(`[data-suggest="${which}"]`); if (box) box.hidden = true; }, 150);
  });
  root.addEventListener("submit", event => {
    event.preventDefault();
    if (core) runSearch();
  });

  return {
    async open() {
      if (core || loading) return loading;
      root.innerHTML = '<div class="skeleton" aria-label="Ielādē"></div>';
      loading = Promise.all([import("./route.js"), fetchJSON(`${API}/transit/core`)]).then(([module, { body }]) => {
        if (!body || !Array.isArray(body.places) || !Array.isArray(body.trips)) throw new Error("invalid_core");
        router = module;
        core = body;
        renderForm();
      }).catch(error => {
        const offline = isOffline(error);
        root.innerHTML = stateHtml(offline ? "Nepieciešams internets" : "Starppilsētu saraksti nav pieejami", offline ? "Maršrutu meklēšanai vajag interneta savienojumu." : "Saraksta dati pašlaik nav ielādējami. Mēģini vēlreiz vēlāk vai izmanto 1188.lv.", "error") + `<p class="foot"><a href="${LINK_1188}" target="_blank" rel="noopener">Atvērt 1188.lv satiksmi ↗</a></p>`;
      }).finally(() => { loading = null; });
      return loading;
    },
  };
}
