import { esc, subjectHue, addDays, weekStartOf, todayIso, shortDate, hhmm, weekRange, stateHtml, DAY_SHORT, DAY_MIN, savePref, getPrefs, parseIso } from "./store.js";

const MIN_PERIODS = 10;
const GAP_MINUTES = 15;
const mobile = matchMedia("(max-width: 767px)");

const periodRange = periods => {
  const numbers = (String(periods).match(/\d+/g) || ["1"]).map(Number);
  return [numbers[0], numbers[numbers.length - 1]];
};
const subPeriods = sub => (String(sub.period).match(/\d+/g) || []).map(Number);
const isBreak = event => /^pusdienas/i.test(event.summary);
const minutesOf = iso => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));

function lessonHtml(event, subs, now, extraStyle = "") {
  const [first, last] = periodRange(event.periods);
  const touched = subs.some(sub => sub.date === event.date && subPeriods(sub).some(p => p >= first && p <= last));
  const start = Date.parse(event.start);
  const end = Date.parse(event.end);
  const classes = ["lesson", isBreak(event) && "is-break", now >= start && now < end && "is-now", now >= end && "is-past"].filter(Boolean).join(" ");
  const teacher = event.teachers?.join(", ") || "";
  const title = [event.summary, `${hhmm(event.start)}–${hhmm(event.end)}`, `${event.periods} st.`, event.location, teacher, event.groups?.join(", ")].filter(Boolean).join(" · ");
  return `<div class="${classes}" style="--hue:${subjectHue(event.summary)};${extraStyle}" title="${esc(title)}">
    ${touched ? '<span class="flag">izmaiņa</span>' : ""}
    <div class="lesson-top">${hhmm(event.start)}–${hhmm(event.end)}</div>
    <div class="lesson-title">${esc(event.summary)}</div>
    <div class="lesson-meta"><span class="who">${esc(teacher)}</span><span class="room">${esc(event.location)}</span></div>
  </div>`;
}

