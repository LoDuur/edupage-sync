import React, { useEffect, useRef, useState } from "react";
import { FolderOpen, Library, Radio, Settings, RotateCcw, Search, Lock, Link2, Square, LogOut, WrapText, Map as MapIcon, Plus, Minus } from "lucide-react";
import { useStore } from "../store.js";
import { LANGUAGES, ORDER } from "../lib/languages.js";
import { listSnippets } from "../lib/supabase.js";
import { LIVE } from "../lib/live.js";
import { useMenu } from "./Menu.jsx";
import { signOut } from "../lib/access.js";
import { useMedia } from "../lib/useMedia.js";

const fmt = d => new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const VIEWS = [["workspace", "Files", FolderOpen], ["saved", "Saved", Library], ["live", "Live", Radio]];

export default function Sidebar({ actions }) {
  const { view, setView, sidebarOpen, liveHost, liveActive, liveCount } = useStore();
  const rail = useMedia("(min-width:1024px) and (max-width:1279px)");
  const [fly, setFly] = useState(false);
  const wrap = useRef(null);
  useEffect(() => { if (!rail || !fly) return; const down = e => { if (wrap.current && !wrap.current.contains(e.target)) setFly(false); }; const key = e => { if (e.key === "Escape") setFly(false); }; document.addEventListener("mousedown", down); document.addEventListener("keydown", key); return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); }; }, [rail, fly]);
  useEffect(() => { if (!rail) setFly(false); }, [rail]);
  const n = (liveHost ? 1 : 0) + (liveCount || 0);
  const badge = n > 0 && <span className="badge" aria-label={`${n} live`}>{n}</span>;
  if (rail) return <div ref={wrap} style={{ display: "contents" }}>
    <nav className="rail" aria-label="Sidebar">
      {VIEWS.map(([id, label, Icon]) => <button key={id} className={"ibtn" + (fly && view === id ? " on" : "")} title={label} aria-label={label} onClick={() => { if (fly && view === id) setFly(false); else { useStore.setState({ view: id }); setFly(true); } }}><Icon size={16} />{id === "live" && badge}</button>)}
      <span className="sp" />
      <SettingsButton />
    </nav>
    {fly && <div className="flyout"><Panel view={view} setView={v => useStore.setState({ view: v })} actions={actions} badge={badge} onPick={() => setFly(false)} /></div>}
  </div>;
  return <aside className={"sidebar" + (sidebarOpen ? "" : " closed")} aria-hidden={!sidebarOpen}>
    <div className="brand"><span className="mark">28</span><b>28teh</b><small>2.k. 28.grupa</small></div>
    <Panel view={view} setView={setView} actions={actions} badge={badge} />
  </aside>;
}

function Panel({ view, setView, actions, badge, onPick }) {
  const { activeTab, tabs, server } = useStore();
  return <>
    <div className="seg" role="tablist">
      {VIEWS.map(([id, label, Icon]) => <button key={id} role="tab" aria-selected={view === id} className={view === id ? "on" : ""} onClick={() => setView(id)}><Icon size={14} />{label}{id === "live" && badge}</button>)}
    </div>
    <div className="sb-scroll">
      {view === "workspace" && <Workspace actions={actions} activeTab={activeTab} tabs={tabs} server={server} onPick={onPick} />}
      {view === "saved" && <Saved actions={actions} activeTab={activeTab} onPick={onPick} />}
      {view === "live" && <Live actions={actions} onPick={onPick} />}
    </div>
    <div className="sb-foot">
      <span className="who">{server ? (server.mode === "firejail" ? "Sandbox · Firejail" : "Sandbox · dev mode") : "Remote executor"}</span>
      <SettingsButton />
    </div>
  </>;
}

function SettingsButton() {
  const { fontSize, setFontSize, wrap, setWrap, minimap, setMinimap } = useStore();
  const menu = useMenu(); const ref = useRef(null);
  return <>
    <button className="ibtn" ref={ref} title="Settings" aria-label="Settings" aria-haspopup="menu" onClick={() => menu.open(ref.current, [
      { h: "Editor" }, { label: "Increase font size", icon: Plus, k: "⌘ +", run: () => setFontSize(Math.min(24, fontSize + 1)) }, { label: "Decrease font size", icon: Minus, k: "⌘ −", run: () => setFontSize(Math.max(10, fontSize - 1)) },
      { label: "Word wrap", icon: WrapText, selected: wrap, run: () => setWrap(!wrap) }, { label: "Minimap", icon: MapIcon, selected: minimap, run: () => setMinimap(!minimap) },
      "-", { label: "Sign out", icon: LogOut, run: signOut },
    ], { align: "left", width: 220 })}><Settings size={16} /></button>
    {menu.el}
  </>;
}

