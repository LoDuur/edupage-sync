import React, { useEffect, useRef, useState } from "react";
import { CircleAlert, TriangleAlert } from "lucide-react";
import { useStore } from "../store.js";
import { LANGUAGES } from "../lib/languages.js";
import { onEditor, applyIndent } from "../lib/editor.js";
import { useMenu } from "./Menu.jsx";
import { executorInfo } from "./TabBar.jsx";

export default function StatusBar({ actions }) {
  const { lang, run, problems, server, liveHost, executor, indents, setIndent } = useStore();
  const [pos, setPos] = useState({ l: 1, c: 1 });
  const menu = useMenu(); const indRef = useRef(null);
  useEffect(() => onEditor(ed => { ed.onDidChangeCursorPosition(e => setPos({ l: e.position.lineNumber, c: e.position.column })); }), []);
  const d = LANGUAGES[lang], rt = server?.runtimes?.[lang];
  const errs = problems.filter(p => p.kind !== "warning").length, warns = problems.length - errs;
  const env = executorInfo(server, lang, executor);
  const ind = indents[lang] || { size: d.indent, tabs: false };
  const pickIndent = () => menu.open(indRef.current, [
    { h: "Indentation" },
    ...[2, 3, 4].map(n => ({ label: `Spaces: ${n}`, selected: !ind.tabs && ind.size === n, run: () => { setIndent(lang, { size: n, tabs: false }); applyIndent(lang); } })),
    { label: "Tabs", selected: ind.tabs, run: () => { setIndent(lang, { size: ind.size, tabs: true }); applyIndent(lang); } },
  ], { align: "right", width: 160 });
  const finished = run.state === "done" || run.state === "failed" || run.state === "interrupted";
  return <footer className="status">
    {liveHost && <button className="si click" onClick={() => actions.showLive()}><span className="dot live" />Live</button>}
    <span className="si"><span className={"dot " + env.cls} />{env.label}{rt?.version && env.provider === "sandbox" ? ` · ${rt.version.replace(/^(\w+ )?(version )?/i, "").slice(0, 28)}` : ""}</span>
    {errs > 0 && <span className="si err"><CircleAlert size={12} />{errs} {errs === 1 ? "error" : "errors"}</span>}
    {warns > 0 && <span className="si warn"><TriangleAlert size={12} />{warns} {warns === 1 ? "warning" : "warnings"}</span>}
    <span className="sp" />
    <span className="vdiv" />
    {finished && run.ms > 0 && <span className="si">{run.ms < 1000 ? run.ms + " ms" : (run.ms / 1000).toFixed(1) + " s"} · exit {run.rc ?? "–"}</span>}
    <span className="si">Ln {pos.l}, Col {pos.c}</span>
    <button className="si click" ref={indRef} onClick={pickIndent} aria-haspopup="menu">{ind.tabs ? "Tabs" : `Spaces: ${ind.size}`}</button>
    <button className="si click" onClick={e => actions.pickLanguage(e.currentTarget)} aria-haspopup="menu"><span className="dot" style={{ background: d.color }} />{d.name}</button>
    {menu.el}
  </footer>;
}
