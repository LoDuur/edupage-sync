import { $, esc } from "./util.js";

export function openMenu(anchor, items, { align = "right" } = {}) {
  closeMenu();
  const menu = document.createElement("div");
  menu.className = "menu"; menu.setAttribute("role", "menu");
  for (const item of items) {
    if (item === "-") { menu.appendChild(document.createElement("hr")); continue; }
    if (item.heading) { const h = document.createElement("div"); h.className = "menu-h"; h.textContent = item.heading; menu.appendChild(h); continue; }
    const b = document.createElement("button");
    b.setAttribute("role", "menuitemradio" in item ? "menuitemradio" : "menuitem");
    if (item.on) b.setAttribute("aria-checked", "true");
    b.disabled = !!item.disabled;
    b.className = item.danger ? "danger" : "";
    b.innerHTML = `<span class="menu-check">${item.on ? "✓" : ""}</span><span class="menu-label">${esc(item.label)}</span>${item.hint ? `<span class="menu-hint">${esc(item.hint)}</span>` : ""}`;
    b.onclick = () => { closeMenu(); item.run?.(); };
    menu.appendChild(b);
  }
  $("overlay-root").appendChild(menu);
  const r = anchor.getBoundingClientRect(), w = menu.offsetWidth, h = menu.offsetHeight;
  const left = Math.max(8, Math.min(align === "right" ? r.right - w : r.left, innerWidth - w - 8));
  const top = r.bottom + 4 + h > innerHeight - 8 ? Math.max(8, r.top - h - 4) : r.bottom + 4;
  menu.style.left = left + "px"; menu.style.top = top + "px";
  menu.querySelector("button:not(:disabled)")?.focus();
  const onKey = e => {
    const buttons = [...menu.querySelectorAll("button:not(:disabled)")], i = buttons.indexOf(document.activeElement);
    if (e.key === "Escape") { e.stopPropagation(); closeMenu(); anchor.focus(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); buttons[(i + 1) % buttons.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); buttons[(i - 1 + buttons.length) % buttons.length]?.focus(); }
  };
  const onDown = e => { if (!menu.contains(e.target) && !anchor.contains(e.target)) closeMenu(); };
  menu.addEventListener("keydown", onKey);
  document.addEventListener("mousedown", onDown);
  menu.cleanup = () => document.removeEventListener("mousedown", onDown);
}

export function closeMenu() { const m = document.querySelector(".menu"); if (m) { m.cleanup?.(); m.remove(); } }

export function openModal({ title, body, actions = [], wide = false, onClose }) {
  const previous = document.activeElement;
  const backdrop = document.createElement("div");
  backdrop.className = "backdrop";
  backdrop.innerHTML = `<div class="modal${wide ? " wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header class="modal-h"><h2>${esc(title)}</h2><button class="ibtn" data-close aria-label="Close"><svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button></header><div class="modal-b"></div>${actions.length ? '<footer class="modal-f"></footer>' : ""}</div>`;
  const content = backdrop.querySelector(".modal-b");
  if (typeof body === "string") content.innerHTML = body; else content.appendChild(body);
  const footer = backdrop.querySelector(".modal-f");
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    backdrop.remove(); document.removeEventListener("keydown", onKey, true);
    onClose?.(); previous?.focus?.();
  };
  for (const a of actions) {
    const b = document.createElement("button");
    b.className = "btn" + (a.primary ? " primary" : "") + (a.danger ? " danger" : "");
    b.textContent = a.label;
    b.onclick = async () => { if ((await a.run?.()) !== false) close(); };
    footer.appendChild(b);
  }
  const onKey = e => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
  document.addEventListener("keydown", onKey, true);
  backdrop.addEventListener("mousedown", e => { if (e.target === backdrop) close(); });
  backdrop.querySelector("[data-close]").onclick = close;
  $("overlay-root").appendChild(backdrop);
  (content.querySelector("[autofocus], input, textarea, select, button") || backdrop.querySelector("[data-close]")).focus();
  return { close, element: content };
}