function Workspace({ actions, activeTab, tabs, server, onPick }) {
  const cur = tabs.find(t => t.id === activeTab);
  return <>
    <div className="sb-h"><span className="label">Workspace</span></div>
    {ORDER.map(id => { const d = LANGUAGES[id]; const on = cur && cur.kind === "file" && cur.lang === id; const rt = server?.runtimes?.[id]; const unavailable = server && rt && !rt.available;
      return <div key={id} role="button" tabIndex={0} className={"row" + (on ? " on" : "")} onClick={() => { actions.openFile(id); onPick?.(); }} onKeyDown={e => { if (e.key === "Enter") { actions.openFile(id); onPick?.(); } }} title={unavailable ? `${d.name} runtime is not installed on the server – runs remotely` : d.name}>
        <span className="ldot" style={{ background: d.color }} /><span className="name">{d.file}</span>
        {unavailable && <span className="tag">remote</span>}
        <button className="act" title="Reset to template" aria-label={`Reset ${d.file} to template`} onClick={e => { e.stopPropagation(); actions.resetFile(id); }}><RotateCcw size={14} /></button>
      </div>; })}
  </>;
}

function Saved({ actions, activeTab, onPick }) {
  const [items, setItems] = useState(null), [q, setQ] = useState("");
  useEffect(() => { listSnippets().then(setItems).catch(() => setItems([])); }, []);
  const list = (items || []).filter(s => !q || (s.title + " " + (s.author || "")).toLowerCase().includes(q.toLowerCase()));
  return <>
    <div className="sb-h"><span className="label">Saved works</span><span className="n">{items ? items.length : ""}</span></div>
    <div className="search"><Search size={14} /><input placeholder="Search by title or author" aria-label="Search saved works" value={q} onChange={e => setQ(e.target.value)} /></div>
    {items === null ? <div className="sb-empty">Loading…</div> : list.length === 0 ? <div className="sb-empty">{q ? "No matches." : "Nothing has been saved yet. Use Save in the toolbar menu."}</div> :
      list.map(s => { const d = LANGUAGES[s.lang || "java"]; return <div key={s.id} role="button" tabIndex={0} className={"row" + (activeTab === "snip:" + s.id ? " on" : "")} onClick={() => { actions.openSnippet(s.id); onPick?.(); }} onKeyDown={e => { if (e.key === "Enter") { actions.openSnippet(s.id); onPick?.(); } }} title={`${s.title} · ${s.author || "anonymous"}`}>
        <span className="ldot" style={{ background: d?.color }} /><span className="name">{s.title}</span><span className="meta">{s.author || "anonymous"} · {fmt(s.created_at)}</span></div>; })}
  </>;
}

function Live({ actions, onPick }) {
  const { liveHost } = useStore();
  const [items, setItems] = useState(null);
  const load = () => LIVE.listActive().then(l => { const o = l.filter(s => !liveHost || s.id !== liveHost.state.id); setItems(o); useStore.setState({ liveActive: o.length > 0, liveCount: o.length }); }).catch(() => setItems([]));
  useEffect(() => { load(); const t = setInterval(() => { if (!document.hidden) load(); }, 15000); return () => clearInterval(t); }, [liveHost]);
  return <>
    <div className="sb-h"><span className="label">Broadcasting</span></div>
    <div className="bcast">
      {liveHost ? <>
        <div className="st"><span className="dot live" /><span>Live · {liveHost.title}</span></div>
        <p>Everyone with the link (or from this list) sees your edits in real time.</p>
        <div className="acts"><button onClick={() => actions.copyLiveLink()}><Link2 size={14} />Copy link</button><button className="end" onClick={() => actions.endLive()}><Square size={14} />End</button></div>
      </> : <>
        <div className="st"><span className="dot off" /><span>Not broadcasting</span></div>
        <p>Share your editor with the class in real time. Add a password to encrypt the session end-to-end.</p>
        <div className="acts"><button onClick={() => actions.startLive()}><Radio size={14} />Start live session</button></div>
      </>}
    </div>
    <div className="sb-h"><span className="label">Active sessions</span><span className="n">{items ? items.length : ""}</span></div>
    {items === null ? <div className="sb-empty">Loading…</div> : items.length === 0 ? <div className="sb-empty">No one is live right now.</div> :
      items.map(s => <div key={s.id} role="button" tabIndex={0} className="row" onClick={() => { actions.openLive(s.id); onPick?.(); }} onKeyDown={e => { if (e.key === "Enter") { actions.openLive(s.id); onPick?.(); } }}><span className="dot red" /><span className="name">{s.title}</span>{s.protected && <Lock size={14} color="var(--text-tertiary)" />}<span className="meta">{s.author || "anonymous"} · {LANGUAGES[s.lang]?.name || s.lang}</span></div>)}
  </>;
}
