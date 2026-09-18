import React, { useEffect, useRef, useState } from "react";
import { FolderOpen, Library, Radio, Settings, RotateCcw, Search, Lock, Link2, Square, Play, LogOut, Type, WrapText, Map as MapIcon, Plus, Minus } from "lucide-react";
import { useStore } from "../store.js";
import { LANGUAGES, ORDER, loadDraft } from "../lib/languages.js";
import { listSnippets } from "../lib/supabase.js";
import { LIVE } from "../lib/live.js";
import { useMenu } from "./Menu.jsx";
import { signOut } from "../lib/access.js";

const fmt = d => new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function Sidebar({ actions }) {
  const { view, setView, sidebarOpen, activeTab, tabs, server, fontSize, setFontSize, wrap, setWrap, minimap, setMinimap, liveHost, liveActive } = useStore();
  const menu = useMenu();
  const gearRef = useRef(null);
  return <aside className={"sidebar" + (sidebarOpen ? "" : " closed")}>
    <div className="brand"><span className="logo">28</span><b>28teh</b><small>2.k. 28.grupa</small></div>
    <div className="seg">
      <button className={view === "workspace" ? "on" : ""} onClick={() => setView("workspace")}><FolderOpen size={14} strokeWidth={1.8} />Files</button>
      <button className={view === "saved" ? "on" : ""} onClick={() => setView("saved")}><Library size={14} strokeWidth={1.8} />Saved</button>
      <button className={view === "live" ? "on" : ""} onClick={() => setView("live")}><Radio size={14} strokeWidth={1.8} />Live{(liveHost || liveActive) && <span className="dot" />}</button>
    </div>
    <div className="sb-scroll">
      {view === "workspace" && <Workspace actions={actions} activeTab={activeTab} tabs={tabs} server={server} />}
      {view === "saved" && <Saved actions={actions} activeTab={activeTab} />}
      {view === "live" && <Live actions={actions} />}
    </div>
    <div className="sb-foot">
      <span className="who">{server ? (server.mode === "firejail" ? "Sandbox · Firejail" : "Sandbox · dev mode") : "Remote executor"}</span>
      <button className="ibtn" ref={gearRef} title="Settings" onClick={() => menu.open(gearRef.current, [
        { h: "Editor" }, { label: "Increase font size", icon: Plus, k: "⌘ +", run: () => setFontSize(Math.min(24, fontSize + 1)) }, { label: "Decrease font size", icon: Minus, k: "⌘ −", run: () => setFontSize(Math.max(10, fontSize - 1)) },
        { label: "Word wrap", icon: WrapText, selected: wrap, run: () => setWrap(!wrap) }, { label: "Minimap", icon: MapIcon, selected: minimap, run: () => setMinimap(!minimap) },
        "-", { label: "Sign out", icon: LogOut, run: signOut },
      ], { align: "left", width: 220 })}><Settings size={16} strokeWidth={1.8} /></button>
    </div>
    {menu.el}
  </aside>;
}

function Workspace({ actions, activeTab, tabs, server }) {
  const cur = tabs.find(t => t.id === activeTab);
  return <>
    <div className="sb-h"><span>Workspace</span></div>
    {ORDER.map(id => { const d = LANGUAGES[id]; const on = cur && cur.kind === "file" && cur.lang === id; const rt = server?.runtimes?.[id]; const unavailable = server && rt && !rt.available;
      return <div key={id} className={"row" + (on ? " on" : "")} onClick={() => actions.openFile(id)} title={unavailable ? `${d.name} runtime is not installed on the server – runs remotely` : d.name}>
        <span className="ldot" style={{ background: d.color }} /><span className="name">{d.file}</span>
        {unavailable && <span className="tag">remote</span>}
        <button className="act" title="Reset to template" onClick={e => { e.stopPropagation(); actions.resetFile(id); }}><RotateCcw size={13} /></button>
      </div>; })}
  </>;
}

function Saved({ actions, activeTab }) {
  const [items, setItems] = useState(null), [q, setQ] = useState("");
  useEffect(() => { listSnippets().then(setItems).catch(() => setItems([])); }, []);
  const list = (items || []).filter(s => !q || (s.title + " " + (s.author || "")).toLowerCase().includes(q.toLowerCase()));
  return <>
    <div className="sb-h"><span>Saved works</span><span>{items ? items.length : ""}</span></div>
    <div className="search"><Search size={14} /><input placeholder="Search by title or author" value={q} onChange={e => setQ(e.target.value)} /></div>
    {items === null ? <div className="sb-empty">Loading…</div> : list.length === 0 ? <div className="sb-empty">{q ? "No matches." : "Nothing has been saved yet. Use Save in the editor toolbar."}</div> :
      list.map(s => { const d = LANGUAGES[s.lang || "java"]; return <div key={s.id} className={"row" + (activeTab === "snip:" + s.id ? " on" : "")} onClick={() => actions.openSnippet(s.id)} title={`${s.title} · ${s.author || "anonymous"}`}>
        <span className="ldot" style={{ background: d?.color }} /><span className="name">{s.title}</span><span className="meta">{s.author || "anonymous"} · {fmt(s.created_at)}</span></div>; })}
  </>;
}

function Live({ actions }) {
  const { liveHost, setLiveActive } = useStore();
  const [items, setItems] = useState(null);
  const load = () => LIVE.listActive().then(l => { const o = l.filter(s => !liveHost || s.id !== liveHost.state.id); setItems(o); setLiveActive(o.length > 0); }).catch(() => setItems([]));
  useEffect(() => { load(); const t = setInterval(() => { if (!document.hidden) load(); }, 15000); return () => clearInterval(t); }, [liveHost]);
  return <>
    <div className="sb-h"><span>Live coding</span></div>
    {liveHost ? <div className="card"><div className="live-h"><span className="pulse" />Broadcasting · {liveHost.title}</div><p>Everyone with the link (or from this list) sees your edits in real time.</p>
      <div style={{ display: "flex", gap: 6 }}><button className="btn sm" style={{ flex: 1 }} onClick={() => actions.copyLiveLink()}><Link2 size={13} />Copy link</button><button className="btn sm danger" onClick={() => actions.endLive()}><Square size={12} />End</button></div></div>
      : <div className="card"><p>Share your editor with the class in real time. Add a password to encrypt the session end-to-end.</p><button className="btn pri full" onClick={() => actions.startLive()}><Radio size={14} />Start live session</button></div>}
    <div className="sb-h"><span>Active sessions</span><span>{items ? items.length : ""}</span></div>
    {items === null ? <div className="sb-empty">Loading…</div> : items.length === 0 ? <div className="sb-empty">No one is live right now.</div> :
      items.map(s => <div key={s.id} className="row" onClick={() => actions.openLive(s.id)}><span className="pulse" style={{ width: 7, height: 7 }} /><span className="name">{s.title}</span>{s.protected && <Lock size={12} color="var(--fg-3)" />}<span className="meta">{s.author || "anonymous"} · {LANGUAGES[s.lang]?.name || s.lang}</span></div>)}
  </>;
}
