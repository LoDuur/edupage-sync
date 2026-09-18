import React, { useCallback, useEffect, useRef, useState } from "react";
import { CircleCheck, CircleX, Info } from "lucide-react";
import { useStore } from "./store.js";
import { LANGUAGES, ORDER, loadDraft } from "./lib/languages.js";
import { hasAccess, accessKey } from "./lib/access.js";
import { probeServer } from "./lib/exec.js";
import { getEditor, fileModel, extraModel, disposeExtra, onEditor, setMarkers } from "./lib/editor.js";
import * as session from "./lib/session.js";
import { getSnippet, saveSnippet } from "./lib/supabase.js";
import { LIVE } from "./lib/live.js";
import Gate from "./components/Gate.jsx";
import Sidebar from "./components/Sidebar.jsx";
import TabBar from "./components/TabBar.jsx";
import EditorPane from "./components/EditorPane.jsx";
import Dock from "./components/Dock.jsx";
import AIPanel from "./components/AIPanel.jsx";
import StatusBar from "./components/StatusBar.jsx";
import { Modal } from "./components/Modal.jsx";
import { useMenu } from "./components/Menu.jsx";
import CommandPalette from "./components/CommandPalette.jsx";
import { executorInfo } from "./components/TabBar.jsx";

export default function App() {
  const [access, setAccess] = useState(null);
  useEffect(() => { hasAccess().then(setAccess); }, []);
  if (access === null) return null;
  if (!access) return <Gate onOk={() => setAccess(true)} />;
  return <IDE />;
}

