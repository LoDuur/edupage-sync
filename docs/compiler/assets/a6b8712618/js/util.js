export const $ = id => document.getElementById(id);
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
export const mod = isMac ? "⌘" : "Ctrl+";

export const store = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} },
  remove(key) { try { localStorage.removeItem(key); } catch {} },
};

const svg = body => `<svg class="i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
export const icon = {
  sidebar: svg('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>'),
  aside: svg('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M15 3v18"/>'),
  play: svg('<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>'),
  stop: svg('<rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor"/>'),
  rerun: svg('<path d="M3 12a9 9 0 1 0 2.64-6.36L3 8"/><path d="M3 3v5h5"/>'),
  copy: svg('<rect width="13" height="13" x="9" y="9" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  clear: svg('<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
  x: svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  plus: svg('<path d="M12 5v14"/><path d="M5 12h14"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  settings: svg('<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>'),
  keyboard: svg('<rect width="20" height="14" x="2" y="5" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M10 13h4"/>'),
  share: svg('<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="m16 6-4-4-4 4"/><path d="M12 2v13"/>'),
  link: svg('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'),
  lock: svg('<rect width="16" height="11" x="4" y="11" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  globe: svg('<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>'),
  fork: svg('<circle cx="6" cy="5" r="2"/><circle cx="18" cy="5" r="2"/><circle cx="12" cy="19" r="2"/><path d="M6 7v1a3 3 0 0 0 3 3h6a3 3 0 0 0 3-3V7"/><path d="M12 11v6"/>'),
  history: svg('<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>'),
  chevron: svg('<path d="m6 9 6 6 6-6"/>'),
  more: svg('<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'),
  terminal: svg('<path d="m4 17 6-5-6-5"/><path d="M12 19h8"/>'),
  alert: svg('<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>'),
  check: svg('<path d="M20 6 9 17l-5-5"/>'),
  info: svg('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>'),
  sparkle: svg('<path d="M12 3l1.9 5.6 5.6 1.9-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9z"/>'),
  restart: svg('<path d="M21 12a9 9 0 0 1-15.5 6.2"/><path d="M3 12A9 9 0 0 1 18.5 5.8"/><path d="M18 2v4h-4"/><path d="M6 22v-4h4"/>'),
  hide: svg('<path d="m7 10 5 5 5-5"/>'),
  eye: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  book: svg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5V21h16"/>'),
  file: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>'),
  layout: svg('<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 15h18"/><path d="M9 3v12"/>'),
  apply: svg('<path d="M12 3v12"/><path d="m8 11 4 4 4-4"/><path d="M4 21h16"/>'),
};

let toastTimer = 0;
export function toast(text, kind = "") {
  let el = document.querySelector(".toast");
  if (!el) { el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
  el.dataset.kind = kind;
  el.textContent = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), kind === "error" ? 5000 : 2400);
}

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
export function relativeTime(ms) {
  const s = Math.round((ms - Date.now()) / 1000), a = Math.abs(s);
  if (a < 45) return "just now";
  if (a < 3600) return RELATIVE.format(Math.round(s / 60), "minute");
  if (a < 86400) return RELATIVE.format(Math.round(s / 3600), "hour");
  if (a < 86400 * 30) return RELATIVE.format(Math.round(s / 86400), "day");
  return new Date(ms).toLocaleDateString();
}
export const absoluteTime = ms => new Date(ms).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch { toast("Could not access the clipboard.", "error"); return false; }
}

export function randomToken(bytes = 32) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
