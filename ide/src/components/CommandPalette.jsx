import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, FileCode, Play, Square, Save, AlignLeft, Link2, Radio, PanelLeft, PanelBottom, MessageSquare, Eraser, Cpu, Check } from "lucide-react";
import { useStore } from "../store.js";
import { LANGUAGES, ORDER } from "../lib/languages.js";
import { MODELS } from "../lib/models.js";
import * as session from "../lib/session.js";

export default function CommandPalette({ actions }) {
  const { palette, setPalette, run, liveHost, model, setModel, aiOpen, sidebarOpen, dock, tabs } = useStore();
  const [q, setQ] = useState(""), [sel, setSel] = useState(0), [closing, setClosing] = useState(false);
  const input = useRef(null), list = useRef(null);
  const busy = ["starting", "compiling", "running", "waiting"].includes(run.state);
  const items = useMemo(() => [
    ...ORDER.map(id => ({ g: "Files", label: LANGUAGES[id].file, hint: LANGUAGES[id].name, icon: FileCode, run: () => actions.openFile(id) })),
    ...tabs.filter(t => t.kind !== "file").map(t => ({ g: "Files", label: t.title, hint: t.kind, icon: FileCode, run: () => actions.activate(t.id) })),
    { g: "Actions", label: busy ? "Stop program" : "Run program", k: "⌘↵", icon: busy ? Square : Play, run: busy ? actions.stop : actions.run },
    { g: "Actions", label: "Save to class archive", k: "⌘S", icon: Save, run: actions.save },
    { g: "Actions", label: "Format document", k: "⇧⌥F", icon: AlignLeft, run: actions.format },
    { g: "Actions", label: "Clear terminal", icon: Eraser, run: session.clear },
    { g: "Actions", label: `${aiOpen ? "Hide" : "Show"} assistant panel`, k: "⌘I", icon: MessageSquare, run: () => useStore.getState().toggleAI() },
    { g: "Actions", label: `${sidebarOpen ? "Hide" : "Show"} sidebar`, k: "⌘B", icon: PanelLeft, run: () => useStore.getState().toggleSidebar() },
    { g: "Actions", label: `${dock.open ? "Hide" : "Show"} panel`, k: "⌘J", icon: PanelBottom, run: () => useStore.getState().setDock({ open: !dock.open }) },
    liveHost ? { g: "Session", label: "Copy live link", icon: Link2, run: actions.copyLiveLink } : { g: "Session", label: "Start live session", icon: Radio, run: actions.startLive },
    liveHost ? { g: "Session", label: "End live session", icon: Square, run: actions.endLive } : null,
    ...MODELS.map(m => ({ g: "Session", label: `Model: ${m.name}`, icon: m.id === model ? Check : Cpu, run: () => setModel(m.id) })),
  ].filter(Boolean), [busy, liveHost, model, aiOpen, sidebarOpen, dock.open, tabs]);
  const shown = useMemo(() => { const t = q.trim().toLowerCase(); return t ? items.filter(i => (i.label + " " + (i.hint || "") + " " + i.g).toLowerCase().includes(t)) : items; }, [items, q]);
  useEffect(() => { if (palette) { setQ(""); setSel(0); setClosing(false); setTimeout(() => input.current?.focus(), 0); } }, [palette]);
  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => { list.current?.querySelector(".it.sel")?.scrollIntoView({ block: "nearest" }); }, [sel]);
  const close = () => { setClosing(true); setTimeout(() => { setPalette(false); setClosing(false); }, 100); };
  const go = it => { close(); it.run(); };
  if (!palette) return null;
  const groups = [...new Set(shown.map(i => i.g))];
  let idx = -1;
  return <>
    <div className={"pal-bg" + (closing ? " closing" : "")} onMouseDown={close} />
    <div className={"pal" + (closing ? " closing" : "")} role="dialog" aria-modal="true" aria-label="Command palette" onKeyDown={e => {
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setSel(s => Math.min(shown.length - 1, s + 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setSel(s => Math.max(0, s - 1)); }
      else if (e.key === "Enter") { e.preventDefault(); if (shown[sel]) go(shown[sel]); }
      else if (e.key === "Tab") e.preventDefault();
    }}>
      <div className="in"><Search size={16} /><input ref={input} value={q} onChange={e => setQ(e.target.value)} placeholder="Type a command or file name…" aria-label="Search commands" role="combobox" aria-expanded="true" aria-controls="pal-list" /></div>
      <div className="list" ref={list} id="pal-list" role="listbox">
        {shown.length === 0 && <div className="none">No matching commands.</div>}
        {groups.map(g => <div key={g}><div className="g label">{g}</div>
          {shown.filter(i => i.g === g).map(it => { idx++; const i = idx; return <button key={g + it.label} role="option" aria-selected={i === sel} className={"it" + (i === sel ? " sel" : "")} onMouseMove={() => setSel(i)} onClick={() => go(it)}><it.icon size={16} /><span>{it.label}</span>{it.hint && <span className="k">{it.hint}</span>}{it.k && <span className="k">{it.k}</span>}</button>; })}
        </div>)}
      </div>
    </div>
  </>;
}
