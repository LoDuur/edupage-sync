/* kopīgais: ikonas (lucide), piekļuves vārti, toast */
const UI = (() => {
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const $ = id => document.getElementById(id);

  const ICONS = {
    play: '<polygon points="6 3 20 12 6 21 6 3"/>',
    stop: '<rect width="14" height="14" x="5" y="5" rx="2"/>',
    save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
    radio: '<path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/>',
    folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
    sparkles: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    up: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
    terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    format: '<path d="M15 12H3"/><path d="M17 18H3"/><path d="M21 6H3"/>',
    zoomin: '<circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="11" x2="11" y1="8" y2="14"/><line x1="8" x2="14" y1="11" y2="11"/>',
    zoomout: '<circle cx="11" cy="11" r="8"/><line x1="21" x2="16.65" y1="21" y2="16.65"/><line x1="8" x2="14" y1="11" y2="11"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    alert: '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
    warn: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    bot: '<path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/>',
    panel: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/>',
    loader: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    edit: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
    back: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  };
  const icon = (name, cls = "") => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>`;
  function hydrateIcons(root = document) { root.querySelectorAll("[data-icon]").forEach(el => { el.insertAdjacentHTML("afterbegin", icon(el.dataset.icon)); el.removeAttribute("data-icon"); }); }

  const ACCESS_HASH = "40f241867b5b11875589f3fa4f95e363c1f12802496f7667c44a5443df175a00";
  async function sha256(s) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join(""); }
  const accessKey = () => localStorage.getItem("java-access") || "";
  async function requireAccess(onOk, { sub = "piekļuves kods", back = "../" } = {}) {
    const k = accessKey();
    if (k && await sha256(k) === ACCESS_HASH) { onOk(); return; }
    const g = document.createElement("div"); g.className = "gate"; g.id = "gate";
    g.innerHTML = `<div class="card"><h1>28teh</h1><p class="sub">${esc(sub)}</p>
      <div class="field"><input id="gate-in" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="kods"></div>
      <div class="err" id="gate-err"></div>
      <div class="row"><button class="btn pri" id="gate-ok">Ienākt</button><a href="${back}">${icon("back")} saraksts</a></div></div>`;
    document.body.appendChild(g);
    document.body.classList.add("hero");
    const inp = g.querySelector("#gate-in"), err = g.querySelector("#gate-err"), card = g.querySelector(".card");
    inp.focus();
    async function tryIt() {
      const v = inp.value.trim().toUpperCase();
      if (await sha256(v) === ACCESS_HASH) { localStorage.setItem("java-access", v); g.remove(); document.body.classList.remove("hero"); onOk(); }
      else { err.textContent = "Nepareizs kods"; card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake"); inp.select(); }
    }
    g.querySelector("#gate-ok").onclick = tryIt;
    inp.addEventListener("keydown", e => { if (e.key === "Enter") tryIt(); });
  }

  function toast(t) {
    let el = $("toast");
    if (!el) {
      el = document.createElement("div"); el.className = "toast"; el.id = "toast"; document.body.appendChild(el);
      const hide = () => { if (performance.now() - toast._at > 250) el.classList.remove("on"); };
      el.onclick = () => el.classList.remove("on");
      document.addEventListener("mousedown", hide, true); document.addEventListener("keydown", hide, true);
    }
    el.textContent = t; el.classList.add("on"); toast._at = performance.now();
    clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove("on"), 2500);
  }

  return { esc, $, icon, hydrateIcons, requireAccess, accessKey, sha256, toast };
})();
