import { esc, shortDate, hhmm, weekRange, formatStamp, stateHtml, DAY_SHORT, parseIso, todayIso, weekStartOf } from "./store.js";

const FIELD_LABELS = { room: "kabinets", teacher: "skolotājs", time: "laiks" };

const dayLabel = iso => `${DAY_SHORT[(parseIso(iso).getDay() + 6) % 7]} ${shortDate(iso)}`;
const lessonLine = e => `${dayLabel(e.date)} ${hhmm(e.start)}–${hhmm(e.end)} <b>${esc(e.summary)}</b>${e.location ? ` · ${esc(e.location)}` : ""}`;

function changedLine({ before, after, fields }) {
  const details = fields.map(field => {
    if (field === "room") return `kabinets ${esc(before.location || "—")} → ${esc(after.location || "—")}`;
    if (field === "teacher") return `skolotājs ${esc(before.teachers.join(", ") || "—")} → ${esc(after.teachers.join(", ") || "—")}`;
    return `laiks ${hhmm(before.start)}–${hhmm(before.end)} → ${hhmm(after.start)}–${hhmm(after.end)}`;
  });
  return `${dayLabel(after.date)} <b>${esc(after.summary)}</b>: ${details.join("; ") || fields.map(f => FIELD_LABELS[f]).join(", ")}`;
}

const movedLine = ({ before, after }) => `<b>${esc(after.summary)}</b>: <s>${dayLabel(before.date)} ${hhmm(before.start)}</s> → ${dayLabel(after.date)} ${hhmm(after.start)}${after.location ? ` · ${esc(after.location)}` : ""}`;
const item = (mark, cls, html) => `<li><span class="mark ${cls}">${mark}</span><span>${html}</span></li>`;

function entryTitle(entry, currentWeek) {
  const relative = entry.weekStart === currentWeek ? "Šī nedēļa" : entry.weekStart > currentWeek ? "Nākamā nedēļa" : "Iepriekšējā nedēļa";
  if (entry.kind === "published") return `Publicēts jauns saraksts — ${relative} (${weekRange(entry.weekStart)})`;
  if (entry.kind === "substitutions") return "Aizvietošana";
  return `Saraksts atjaunināts — ${relative} (${weekRange(entry.weekStart)})`;
}

function entryBody(entry) {
  if (entry.kind === "published") return `<ul>${item("[+]", "mark-add", `${entry.lessons} stundas, versija v${esc(entry.version)}`)}</ul>`;
  if (entry.kind === "substitutions") {
    return `<ul>${entry.added.map(s => item("[!]", "mark-mod", `${dayLabel(s.date)} ${esc(s.period)}. st. — ${esc(s.text)}`)).join("")}${entry.removed.map(s => item("[x]", "mark-del", `<s>${dayLabel(s.date)} ${esc(s.period)}. st. — ${esc(s.text)}</s> (vairs nav spēkā)`)).join("")}</ul>`;
  }
  const rows = [
    ...entry.added.map(e => item("[+]", "mark-add", `Pievienota: ${lessonLine(e)}`)),
    ...entry.changed.map(c => item("[~]", "mark-mod", `Mainīta: ${changedLine(c)}`)),
    ...entry.moved.map(m => item("[→]", "mark-mov", `Pārcelta: ${movedLine(m)}`)),
    ...entry.removed.map(e => item("[x]", "mark-del", `Atcelta: <s>${lessonLine(e)}</s>`)),
  ];
  return `<ul>${rows.join("")}</ul>`;
}

export function unseenCount(entries, seenId) {
  if (!entries.length) return 0;
  if (!seenId) return 0;
  const index = entries.findIndex(e => e.id === seenId);
  return index === -1 ? entries.length : index;
}

export function renderChanges(root, lead, { entries, classData, index, seenId }) {
  const currentWeek = weekStartOf(todayIso());
  lead.textContent = classData ? `${classData.name} · izmaiņas tiek pārbaudītas automātiski vairākas reizes stundā` : "";
  const next = index?.nextWeek;
  const nextPublished = next && (next.status === "published" || classData?.weeks?.some(w => w.weekStart === next.weekStart));
  const nextHtml = next ? `<div class="next-week"><span class="dot ${nextPublished ? "ok" : "wait"}"></span>Nākamā nedēļa (${weekRange(next.weekStart)}): ${nextPublished ? "saraksts publicēts" : "vēl nav publicēta — rādām pēdējo zināmo informāciju"}</div>` : "";
  const subs = (classData?.substitutions || []).filter(s => s.date >= todayIso());
  const subsHtml = subs.length ? `<article class="change"><div class="change-head"><h2>Aktuālā aizvietošana</h2><time>no EduPage</time></div><ul>${subs.map(s => item("[!]", "mark-mod", `${dayLabel(s.date)} ${esc(s.period)}. st. — ${esc(s.text)}`)).join("")}</ul></article>` : "";
  const unseen = unseenCount(entries, seenId);
  const list = entries.map((entry, i) => `<article class="change${i < unseen ? " is-new" : ""}">
      <div class="change-head"><h2>${esc(entryTitle(entry, currentWeek))}</h2><time datetime="${esc(entry.detectedAt)}">atklāts ${esc(formatStamp(entry.detectedAt))}</time></div>
      ${entryBody(entry)}
    </article>`).join("");
  const empty = entries.length ? "" : stateHtml("Izmaiņu vēl nav", "Kad EduPage mainīs šīs klases sarakstu, izmaiņas parādīsies šeit ar atklāšanas laiku.");
  root.innerHTML = `<div class="changes">${nextHtml}${subsHtml}${list}${empty}</div>`;
}
