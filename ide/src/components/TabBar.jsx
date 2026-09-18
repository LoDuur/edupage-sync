import React from "react";
import { X, PanelLeft, Sparkles, PanelBottom } from "lucide-react";
import { useStore } from "../store.js";
import { LANGUAGES } from "../lib/languages.js";
export default function TabBar({ actions }) {
  const { tabs, activeTab, toggleSidebar, sidebarOpen, aiOpen, toggleAI, dock, setDock } = useStore();
  return <div className="tabbar">
    <button className={"ibtn" + (sidebarOpen ? "" : " on")} title={sidebarOpen ? "Hide sidebar" : "Show sidebar"} onClick={toggleSidebar}><PanelLeft size={16} strokeWidth={1.8} /></button>
    <div className="tabs">
      {tabs.map(t => { const d = LANGUAGES[t.lang]; return <div key={t.id} className={"tab" + (t.id === activeTab ? " on" : "")} onClick={() => actions.activate(t.id)} onAuxClick={e => { if (e.button === 1) actions.closeTab(t.id); }} title={t.title}>
        <span className="ldot" style={{ background: t.kind === "live" ? "var(--live)" : d.color }} /><span>{t.title}</span>
        {t.kind === "snippet" && <span className="ro">read-only</span>}{t.kind === "live" && <span className="ro live">live</span>}
        <span className="x" title="Close" onClick={e => { e.stopPropagation(); actions.closeTab(t.id); }}><X size={12} /></span>
      </div>; })}
    </div>
    <div className="right">
      <button className={"ibtn" + (dock.open ? " on" : "")} title="Toggle panel (⌘J)" onClick={() => setDock({ open: !dock.open })}><PanelBottom size={16} strokeWidth={1.8} /></button>
      <button className={"ibtn" + (aiOpen ? " on" : "")} title="AI assistant (⌘I)" onClick={() => toggleAI()}><Sparkles size={16} strokeWidth={1.8} /></button>
    </div>
  </div>;
}
