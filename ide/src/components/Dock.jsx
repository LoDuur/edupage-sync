import React, { useEffect, useRef } from "react";
import { Terminal as TerminalIcon, FileOutput, CircleAlert, TriangleAlert, Eraser, ChevronUp, ChevronDown, Check, Loader2, CircleCheck, CircleX } from "lucide-react";
import { useStore } from "../store.js";
import * as session from "../lib/session.js";
import { revealLine } from "../lib/editor.js";
import { LANGUAGES } from "../lib/languages.js";

export default function Dock() {
  const { dock, setDock, run, problems, output, lang } = useStore();
  const termRef = useRef(null), splitRef = useRef(null);
  useEffect(() => { session.attach(termRef.current); }, []);
  useEffect(() => { if (dock.view === "terminal" && dock.open) setTimeout(() => { session.resize(); }, 220); }, [dock.view, dock.open, dock.max]);
  useEffect(() => {
    const g = splitRef.current, stage = g.parentElement; let drag = false;
    const saved = localStorage.getItem("dockh"); if (saved) stage.style.setProperty("--dockh", saved);
    const down = e => { drag = true; g.classList.add("on"); e.preventDefault(); };
    const move = e => { if (!drag) return; const r = stage.getBoundingClientRect(); const p = Math.min(85, Math.max(14, (r.bottom - e.clientY) / r.height * 100)); stage.style.setProperty("--dockh", p + "%"); };
    const up = () => { if (!drag) return; drag = false; g.classList.remove("on"); localStorage.setItem("dockh", stage.style.getPropertyValue("--dockh")); session.resize(); };
    g.addEventListener("mousedown", down); addEventListener("mousemove", move); addEventListener("mouseup", up);
    return () => { g.removeEventListener("mousedown", down); removeEventListener("mousemove", move); removeEventListener("mouseup", up); };
  }, []);
  const errs = problems.filter(p => p.kind !== "warning").length, warns = problems.length - errs;
  const st = run.state;
  const state = st === "idle" ? null : ["starting", "compiling", "running", "waiting"].includes(st) ? { cls: "run", icon: <Loader2 size={13} className="spin" />, text: st === "compiling" ? "Compiling…" : st === "waiting" ? "Waiting for input" : "Running…" } : st === "done" ? { cls: "ok", icon: <CircleCheck size={13} />, text: `Finished · ${ms(run.ms)}` } : st === "interrupted" ? { cls: "err", icon: <CircleX size={13} />, text: "Interrupted" } : { cls: "err", icon: <CircleX size={13} />, text: `Failed · exit ${run.rc}` };
  return <>
    <div className="dsplit" ref={splitRef} />
    <section className={"dock" + (dock.max ? " max" : "") + (dock.open ? "" : " closed")}>
      <div className="dock-h">
        <div className="pills">
          <button className={dock.view === "terminal" ? "on" : ""} onClick={() => setDock({ view: "terminal", open: true })}><TerminalIcon size={13} strokeWidth={1.8} />Terminal</button>
          <button className={dock.view === "output" ? "on" : ""} onClick={() => setDock({ view: "output", open: true })}><FileOutput size={13} strokeWidth={1.8} />Output</button>
          <button className={dock.view === "problems" ? "on" : ""} onClick={() => setDock({ view: "problems", open: true })}><CircleAlert size={13} strokeWidth={1.8} />Problems{problems.length > 0 && <span className={"n" + (errs ? " err" : "")}>{problems.length}</span>}</button>
        </div>
        {state && <span className={"state " + state.cls}>{state.icon}{state.text}</span>}
        <span className="sp" />
        <button className="ibtn sm" title="Clear" onClick={() => { if (dock.view === "terminal") session.clear(); else if (dock.view === "output") useStore.getState().setOutput(""); else useStore.getState().setProblems([]); }}><Eraser size={14} strokeWidth={1.8} /></button>
        <button className="ibtn sm" title={dock.max ? "Restore" : "Maximize"} onClick={() => setDock({ max: !dock.max, open: true })}>{dock.max ? <ChevronDown size={15} /> : <ChevronUp size={15} />}</button>
      </div>
      <div className="dock-b">
        <div className="pane" style={{ display: dock.view === "terminal" ? "flex" : "none" }}><div className="term-host" ref={termRef} onMouseUp={() => { if (!getSelection().toString()) session.focus(); }} /></div>
        {dock.view === "output" && <div className="pane"><pre className="out-pre">{output ? <><span className="cmd">❯ {LANGUAGES[lang].cmd}{"\n"}</span>{output}</> : <span className="cmd">Compiler and program transcript of the last run will appear here.</span>}</pre></div>}
        {dock.view === "problems" && <div className="pane"><div className="problems">
          {problems.length === 0 ? <div className="empty"><Check size={14} color="var(--ok)" />No problems detected.</div> : problems.map((p, i) => <div key={i} className={"prob " + (p.kind === "warning" ? "warning" : "error")} onClick={() => p.line && revealLine(p.line, p.col)}>
            <span className="ic">{p.kind === "warning" ? <TriangleAlert size={15} /> : <CircleAlert size={15} />}</span>
            <div><span>{p.msg}</span><span className="loc">{LANGUAGES[lang].file}{p.line ? `:${p.line}${p.col ? ":" + p.col : ""}` : ""} · {p.kind}</span>{p.hint && <span className="hint">{p.hint}</span>}</div></div>)}
        </div></div>}
      </div>
    </section>
  </>;
}
const ms = v => v < 1000 ? `${v} ms` : `${(v / 1000).toFixed(1)} s`;
