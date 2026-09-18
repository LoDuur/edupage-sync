import React, { useEffect, useState } from "react";
import { Radio, CircleAlert, TriangleAlert } from "lucide-react";
import { useStore } from "../store.js";
import { LANGUAGES } from "../lib/languages.js";
import { onEditor } from "../lib/editor.js";
export default function StatusBar({ actions }) {
  const { lang, run, problems, server, liveHost } = useStore();
  const [pos, setPos] = useState({ l: 1, c: 1 });
  useEffect(() => onEditor(ed => { ed.onDidChangeCursorPosition(e => setPos({ l: e.position.lineNumber, c: e.position.column })); }), []);
  const d = LANGUAGES[lang], rt = server?.runtimes?.[lang];
  const errs = problems.filter(p => p.kind !== "warning").length, warns = problems.length - errs;
  const prov = server && rt?.available ? { cls: server.mode === "firejail" ? "" : "warn", text: server.mode === "firejail" ? "Firejail sandbox" : "Local sandbox · dev" } : { cls: "off", text: lang === "pil" ? "In-browser wasm" : "Remote · Wandbox" };
  return <footer className="status">
    {liveHost && <span className="si live click" onClick={() => actions.showLive()}><Radio size={12} />Live</span>}
    <span className="si"><span className={"dot " + prov.cls} />{prov.text}{rt?.version ? ` · ${rt.version.replace(/^(\w+ )?(version )?/i, "").slice(0, 28)}` : ""}</span>
    <span className={"si" + (errs ? " err" : "")}><CircleAlert size={12} />{errs}<TriangleAlert size={12} />{warns}</span>
    <span className="sp" />
    {run.ms > 0 && run.state !== "idle" && <span className="si">{run.ms < 1000 ? run.ms + " ms" : (run.ms / 1000).toFixed(1) + " s"} · exit {run.rc}</span>}
    <span className="si">Ln {pos.l}, Col {pos.c}</span>
    <span className="si">Spaces: {d.indent}</span>
    <span className="si click" onClick={e => actions.pickLanguage(e.currentTarget)}><span className="ldot" style={{ width: 8, height: 8, borderRadius: 3, background: d.color }} />{d.name}</span>
  </footer>;
}