export function confirmDialog(title, message, confirmLabel = "Confirm", danger = false) {
  return new Promise(resolve => {
    let answered = false;
    openModal({
      title, body: `<p class="muted">${esc(message)}</p>`,
      actions: [{ label: "Cancel", run: () => {} }, { label: confirmLabel, primary: !danger, danger, run: () => { answered = true; } }],
      onClose: () => resolve(answered),
    });
  });
}

export function openPalette(commands, { placeholder = "Type a command…" } = {}) {
  const backdrop = document.createElement("div");
  backdrop.className = "backdrop palette-backdrop";
  backdrop.innerHTML = `<div class="palette" role="dialog" aria-modal="true" aria-label="Command palette"><input class="palette-input" placeholder="${esc(placeholder)}" aria-label="Search commands" spellcheck="false" autocomplete="off"><div class="palette-list" role="listbox"></div></div>`;
  const input = backdrop.querySelector("input"), list = backdrop.querySelector(".palette-list");
  const previous = document.activeElement;
  let shown = [], selected = 0;
  const close = () => { backdrop.remove(); previous?.focus?.(); };
  const render = () => {
    const words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
    shown = commands.filter(c => words.every(w => (c.label + " " + (c.group || "") + " " + (c.keywords || "")).toLowerCase().includes(w))).slice(0, 60);
    selected = Math.min(selected, Math.max(shown.length - 1, 0));
    list.innerHTML = shown.length
      ? shown.map((c, i) => `<div class="palette-row${i === selected ? " on" : ""}" role="option" aria-selected="${i === selected}" data-i="${i}">${c.group ? `<span class="palette-group">${esc(c.group)}</span>` : ""}<span class="palette-label">${esc(c.label)}</span>${c.hint ? `<kbd>${esc(c.hint)}</kbd>` : ""}</div>`).join("")
      : '<div class="palette-empty">No matching commands</div>';
    list.querySelector(".on")?.scrollIntoView({ block: "nearest" });
  };
  const choose = i => { const c = shown[i]; if (!c) return; close(); c.run(); };
  input.addEventListener("input", () => { selected = 0; render(); });
  input.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") { e.preventDefault(); selected = Math.min(selected + 1, shown.length - 1); render(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); selected = Math.max(selected - 1, 0); render(); }
    else if (e.key === "Enter") { e.preventDefault(); choose(selected); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
  });
  list.addEventListener("mousedown", e => { const row = e.target.closest("[data-i]"); if (row) { e.preventDefault(); choose(+row.dataset.i); } });
  backdrop.addEventListener("mousedown", e => { if (e.target === backdrop) close(); });
  $("overlay-root").appendChild(backdrop);
  render(); input.focus();
}

export function makeResizer(handle, { axis, get, set, invert = false }) {
  let start = 0, base = 0;
  const move = e => { const d = (axis === "x" ? e.clientX : e.clientY) - start; set(base + (invert ? -d : d)); };
  const up = () => {
    handle.classList.remove("dragging"); document.body.classList.remove("resizing", "resizing-y");
    removeEventListener("pointermove", move); removeEventListener("pointerup", up);
  };
  handle.addEventListener("pointerdown", e => {
    e.preventDefault(); start = axis === "x" ? e.clientX : e.clientY; base = get();
    handle.classList.add("dragging"); document.body.classList.add("resizing", axis === "y" ? "resizing-y" : "resizing");
    addEventListener("pointermove", move); addEventListener("pointerup", up);
  });
  handle.addEventListener("keydown", e => {
    const step = e.shiftKey ? 48 : 16;
    const back = axis === "x" ? "ArrowLeft" : "ArrowUp", forward = axis === "x" ? "ArrowRight" : "ArrowDown";
    if (e.key === back) { e.preventDefault(); set(get() + (invert ? step : -step)); }
    else if (e.key === forward) { e.preventDefault(); set(get() + (invert ? -step : step)); }
  });
}
