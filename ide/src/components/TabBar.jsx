import React, { useEffect, useRef, useState } from "react";
import { X, ChevronRight, ChevronDown, Play, Square, MoreHorizontal, MessageSquare, Save, AlignLeft, Link2, Radio, PanelLeft, PanelBottom, RotateCcw, Command } from "lucide-react";
import { useStore } from "../store.js";
import { LANGUAGES } from "../lib/languages.js";
import { useMenu } from "./Menu.jsx";

export function executorInfo(server, lang, executor) {
  const rt = server?.runtimes?.[lang];
  const sandbox = !!(server && rt?.available);
  const useSandbox = sandbox && executor !== "remote";
  if (useSandbox) return { provider: "sandbox", label: server.mode === "firejail" ? "Sandbox · Firejail" : "Sandbox · dev", cls: server.mode === "firejail" ? "ok" : "warn", sandbox };
  return { provider: "fallback", label: lang === "pil" ? "In-browser · wasm" : "Remote · Wandbox", cls: "off", sandbox };
}

export default function TabBar({ actions }) {
  const { tabs, activeTab, toggleSidebar, aiOpen, toggleAI, dock, setDock, run, server, lang, executor, setExecutor, savedAt, liveHost, setPalette } = useStore();
  const menu = useMenu();
  const envRef = useRef(null), moreRef = useRef(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (!savedAt) return; setSaved(true); const t = setTimeout(() => setSaved(false), 1500); return () => clearTimeout(t); }, [savedAt]);
  const tab = tabs.find(t => t.id === activeTab);
  const busy = ["starting", "compiling", "running", "waiting"].includes(run.state);
  const env = executorInfo(server, lang, executor);
  const isFile = tab && tab.kind === "file";
  const envMenu = () => menu.open(envRef.current, [
    { h: "Run environment" },
    { label: server ? (server.mode === "firejail" ? "Sandbox · Firejail" : "Sandbox · dev mode") : "Sandbox · offline", selected: env.provider === "sandbox", disabled: !env.sandbox, run: () => setExecutor("auto") },
    { label: lang === "pil" ? "In-browser · wasm" : "Remote · Wandbox", selected: env.provider === "fallback", run: () => setExecutor(env.sandbox ? "remote" : "auto") },
  ], { align: "right", width: 220 });
  const moreMenu = () => menu.open(moreRef.current, [
    { label: "Save to class archive", icon: Save, k: "⌘S", disabled: !isFile, run: actions.save },
    { label: "Format document", icon: AlignLeft, k: "⇧⌥F", disabled: !isFile, run: actions.format },
    { label: "Reset file to template", icon: RotateCcw, disabled: !isFile, run: () => actions.resetFile(tab.lang) },
    "-",
    liveHost ? { label: "Copy live link", icon: Link2, run: actions.copyLiveLink } : { label: "Start live session", icon: Radio, disabled: !isFile, run: actions.startLive },
    liveHost ? { label: "End live session", icon: Square, run: actions.endLive } : null,
    "-",
    { label: "Command palette", icon: Command, k: "⌘K", run: () => setPalette(true) },
    { label: "Toggle sidebar", icon: PanelLeft, k: "⌘B", run: toggleSidebar },
    { label: "Toggle panel", icon: PanelBottom, k: "⌘J", run: () => setDock({ open: !dock.open }) },
  ].filter(Boolean), { align: "right", width: 230 });
  return <div className="toolbar">
    <div className="crumbs">
      <span className="ws">28teh</span><ChevronRight size={14} className="sep" />
      <div className="tabs" role="tablist">
        {tabs.map(t => <div key={t.id} role="tab" aria-selected={t.id === activeTab} tabIndex={0} className={"tab" + (t.id === activeTab ? " on" : "")} onClick={() => actions.activate(t.id)} onKeyDown={e => { if (e.key === "Enter") actions.activate(t.id); }} onAuxClick={e => { if (e.button === 1) actions.closeTab(t.id); }} title={t.title}>
          <span>{t.title}</span>
          {t.kind === "snippet" && <span className="ro">read-only</span>}{t.kind === "live" && <span className="ro live">live</span>}
          <button className="x" aria-label={`Close ${t.title}`} onClick={e => { e.stopPropagation(); actions.closeTab(t.id); }}><X size={12} /></button>
        </div>)}
      </div>
      <span className={"saved" + (saved ? " show" : "")} aria-live="polite">{saved ? "Saved" : ""}</span>
    </div>
    <div className="right">
      <button className="tbtn env" ref={envRef} onClick={envMenu} title="Where your code runs" aria-haspopup="menu"><span className={"dot " + env.cls} />{env.label}<ChevronDown size={14} /></button>
      <button className={"runbtn" + (busy ? " running" : "")} disabled={!tab} onClick={busy ? actions.stop : actions.run} aria-label={busy ? "Stop program" : "Run program"} title={busy ? "Stop" : "Run (⌘/Ctrl+Enter)"}>
        <span className="ico"><Play size={16} /><Square size={16} /></span>
        <span className="lbl"><span>Run</span><span>Stop</span></span>
        {!busy && <kbd>⌘↵</kbd>}
      </button>
      <button className={"ibtn" + (aiOpen ? " on" : "")} aria-label="Toggle assistant" title="Assistant (⌘I)" onClick={() => toggleAI()}><MessageSquare size={16} /></button>
      <button className="ibtn" ref={moreRef} aria-label="More actions" aria-haspopup="menu" onClick={moreMenu}><MoreHorizontal size={16} /></button>
    </div>
    {menu.el}
  </div>;
}
