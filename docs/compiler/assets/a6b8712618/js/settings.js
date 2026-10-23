import { store, esc, mod, copyText, toast } from "./util.js";
import { openModal } from "./ui.js";
import { workspaceKey } from "./api.js";

const DEFAULTS = { theme: "dark", fontSize: 14, tabSize: 0, wordWrap: false, minimap: false, autosave: true, clearOnRun: true, author: "" };
export const LAYOUT_DEFAULTS = { side: 248, aside: 360, term: 260, sideOn: true, asideOn: false, termOn: true, asideTab: "details" };

export const settings = { ...DEFAULTS, ...store.get("settings", {}) };
export const layout = { ...LAYOUT_DEFAULTS, ...store.get("layout", {}) };
const listeners = new Set();

export const onSettings = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export function updateSettings(patch) {
  Object.assign(settings, patch);
  store.set("settings", settings);
  for (const fn of listeners) fn(settings, patch);
}
export const saveLayout = () => store.set("layout", layout);

export const resolvedTheme = () => settings.theme === "system" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : settings.theme;

export function openSettings() {
  const body = document.createElement("form");
  body.className = "form";
  body.innerHTML = `
    <label class="field"><span>Your name</span><input name="author" maxlength="60" placeholder="Shown on projects you share" value="${esc(settings.author)}"></label>
    <div class="field-row">
      <label class="field"><span>Theme</span><select name="theme"><option value="dark">Dark</option><option value="light">Light</option><option value="system">Match system</option></select></label>
      <label class="field"><span>Font size</span><select name="fontSize">${[12, 13, 14, 15, 16, 18, 20].map(n => `<option value="${n}">${n} px</option>`).join("")}</select></label>
      <label class="field"><span>Tab size</span><select name="tabSize"><option value="0">Language default</option><option value="2">2 spaces</option><option value="3">3 spaces</option><option value="4">4 spaces</option></select></label>
    </div>
    <label class="check"><input type="checkbox" name="wordWrap"><span>Wrap long lines</span></label>
    <label class="check"><input type="checkbox" name="minimap"><span>Show minimap</span></label>
    <label class="check"><input type="checkbox" name="autosave"><span>Save automatically while typing</span></label>
    <label class="check"><input type="checkbox" name="clearOnRun"><span>Clear the terminal before each run</span></label>
    <div class="field"><span>Workspace key</span><p class="muted small">Your projects belong to this key, stored in this browser. Copy it to open the same projects on another device.</p>
      <div class="inline"><input readonly value="${esc(workspaceKey())}" aria-label="Workspace key" class="mono" id="ws-key"><button type="button" class="btn" data-copy-key>Copy</button><button type="button" class="btn" data-use-key>Use another key…</button></div></div>`;
  for (const el of body.elements) {
    if (!el.name || !(el.name in settings)) continue;
    if (el.type === "checkbox") el.checked = !!settings[el.name]; else el.value = String(settings[el.name]);
    el.addEventListener("change", () => updateSettings({ [el.name]: el.type === "checkbox" ? el.checked : ["fontSize", "tabSize"].includes(el.name) ? +el.value : el.value }));
  }
  body.querySelector("[name=author]").addEventListener("input", e => updateSettings({ author: e.target.value.trim() }));
  body.addEventListener("submit", e => e.preventDefault());
  body.querySelector("[data-copy-key]").onclick = async () => { if (await copyText(workspaceKey())) toast("Workspace key copied"); };
  body.querySelector("[data-use-key]").onclick = () => {
    const key = (prompt("Paste a workspace key. Projects from your current key stay on the server but will no longer be listed here.") || "").trim();
    if (!key) return;
    if (!/^[A-Za-z0-9_-]{32,64}$/.test(key)) return toast("That is not a valid workspace key.", "error");
    store.set("owner", key); location.reload();
  };
  openModal({ title: "Settings", body });
}

export const SHORTCUTS = [
  ["Run or stop", `${mod}Enter`],
  ["Save now", `${mod}S`],
  ["Save a named version", `${mod}Shift+S`],
  ["Command palette", `${mod}Shift+P`],
  ["Find a project", `${mod}P`],
  ["Toggle sidebar", `${mod}B`],
  ["Toggle terminal panel", `${mod}J`],
  ["Focus terminal / editor", "Ctrl+`"],
  ["Toggle side panel", `${mod}Alt+B`],
  ["Settings", `${mod},`],
  ["Find / replace in file", `${mod}F / ${mod}${isMacKey() ? "Alt+F" : "H"}`],
  ["Editor commands", "F1"],
  ["Fold / unfold block", `${mod}Alt+[ / ]`],
  ["Toggle comment", `${mod}/`],
];
function isMacKey() { return mod === "⌘"; }

export function openShortcuts() {
  openModal({ title: "Keyboard shortcuts", body: `<table class="shortcuts">${SHORTCUTS.map(([label, keys]) => `<tr><td>${esc(label)}</td><td><kbd>${esc(keys)}</kbd></td></tr>`).join("")}</table>` });
}
