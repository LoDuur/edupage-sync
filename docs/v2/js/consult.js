import { esc, fold, stateHtml, DAY_KEYS, DAY_SHORT, DAY_LONG, getPrefs, savePref, parseIso, todayIso } from "./store.js";

const ALL = "all";

function todayKey() {
  const day = parseIso(todayIso()).getDay();
  return day >= 1 && day <= 5 ? DAY_KEYS[day - 1] : ALL;
}

function cardHtml(teacher, day) {
  const days = day === ALL ? DAY_KEYS.filter(key => teacher.days?.[key]?.length) : [day];
  const rows = days.map(key => `<div><dt>${DAY_LONG[DAY_KEYS.indexOf(key)]}</dt><dd>${teacher.days[key].map(t => `<span>${esc(t)}</span>`).join("")}</dd></div>`).join("");
  const room = teacher.room ? `${esc(teacher.room)}` : "kabinets nav norādīts";
  return `<article class="card${day !== ALL ? " is-highlight" : ""}">
    <div class="card-head"><h3>${esc(teacher.name)}</h3><p>${room}${teacher.note ? ` · ${esc(teacher.note)}` : ""}</p></div>
    <dl>${rows}</dl>
  </article>`;
}

export function createConsult(root, lead) {
  let data = null;
  let day = getPrefs().v2.consultDay || todayKey();
  let query = "";

  function renderList() {
    const list = root.querySelector("[data-cards]");
    const count = root.querySelector("[data-count]");
    if (!list) return;
    const needle = fold(query.trim());
    const teachers = data.teachers.filter(t => (day === ALL ? DAY_KEYS.some(k => t.days?.[k]?.length) : t.days?.[day]?.length) && (!needle || fold(`${t.name} ${t.room || ""}`).includes(needle)));
    count.textContent = `${teachers.length} no ${data.teachers.length} skolotājiem`;
    list.innerHTML = teachers.length ? teachers.map(t => cardHtml(t, day)).join("") : stateHtml("Nav atrasts", day === ALL ? "Pamēģini citu meklēšanas vārdu." : `${DAY_LONG[DAY_KEYS.indexOf(day)]} neviens atbilstošs skolotājs konsultācijas nepiedāvā.`);
    for (const button of root.querySelectorAll("[data-day]")) button.setAttribute("aria-pressed", String(button.dataset.day === day));
  }

  function render() {
    lead.textContent = `${data.title} · apstiprināts ${data.approved.split("-").reverse().join(".")}.`;
    const today = todayKey();
    const buttons = [[ALL, "Visas"], ...DAY_KEYS.map((key, i) => [key, DAY_SHORT[i]])]
      .map(([key, label]) => `<button type="button" data-day="${key}" class="${key === today && key !== ALL ? "today" : ""}" aria-pressed="false">${label}</button>`).join("");
    const footnotes = Object.entries(data.footnotes || {}).map(([mark, text]) => `${esc(mark)} ${esc(text)}`).join(" · ");
    root.innerHTML = `
      ${data.notice ? `<div class="callout">[!] ${esc(data.notice)}</div>` : ""}
      <div class="consult-tools">
        <input class="input" type="search" data-search placeholder="Meklēt skolotāju vai kabinetu…" value="${esc(query)}" aria-label="Meklēt skolotāju vai kabinetu">
        <div class="chips" role="group" aria-label="Diena">${buttons}</div>
      </div>
      <p class="dim" data-count></p>
      <div class="cards" data-cards></div>
      <p class="foot">${footnotes ? `${footnotes}<br>` : ""}Avots: <a href="${esc(data.source)}" target="_blank" rel="noopener">skolas publicētais grafiks (PDF)</a></p>`;
    renderList();
  }

  root.addEventListener("click", event => {
    const button = event.target.closest("[data-day]");
    if (!button || !data) return;
    day = button.dataset.day;
    savePref("consultDay", day);
    renderList();
  });
  root.addEventListener("input", event => {
    if (!event.target.matches("[data-search]")) return;
    query = event.target.value;
    renderList();
  });

  return {
    setData(value) {
      if (!value || !Array.isArray(value.teachers)) throw new Error("invalid consultations data");
      data = value;
      if (day !== ALL && !DAY_KEYS.includes(day)) day = todayKey();
      render();
    },
    showLoading() { root.innerHTML = '<div class="skeleton" aria-label="Ielādē"></div>'; },
    showError(html) { root.innerHTML = html; },
    get loaded() { return !!data; },
  };
}