export function createTimetable(elements, { onWeekChange } = {}) {
  const prefs = getPrefs().v2;
  let index = null;
  let classData = null;
  let weekStart = null;
  let selectedDay = null;
  let layout = prefs.layout === "day" ? "day" : "week";

  const weeks = () => (classData?.weeks || []).map(w => w.weekStart).sort();
  const eventsOn = iso => (classData?.events || []).filter(e => e.date === iso).sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  const subsOn = iso => (classData?.substitutions || []).filter(s => s.date === iso);

  function defaultWeek() {
    const today = todayIso();
    const list = weeks();
    const isWeekend = [0, 6].includes(parseIso(today).getDay());
    const preferred = isWeekend ? addDays(weekStartOf(today), 7) : weekStartOf(today);
    if (list.includes(preferred)) return preferred;
    if (list.includes(weekStartOf(today))) return weekStartOf(today);
    return list.find(w => w >= preferred) || list[list.length - 1] || weekStartOf(today);
  }

  function defaultDay() {
    const today = todayIso();
    if (weekStartOf(today) === weekStart && parseIso(today).getDay() >= 1 && parseIso(today).getDay() <= 5) return today;
    return weekStart;
  }

  function periodCount() {
    const last = Math.max(0, ...(classData?.events || []).filter(e => weekStartOf(e.date) === weekStart).map(e => periodRange(e.periods)[1]));
    return Math.max(MIN_PERIODS, last);
  }

  function unpublishedNote() {
    const next = index?.nextWeek;
    if (!next || next.status !== "unpublished" || weeks().includes(next.weekStart)) return "";
    if (weekStart !== weeks()[weeks().length - 1]) return "";
    return `<p class="foot">[i] Nākamās nedēļas (${weekRange(next.weekStart)}) saraksts vēl nav publicēts. Tas parādīsies šeit automātiski, tiklīdz EduPage to publicēs.</p>`;
  }

  function renderWeek(now) {
    const periods = periodCount();
    const bells = index?.bells?.midweek || [];
    const head = Array.from({ length: periods }, (_, i) => `<div class="grid-period"><b>${i + 1}</b><small>${esc((bells[i] || "").replace("-", "–"))}</small></div>`).join("");
    const days = Array.from({ length: 5 }, (_, i) => {
      const iso = addDays(weekStart, i);
      const events = eventsOn(iso);
      const subs = subsOn(iso);
      const cells = events.map(e => { const [a, b] = periodRange(e.periods); return lessonHtml(e, subs, now, `grid-column:${a}/${b + 1}`); }).join("");
      const subsRow = subs.length ? `<div class="subs-row"><b>Aizvietošana:</b> ${subs.map(s => `${esc(s.period)}. st. ${esc(s.text)}`).join(" · ")}</div>` : "";
      return `<div class="grid-day${iso === todayIso() ? " is-today" : ""}"><b>${DAY_SHORT[i]}</b><small>${shortDate(iso)}</small></div>
        <div class="grid-row${events.length ? "" : " is-empty"}">${cells || '<span class="grid-empty">Nav stundu</span>'}${subsRow}</div>`;
    }).join("");
    return `<div class="grid-scroll"><div class="week-grid" style="--periods:${periods}"><div class="grid-corner">Diena</div>${head}${days}</div></div>`;
  }

  function renderDay(now) {
    const strip = Array.from({ length: 5 }, (_, i) => {
      const iso = addDays(weekStart, i);
      return `<button type="button" data-day="${iso}" aria-pressed="${iso === selectedDay}" class="${iso === todayIso() ? "is-today" : ""}"><span>${DAY_MIN[i]}</span><b>${shortDate(iso).slice(0, 2)}</b></button>`;
    }).join("");
    const events = eventsOn(selectedDay);
    const subs = subsOn(selectedDay);
    const subsBox = subs.length ? `<div class="subs-box"><b>Aizvietošana</b><ul>${subs.map(s => `<li>${esc(s.period)}. st. — ${esc(s.text)}</li>`).join("")}</ul></div>` : "";
    let previousEnd = null;
    const items = events.map(event => {
      const gap = previousEnd === null ? 0 : minutesOf(event.start) - previousEnd;
      previousEnd = Math.max(previousEnd ?? 0, minutesOf(event.end));
      const gapRow = gap >= GAP_MINUTES ? `<div class="day-gap">brīvs ${gap} min</div>` : "";
      return `${gapRow}<div class="day-item"><time>${hhmm(event.start)}<small>${hhmm(event.end)}</small></time>${lessonHtml(event, subs, now)}</div>`;
    }).join("");
    return `<div class="day-strip" role="group" aria-label="Diena">${strip}</div>${subsBox}${items ? `<div class="day-list">${items}</div>` : stateHtml("Nav stundu", "Šajā dienā stundu saraksts ir tukšs.")}`;
  }

  function renderNow(now) {
    const today = todayIso();
    const upcoming = (classData?.events || []).filter(e => Date.parse(e.end) > now && !isBreak(e)).sort((a, b) => a.start.localeCompare(b.start));
    const current = upcoming.find(e => Date.parse(e.start) <= now);
    const next = upcoming.find(e => Date.parse(e.start) > now);
    const parts = [];
    if (current) parts.push(`<div><span>Tagad</span> <b>${esc(current.summary)}</b> līdz ${hhmm(current.end)} · ${esc(current.location || "—")}</div>`);
    if (next) {
      const when = next.date === today ? hhmm(next.start) : `${DAY_SHORT[(parseIso(next.date).getDay() + 6) % 7]} ${shortDate(next.date)} ${hhmm(next.start)}`;
      parts.push(`<div><span>Nākamā</span> <b>${esc(next.summary)}</b> ${when} · ${esc(next.location || "—")}</div>`);
    }
    elements.nowStrip.innerHTML = parts.join("");
    elements.nowStrip.hidden = !parts.length;
  }

  function render() {
    if (!classData) return;
    const now = Date.now();
    const list = weeks();
    elements.weekLabel.textContent = weekRange(weekStart);
    elements.prev.disabled = !list.some(w => w < weekStart);
    elements.next.disabled = !list.some(w => w > weekStart);
    for (const button of elements.layoutButtons) button.setAttribute("aria-checked", String(button.dataset.layout === layout));
    renderNow(now);
    if (!list.length) {
      elements.root.innerHTML = stateHtml("Saraksts nav pieejams", "Šai klasei EduPage pašlaik nav publicēta neviena nedēļa.");
      return;
    }
    const useDay = layout === "day" || mobile.matches;
    if (useDay && weekStartOf(selectedDay || "") !== weekStart) selectedDay = defaultDay();
    elements.root.innerHTML = (useDay ? renderDay(now) : renderWeek(now)) + unpublishedNote();
  }

  function goWeek(direction) {
    const list = weeks();
    const target = direction < 0 ? list.filter(w => w < weekStart).pop() : list.find(w => w > weekStart);
    if (!target) return;
    weekStart = target;
    selectedDay = defaultDay();
    render();
    onWeekChange?.(weekStart);
  }

  elements.prev.addEventListener("click", () => goWeek(-1));
  elements.next.addEventListener("click", () => goWeek(1));
  elements.today.addEventListener("click", () => { weekStart = defaultWeek(); selectedDay = defaultDay(); render(); });
  for (const button of elements.layoutButtons) {
    button.addEventListener("click", () => { layout = button.dataset.layout; savePref("layout", layout); render(); });
  }
  elements.root.addEventListener("click", event => {
    const day = event.target.closest("[data-day]");
    if (!day) return;
    selectedDay = day.dataset.day;
    render();
  });
  mobile.addEventListener("change", render);

  return {
    setIndex(value) { index = value; },
    setClass(value, { keepWeek = false } = {}) {
      classData = value;
      if (!keepWeek || !weeks().includes(weekStart)) { weekStart = defaultWeek(); selectedDay = defaultDay(); }
      render();
    },
    showLoading() { classData = null; elements.nowStrip.hidden = true; elements.root.innerHTML = '<div class="skeleton" aria-label="Ielādē"></div>'; },
    showError(html) { classData = null; elements.nowStrip.hidden = true; elements.root.innerHTML = html; },
    render,
  };
}
