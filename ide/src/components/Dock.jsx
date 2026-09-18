import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Terminal as TerminalIcon, FileOutput, CircleAlert, TriangleAlert, Eraser, ChevronUp, ChevronDown, Check, CircleCheck, CircleX } from "lucide-react";
import { useStore } from "../store.js";
import * as session from "../lib/session.js";
import { revealLine } from "../lib/editor.js";
import { LANGUAGES } from "../lib/languages.js";

const TABS = [["terminal", "Terminal", TerminalIcon], ["output", "Output", FileOutput], ["problems", "Problems", CircleAlert]];
const ms = v => v < 1000 ? `${v} ms` : `${(v / 1000).toFixed(1)} s`;

export default function Dock() {
  const { dock, setDock, run, problems, output, lang } = useStore();
  const termRef = useRef(null), splitRef = useRef(null), tabsRef = useRef(null);
  const [ind, setInd] = useState({ left: 0, width: 0 });
  useEffect(() => { session.attach(termRef.current); }, []);
  useEffect(() => { if (dock.view === "terminal" && dock.open) setTimeout(() => { session.resize(); }, 220); }, [dock.view, dock.open, dock.max]);
  useLayoutEffect(() => { const b = tabsRef.current?.querySelector("button.on"); if (b) setInd({ left: b.offsetLeft, width: b.offsetWidth }); }, [dock.view, problems.length]);
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
  const st = run.state, busy = ["starting", "compiling", "running", "waiting"].includes(st);
  const finished = st === "done" || st === "failed" || st === "interrupted";
  const okExit = st === "done";
  return <>
    <div className="dsplit" ref={splitRef} role="separator" aria-orientation="horizontal" aria-label="Resize panel" />
    <section className={"dock" + (dock.max ? " max" : "") + (dock.open ? "" : " closed")}>
      <div className="dock-h">
        <div className="dtabs" ref={tabsRef} role="tablist">
          {TABS.map(([id, label, Icon]) => <button key={id} role="tab" aria-selected={dock.view === id} className={dock.view === id ? "on" : ""} onClick={() => { setDock({ view: id, open: true }); if (id === "terminal") setTimeout(session.focus, 50); }}>
            <Icon size={14} />{label}{id === "problems" && errs > 0 && <span className="badge err">{errs}</span>}{id === "problems" && !errs && warns > 0 && <span className="badge warn">{warns}</span>}
          </button>)}
          <span className="ind" style={{ left: ind.left, width: ind.width }} />
        </div>
        {busy && <span className="state">{st === "compiling" ? "Compiling…" : st === "waiting" ? "Waiting for input" : "Running…"}</span>}
        <span className="sp" />
        <button className="ibtn sm" title="Clear" aria-label="Clear panel" onClick={() => { if (dock.view === "terminal") session.clear(); else if (dock.view === "output") useStore.getState().setOutput(""); else useStore.getState().setProblems([]); }}><Eraser size={14} /></button>
        <button className="ibtn sm" title={dock.max ? "Restore" : "Maximize"} aria-label={dock.max ? "Restore panel" : "Maximize panel"} onClick={() => setDock({ max: !dock.max, open: true })}>{dock.max ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</button>
      </div>
      <div className="dock-b">
        <div className="pane" style={{ display: dock.view === "terminal" ? "flex" : "none" }}>
          <div className="term-host" ref={termRef} onMouseUp={() => { if (!getSelection().toString()) session.focus(); }} />
          {finished && <div key={run.ms + st} className={"exitrow " + (okExit ? "ok" : "err")} role="status">
            {okExit ? <CircleCheck size={14} /> : <CircleX size={14} />}
            <span>{st === "interrupted" ? "Interrupted" : `Exited with code ${run.rc}`}{run.note ? ` · ${run.note}` : ""}</span>
            <span className="t">{ms(run.ms)}</span>
          </div>}
        </div>
        {dock.view === "output" && <div className="pane"><pre className="out-pre">{output ? <><span className="cmd">❯ {LANGUAGES[lang].cmd}{"\n"}</span>{output}</> : <span className="cmd">Compiler and program transcript of the last run will appear here.</span>}</pre></div>}
        {dock.view === "problems" && <div className="pane"><div className="problems">
          {problems.length === 0 ? <div className="empty"><Check size={14} color="var(--success)" />No problems detected.</div> : problems.map((p, i) => <div key={i} role="button" tabIndex={0} className={"prob " + (p.kind === "warning" ? "warning" : "error")} onClick={() => p.line && revealLine(p.line, p.col)} onKeyDown={e => { if (e.key === "Enter" && p.line) revealLine(p.line, p.col); }}>
            <span className="ic">{p.kind === "warning" ? <TriangleAlert size={14} /> : <CircleAlert size={14} />}</span>
            <div><span>{p.msg}</span><span className="loc">{LANGUAGES[lang].file}{p.line ? `:${p.line}${p.col ? ":" + p.col : ""}` : ""} · {p.kind}</span>{p.hint && <span className="hint">{p.hint}</span>}</div></div>)}
        </div></div>}
      </div>
    </section>
  </>;
}
