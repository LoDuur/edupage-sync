import { create } from "zustand";
import { LANGUAGES, loadDraft, draftKey } from "./lib/languages.js";

const ls = (k, d) => { const v = localStorage.getItem(k); return v === null ? d : v; };
export const useStore = create((set, get) => ({
  lang: LANGUAGES[ls("code-lang", "python")] ? ls("code-lang", "python") : "python",
  tabs: [], activeTab: null,
  view: "workspace", sidebarOpen: ls("sidebar", "1") === "1", aiOpen: ls("ai-open", "0") === "1",
  dock: { view: "terminal", open: true, max: false },
  run: { state: "idle", rc: null, ms: 0, provider: null, phase: "" },
  problems: [], output: "", server: null,
  fontSize: +ls("code-font", 13.5), wrap: ls("wrap", "0") === "1", minimap: ls("minimap", "0") === "1",
  toast: null,
  set,
  setLang: lang => { localStorage.setItem("code-lang", lang); set({ lang }); },
  openTab: tab => set(s => { const ex = s.tabs.find(t => t.id === tab.id); return { tabs: ex ? s.tabs : [...s.tabs, tab], activeTab: tab.id, lang: tab.lang }; }),
  closeTab: id => set(s => { const i = s.tabs.findIndex(t => t.id === id); if (i < 0) return {}; const tabs = s.tabs.filter(t => t.id !== id); let activeTab = s.activeTab; if (activeTab === id) activeTab = (tabs[i] || tabs[i - 1] || tabs[0] || {}).id || null; const t = tabs.find(x => x.id === activeTab); return { tabs, activeTab, lang: t ? t.lang : s.lang }; }),
  setView: view => set(s => ({ view, sidebarOpen: s.view === view ? !s.sidebarOpen : true })),
  toggleSidebar: () => set(s => { localStorage.setItem("sidebar", s.sidebarOpen ? "0" : "1"); return { sidebarOpen: !s.sidebarOpen }; }),
  toggleAI: v => set(s => { const aiOpen = v === undefined ? !s.aiOpen : v; localStorage.setItem("ai-open", aiOpen ? "1" : "0"); return { aiOpen, sidebarOpen: aiOpen && innerWidth < 900 ? false : s.sidebarOpen }; }),
  setDock: d => set(s => ({ dock: { ...s.dock, ...d } })),
  setRun: r => set(s => ({ run: { ...s.run, ...r } })),
  setProblems: problems => set({ problems }),
  setOutput: output => set({ output }),
  appendOutput: t => set(s => ({ output: (s.output + t).slice(-200000) })),
  setFontSize: fontSize => { localStorage.setItem("code-font", fontSize); set({ fontSize }); },
  setWrap: wrap => { localStorage.setItem("wrap", wrap ? "1" : "0"); set({ wrap }); },
  setMinimap: minimap => { localStorage.setItem("minimap", minimap ? "1" : "0"); set({ minimap }); },
  notify: (text, kind = "info") => { const id = Date.now(); set({ toast: { id, text, kind } }); setTimeout(() => { if (get().toast?.id === id) set({ toast: null }); }, 2600); },
}));
export const saveDraft = (lang, code) => { try { localStorage.setItem(draftKey(lang), code); } catch {} };
export { loadDraft };