function IDE() {
  const S = useStore();
  const { tabs, activeTab, lang, server } = S;
  const [modal, setModal] = useState(null);
  const menu = useMenu();
  const liveViewRef = useRef(null);

  /* ---- tabs ---- */
  const activate = useCallback(id => {
    const t = useStore.getState().tabs.find(x => x.id === id); if (!t) return;
    const ed = getEditor(); if (ed) { ed.setModel(t.model); ed.updateOptions({ readOnly: t.kind !== "file" }); setMarkers([]); }
    useStore.setState({ activeTab: id, lang: t.lang, problems: [] }); localStorage.setItem("code-lang", t.lang);
    const u = new URL(location.href); u.search = t.kind === "file" ? `?lang=${t.lang}` : t.kind === "snippet" ? `?id=${t.data.id}` : `?live=${t.data.id}`; history.replaceState(null, "", u);
    document.title = `${t.title} – 28teh`;
    const host = useStore.getState().liveHost; if (host && t.kind === "file" && host.state.lang !== t.lang) host.setLang(t.lang);
  }, []);
  const openFile = useCallback(id => { const d = LANGUAGES[id]; S.openTab({ id: "file:" + id, kind: "file", lang: id, title: d.file, model: fileModel(id) }); activate("file:" + id); getEditor()?.focus(); }, [activate]);
  const closeTab = useCallback(id => {
    const st = useStore.getState(); const t = st.tabs.find(x => x.id === id); if (!t) return;
    if (t.kind === "live") { if (st.liveHost && st.liveHost.state.id === t.data.id) return endLive(); liveViewRef.current?.close(); liveViewRef.current = null; }
    st.closeTab(id); if (t.kind !== "file") disposeExtra(id);
    const next = useStore.getState().activeTab; if (next) activate(next); else openFile(t.lang);
  }, [activate, openFile]);
  const resetFile = id => { if (!confirm(`Reset ${LANGUAGES[id].file} to the starter template? Your current code in this file will be lost.`)) return; fileModel(id).setValue(LANGUAGES[id].template); openFile(id); };

  /* ---- boot ---- */
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    const start = LANGUAGES[p.get("lang")] ? p.get("lang") : lang;
    const off = onEditor(() => {
      openFile(start);
      if (p.get("id")) openSnippet(p.get("id")); else if (p.get("live")) openLive(p.get("live"));
      if (p.get("view") === "saved") useStore.setState({ view: "saved", sidebarOpen: true });
    });
    probeServer().then(s => useStore.setState({ server: s }));
    LIVE.listActive().then(l => useStore.setState({ liveActive: l.length > 0, liveCount: l.length })).catch(() => {});
    return off;
  }, []);

  /* ---- run ---- */
  const run = useCallback(() => {
    const st = useStore.getState(); const t = st.tabs.find(x => x.id === st.activeTab); if (!t) return;
    const code = t.model.getValue(); if (!code.trim()) return st.notify("Nothing to run.", "error");
    session.run({ lang: t.lang, code, provider: executorInfo(st.server, t.lang, st.executor).provider });
  }, []);
  const stop = () => session.stop();
  const format = () => getEditor()?.getAction("editor.action.formatDocument")?.run();

  /* ---- save ---- */
  const save = () => { const t = tabs.find(x => x.id === activeTab); if (!t || t.kind !== "file") return S.notify("Only workspace files can be saved.", "info"); if (!t.model.getValue().trim()) return; setModal({ kind: "save", lang: t.lang, code: t.model.getValue(), title: t.title.replace(/\.\w+$/, "") }); };
  async function openSnippet(id) {
    const s = await getSnippet(id); if (!s) return S.notify("Saved work not found.", "error");
    const l = s.lang || "java", tid = "snip:" + s.id;
    S.openTab({ id: tid, kind: "snippet", lang: l, title: s.title, data: s, model: extraModel(tid, s.code, l) }); activate(tid);
  }

  /* ---- live ---- */
  function startLive() { const t = tabs.find(x => x.id === activeTab); if (!t || t.kind !== "file") return S.notify("Open a workspace file to start a live session.", "info"); setModal({ kind: "live", lang: t.lang, title: t.title.replace(/\.\w+$/, "") }); }
  async function endLive() { const h = useStore.getState().liveHost; if (!h) return; useStore.setState({ liveHost: null }); await h.end(); S.notify("Live session ended."); }
  const copyLiveLink = () => { const h = useStore.getState().liveHost; if (h) navigator.clipboard.writeText(`${location.origin}${location.pathname}?live=${h.state.id}`).then(() => S.notify("Viewer link copied.", "ok")); };
  async function openLive(id) {
    liveViewRef.current?.close();
    const tid = "live:" + id; let tab = null;
    const v = LIVE.view(id, {
      onMeta: s => { if (tab) { tab.title = s.title; useStore.setState(st => ({ tabs: [...st.tabs] })); } },
      onCode: (code, s) => { if (!tab) return; if (tab.model.getValue() !== code) { const ed = getEditor(); const pos = ed?.getPosition(); tab.model.setValue(code); if (useStore.getState().activeTab === tid && pos) ed.setPosition(pos); } },
      onEnd: () => S.notify("The live session has ended."),
      onLocked: wrong => setModal({ kind: "lock", title: v.session?.title || "", wrong, view: v, tabId: tid }),
    });
    try {
      const s = await v.open(); liveViewRef.current = v; const l = s.lang || "java";
      tab = { id: tid, kind: "live", lang: l, title: s.title, data: { id }, model: extraModel(tid, s.protected ? "" : (s.code || ""), l) };
      S.openTab(tab); activate(tid); await v.open();
    } catch (e) { S.notify(e.message, "error"); }
  }
  useEffect(() => onEditor(ed => { ed.onDidChangeModelContent(() => { const h = useStore.getState().liveHost; if (h) h.changed(); }); }), []);
  useEffect(() => { const h = () => { const host = useStore.getState().liveHost; if (host) host.end(true); }; addEventListener("pagehide", h); return () => removeEventListener("pagehide", h); }, []);

  /* ---- misc actions ---- */
  const isWholeFile = (code, blockLang = "") => { const l = useStore.getState().lang; if (blockLang && blockLang.toLowerCase() !== l && !(l === "cpp" && /^c\+\+$/i.test(blockLang)) && !(l === "csharp" && /^(cs|c#)$/i.test(blockLang)) && !(l === "python" && /^py$/i.test(blockLang))) return false; return l === "java" ? /class\s+\w+/.test(code) && code.includes("main(") : l === "pil" ? /^\s*main\s*\(\s*\)/m.test(code) : code.split("\n").length > 3; };
  const currentCode = () => { const st = useStore.getState(); const t = st.tabs.find(x => x.id === st.activeTab); return t ? t.model.getValue() : ""; };
  const applyCode = code => { const st = useStore.getState(); const t = st.tabs.find(x => x.id === st.activeTab); if (!t || t.kind !== "file") openFile(st.lang); const ed = getEditor(); if (!ed) return; const m = ed.getModel(); ed.pushUndoStop(); ed.executeEdits("ai", [{ range: m.getFullModelRange(), text: code }]); ed.pushUndoStop(); ed.focus(); S.notify("Change applied to " + LANGUAGES[st.lang].file, "ok"); };
  const insertCode = code => { const st = useStore.getState(); const t = st.tabs.find(x => x.id === st.activeTab); const ed = getEditor(); if (!ed) return; if (!t || t.kind !== "file") openFile(st.lang); ed.executeEdits("ai", [{ range: ed.getSelection(), text: code }]); ed.focus(); };
  const pickLanguage = anchor => menu.open(anchor, ORDER.map(k => ({ label: LANGUAGES[k].name, dot: LANGUAGES[k].color, selected: k === lang, k: LANGUAGES[k].file, run: () => openFile(k) })), { align: "right", width: 210 });
  const context = () => { const t = tabs.find(x => x.id === activeTab); const st = useStore.getState(); const probs = st.problems.map(p => `${p.kind}${p.line ? " line " + p.line : ""}: ${p.msg}`).join("\n"); return `Language: ${LANGUAGES[lang].name}. Current code (${LANGUAGES[lang].file}):\n\`\`\`${lang}\n${t ? t.model.getValue() : ""}\n\`\`\`${probs ? `\nLast error:\n${probs}\n${st.output.slice(0, 1200)}` : st.output ? `\nLast output:\n${st.output.slice(0, 800)}` : ""}`; };
  const actions = { openFile, resetFile, activate, closeTab, run, stop, save, format, openSnippet, openLive, startLive, endLive, copyLiveLink, pickLanguage, insertCode, applyCode, isWholeFile, currentCode, notify: S.notify, showLive: () => useStore.setState({ view: "live", sidebarOpen: true }) };

  /* ---- shortcuts ---- */
  useEffect(() => {
    const k = e => { const mod = e.metaKey || e.ctrlKey; if (!mod) return; const key = e.key.toLowerCase();
      if (e.key === "Enter") { e.preventDefault(); run(); } else if (key === "k") { e.preventDefault(); S.setPalette(!useStore.getState().palette); } else if (key === "s") { e.preventDefault(); save(); } else if (key === "i") { e.preventDefault(); S.toggleAI(); } else if (key === "j") { e.preventDefault(); S.setDock({ open: !useStore.getState().dock.open }); } else if (key === "b") { e.preventDefault(); S.toggleSidebar(); } else if (key === "`") { e.preventDefault(); S.setDock({ view: "terminal", open: true }); session.focus(); } else if (key === "=" || key === "+") { e.preventDefault(); S.setFontSize(Math.min(24, useStore.getState().fontSize + 1)); } else if (key === "-") { e.preventDefault(); S.setFontSize(Math.max(10, useStore.getState().fontSize - 1)); } };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, [run]);

  return <div className="app">
    <div className="body">
      <Sidebar actions={actions} />
      <main className="stage">
        <TabBar actions={actions} />
        <EditorPane />
        <Dock />
      </main>
      {S.aiOpen && <Resizer />}
      <AIPanel actions={actions} context={context} />
    </div>
    <StatusBar actions={actions} />
    <CommandPalette actions={actions} />
    {menu.el}
    {modal?.kind === "save" && <SaveModal m={modal} onClose={() => setModal(null)} onSaved={id => { setModal(null); S.notify("Saved to the class archive.", "ok"); openSnippet(id); }} />}
    {modal?.kind === "live" && <LiveModal m={modal} onClose={() => setModal(null)} onStarted={h => { setModal(null); useStore.setState({ liveHost: h, view: "live", sidebarOpen: true }); navigator.clipboard.writeText(`${location.origin}${location.pathname}?live=${h.state.id}`).then(() => S.notify("Live session started · viewer link copied.", "ok"), () => S.notify("Live session started.", "ok")); }} />}
    {modal?.kind === "lock" && <LockModal m={modal} onClose={() => { setModal(null); closeTab(modal.tabId); }} onUnlocked={() => setModal(null)} />}
    <Toast />
  </div>;
}

function Toast() {
  const t = useStore(s => s.toast); const [shown, setShown] = useState(null);
  useEffect(() => { if (t) { setShown(t); return; } const tm = setTimeout(() => setShown(null), 150); return () => clearTimeout(tm); }, [t]);
  if (!shown) return null;
  return <div className={"toast " + shown.kind + (t ? "" : " out")} role="status">{shown.kind === "ok" ? <CircleCheck size={14} /> : shown.kind === "error" ? <CircleX size={14} /> : <Info size={14} />}{shown.text}</div>;
}
function Resizer() {
  const ref = useRef(null);
  useEffect(() => {
    const g = ref.current; let drag = false;
    const down = e => { drag = true; g.classList.add("on"); document.body.style.cursor = "col-resize"; e.preventDefault(); };
    const move = e => { if (drag) useStore.getState().setAiWidth(innerWidth - e.clientX); };
    const up = () => { if (!drag) return; drag = false; g.classList.remove("on"); document.body.style.cursor = ""; };
    g.addEventListener("mousedown", down); addEventListener("mousemove", move); addEventListener("mouseup", up);
    return () => { g.removeEventListener("mousedown", down); removeEventListener("mousemove", move); removeEventListener("mouseup", up); };
  }, []);
  const w = useStore(s => s.aiWidth);
  return <div className="vsplit" ref={ref} role="separator" tabIndex={0} aria-orientation="vertical" aria-label="Resize assistant panel" aria-valuenow={w} aria-valuemin={280} onKeyDown={e => { if (e.key === "ArrowLeft") { e.preventDefault(); useStore.getState().setAiWidth(w + 16); } else if (e.key === "ArrowRight") { e.preventDefault(); useStore.getState().setAiWidth(w - 16); } }} />;
}

function SaveModal({ m, onClose, onSaved }) {
  const [title, setTitle] = useState(m.title), [author, setAuthor] = useState(localStorage.getItem("java-author") || ""), [key, setKey] = useState(sessionStorage.getItem("java-key") || accessKey()), [msg, setMsg] = useState(""), [busy, setBusy] = useState(false);
  const go = async () => { if (!title.trim()) return setMsg("A title is required."); if (!key) return setMsg("The class access code is required."); setBusy(true); setMsg(""); try { const id = await saveSnippet({ title: title.trim(), author: author.trim(), code: m.code, passkey: key, lang: m.lang }); localStorage.setItem("java-author", author.trim()); sessionStorage.setItem("java-key", key); onSaved(id); } catch (e) { setMsg(e.message); } setBusy(false); };
  return <Modal title="Save to class archive" onClose={onClose}>
    <p>Saved code is public to the class and cannot be edited afterwards.</p>
    <label>Title</label><div className="field"><input autoFocus value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === "Enter" && go()} maxLength={80} /></div>
    <label>Author</label><div className="field"><input value={author} onChange={e => setAuthor(e.target.value)} onKeyDown={e => e.key === "Enter" && go()} maxLength={40} placeholder="Name or nickname" /></div>
    <label>Class access code</label><div className="field"><input type="password" value={key} onChange={e => setKey(e.target.value)} onKeyDown={e => e.key === "Enter" && go()} /></div>
    <div className={"msg" + (msg ? " err" : "")}>{msg}</div>
    <div className="actions"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn pri" disabled={busy} onClick={go}>{busy ? "Saving…" : "Save"}</button></div>
  </Modal>;
}
function LiveModal({ m, onClose, onStarted }) {
  const [title, setTitle] = useState(m.title), [author, setAuthor] = useState(localStorage.getItem("java-author") || ""), [pass, setPass] = useState(""), [key, setKey] = useState(sessionStorage.getItem("java-key") || accessKey()), [msg, setMsg] = useState(""), [busy, setBusy] = useState(false);
  const go = async () => { if (!title.trim()) return setMsg("A title is required."); if (!key) return setMsg("The class access code is required."); setBusy(true); setMsg(""); try { const h = LIVE.host({ title: title.trim(), author: author.trim(), lang: m.lang, password: pass, passkey: key, getCode: () => getEditor()?.getValue() || "" }); h.title = title.trim(); h.state.onError = e => useStore.getState().notify("Live: " + e.message, "error"); await h.start(); localStorage.setItem("java-author", author.trim()); sessionStorage.setItem("java-key", key); onStarted(h); } catch (e) { setMsg(e.message === "Nepareiza atslēga" ? "Incorrect access code." : e.message); } setBusy(false); };
  return <Modal title="Start live session" onClose={onClose}>
    <p>Viewers see your code update in real time. With a password the session is encrypted end-to-end.</p>
    <label>Session title</label><div className="field"><input autoFocus value={title} onChange={e => setTitle(e.target.value)} maxLength={80} /></div>
    <label>Your name</label><div className="field"><input value={author} onChange={e => setAuthor(e.target.value)} maxLength={40} /></div>
    <label>Viewer password (optional)</label><div className="field"><input type="password" value={pass} onChange={e => setPass(e.target.value)} placeholder="Leave empty for a public session" autoComplete="new-password" /></div>
    <label>Class access code</label><div className="field"><input type="password" value={key} onChange={e => setKey(e.target.value)} onKeyDown={e => e.key === "Enter" && go()} /></div>
    <div className={"msg" + (msg ? " err" : "")}>{msg}</div>
    <div className="actions"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn pri" disabled={busy} onClick={go}>{busy ? "Starting…" : "Start"}</button></div>
  </Modal>;
}
function LockModal({ m, onClose, onUnlocked }) {
  const [pass, setPass] = useState(""), [msg, setMsg] = useState(m.wrong ? "Incorrect password." : ""), [busy, setBusy] = useState(false);
  const go = async () => { if (!pass) return; setBusy(true); const ok = await m.view.unlock(pass); setBusy(false); if (ok) onUnlocked(); else setMsg("Incorrect password."); };
  return <Modal title="Protected live session" onClose={onClose}>
    <p>{m.title}</p>
    <label>Password</label><div className="field"><input autoFocus type="password" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === "Enter" && go()} /></div>
    <div className={"msg" + (msg ? " err" : "")}>{msg}</div>
    <div className="actions"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn pri" disabled={busy} onClick={go}>Watch</button></div>
  </Modal>;
}
