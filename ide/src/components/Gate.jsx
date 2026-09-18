import React, { useState } from "react";
import { ArrowLeft, KeyRound } from "lucide-react";
import { tryAccess } from "../lib/access.js";
export default function Gate({ onOk }) {
  const [v, setV] = useState(""), [err, setErr] = useState(""), [shake, setShake] = useState(false);
  const go = async () => { if (await tryAccess(v)) onOk(); else { setErr("Incorrect access code"); setShake(true); setTimeout(() => setShake(false), 350); } };
  return <div className="gate"><div className={"card" + (shake ? " shake" : "")}>
    <div className="logo">28</div><h1>28teh</h1><p>Enter the class access code to open the workspace.</p>
    <div className="field"><KeyRound size={15} color="var(--fg-3)" /><input autoFocus autoCapitalize="characters" spellCheck={false} placeholder="ACCESS CODE" value={v} onChange={e => setV(e.target.value)} onKeyDown={e => e.key === "Enter" && go()} /></div>
    <div className="err">{err}</div>
    <div className="actions"><button className="btn pri" onClick={go}>Continue</button><a href="../"><ArrowLeft size={13} style={{ verticalAlign: -2 }} /> Timetable</a></div>
  </div></div>;
}
