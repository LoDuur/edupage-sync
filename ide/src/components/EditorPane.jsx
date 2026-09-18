import React, { useEffect, useRef } from "react";
import { Play, Square, Save, WandSparkles, Loader2 } from "lucide-react";
import { useStore } from "../store.js";
import { mountEditor, getEditor } from "../lib/editor.js";
import { LANGUAGES } from "../lib/languages.js";

export default function EditorPane({ actions }) {
  const host = useRef(null);
  const { fontSize, wrap, minimap, run, activeTab, tabs, server, lang } = useStore();
  useEffect(() => { mountEditor(host.current, { fontSize, wrap, minimap }); }, []);
  useEffect(() => { const e = getEditor(); if (e) e.updateOptions({ fontSize, wordWrap: wrap ? "on" : "off", minimap: { enabled: minimap, renderCharacters: false } }); }, [fontSize, wrap, minimap]);
  const tab = tabs.find(t => t.id === activeTab);
  const busy = ["starting", "compiling", "running", "waiting"].includes(run.state);
  const rt = server?.runtimes?.[lang];
  const provider = server && rt?.available ? (server.mode === "firejail" ? "Firejail sandbox" : "Local sandbox (dev)") : lang === "pil" ? "In-browser (wasm)" : "Remote (Wandbox)";
  const provClass = server && rt?.available ? (server.mode === "firejail" ? "" : "warn") : "off";
  return <div className="editor-wrap">
    <div className="editor-host" ref={host} />
    <div className="fab">
      <span className="prov" title="Where your code runs"><i className={provClass} />{provider}</span>
      <span className="sep" />
      {busy ? <button className="ibtn stop" title="Stop (Ctrl+C in terminal)" onClick={actions.stop}><Square size={15} strokeWidth={2.2} fill="currentColor" /></button> : null}
      <button className="btn pri" disabled={busy || !tab} title="Run (⌘/Ctrl+Enter)" onClick={actions.run}>{busy ? <Loader2 size={15} className="spin" /> : <Play size={15} strokeWidth={2.4} fill="currentColor" />}<span className="lbl">{run.state === "compiling" ? "Compiling" : run.state === "waiting" ? "Waiting for input" : busy ? "Running" : "Run"}</span>{!busy && <kbd>⌘↵</kbd>}</button>
      <button className="ibtn" title="Save to class archive (⌘S)" disabled={!tab || tab.kind !== "file"} onClick={actions.save}><Save size={16} strokeWidth={1.8} /></button>
      <button className="ibtn" title="Format document (⇧⌥F)" disabled={!tab || tab.kind !== "file"} onClick={actions.format}><WandSparkles size={16} strokeWidth={1.8} /></button>
    </div>
  </div>;
}
