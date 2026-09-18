import React, { useEffect, useRef, useState } from "react";
import { X, ChevronDown, ArrowUp, Square, BookOpen, CircleAlert, SearchCheck, SquarePen, FlaskConical, GraduationCap, CircleHelp, TriangleAlert, Wrench } from "lucide-react";
import { useStore } from "../store.js";
import { loadModels, chat } from "../lib/ai.js";
import { MODELS, modelOf, providerOf } from "../lib/models.js";
import { PROMPTS } from "../lib/prompts.js";
import { PIL, LANGUAGES } from "../lib/languages.js";
import { useMenu } from "./Menu.jsx";
import Markdown, { Thinking } from "./Markdown.jsx";
import { AiMessageBubble } from "@/components/ui/message-bubble";
import { ThinkingOrb } from "@/components/ui/thinking-orbs";

const PHASE = { err: ["shaping", "Shaping…"], complete: ["shaping", "Shaping…"], explain: ["composing", "Composing…"], review: ["composing", "Composing…"], task: ["composing", "Composing…"], tests: ["solving", "Solving…"], chat: ["solving", "Solving…"] };
const QA = [["Understand", [["explain", BookOpen], ["err", CircleAlert]]], ["Practice", [["review", SearchCheck], ["complete", SquarePen], ["tests", FlaskConical], ["task", GraduationCap]]]];
const fmtMs = v => v < 1000 ? `${v} ms` : `${(v / 1000).toFixed(1)} s`;

function suggest(lang, code, hasError) {
  const out = [];
  if (hasError) out.push({ icon: TriangleAlert, label: "Explain the last error", text: PROMPTS.QUICK.err[0], intent: "err" });
  if (/Scanner|input\(|cin\s*>>|scanf|Console\.Read|io\.read|readln|readch/.test(code)) out.push({ icon: CircleHelp, label: "Explain the input handling", text: "Explain how this program reads and validates its input, and what happens with unexpected input.", intent: "explain" });
  if (/\b(for|while)\b/.test(code)) out.push({ icon: CircleHelp, label: "Walk me through the loop", text: "Walk me through what the loop in this code does, iteration by iteration, for one small example input.", intent: "explain" });
  out.push({ icon: Wrench, label: "Suggest error handling", text: "Suggest how to add error handling to this program without changing its behaviour for valid input. Return the full file.", intent: "complete" });
  out.push({ icon: CircleHelp, label: "Explain this code", text: PROMPTS.QUICK.explain[0], intent: "explain" });
  out.push({ icon: FlaskConical, label: "Give me test inputs", text: PROMPTS.QUICK.tests[0], intent: "tests" });
  return out.slice(0, 3);
}

export default function AIPanel({ actions, context }) {
  const { aiOpen, toggleAI, lang, model, setModel, problems, aiWidth } = useStore();
  const [models, setModels] = useState(MODELS);
  const [msgs, setMsgs] = useState([]);
  const [busy, setBusy] = useState(false), [phase, setPhase] = useState(null), [q, setQ] = useState("");
  const log = useRef(null), ta = useRef(null), hist = useRef([]), pickRef = useRef(null), abort = useRef(null), seq = useRef(0);
  const menu = useMenu();
  useEffect(() => { loadModels().then(ms => { setModels(ms); if (!ms.some(m => m.id === useStore.getState().model)) setModel(ms[0].id); }); }, []);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [msgs, phase]);
  useEffect(() => { if (aiOpen) setTimeout(() => ta.current?.focus(), 250); }, [aiOpen]);

  async function ask(text, shown, intent = "chat") {
    if (busy || !text.trim()) return;
    setBusy(true); toggleAI(true);
    const aid = ++seq.current;
    setMsgs(m => [...m, { id: "u" + aid, role: "user", text: shown || text }, { id: "a" + aid, role: "assistant", content: "", reasoning: "", streaming: true, model }]);
    const [state, label] = PHASE[intent] || PHASE.chat; setPhase({ state, label });
    const ctl = new AbortController(); abort.current = ctl;
    let pending = null, raf = 0;
    const patch = p => setMsgs(ms => ms.map(m => m.id === "a" + aid ? { ...m, ...p } : m));
    const flush = () => { raf = 0; if (!pending) return; const u = pending; pending = null; patch({ content: u.content, reasoning: u.reasoning, model: u.model }); if (u.content) setPhase(null); };
    try {
      const c = context();
      const res = await chat(model, [{ role: "system", content: PROMPTS.system(lang, PIL.DOC_TEXT) }, ...hist.current.slice(-6), { role: "user", content: text + "\n\n" + c }], { signal: ctl.signal, onUpdate: u => { pending = u; if (!raf) raf = requestAnimationFrame(flush); } });
      cancelAnimationFrame(raf); pending = null;
      patch({ content: res.content, reasoning: res.reasoning, model: res.model, metrics: res.metrics, streaming: false });
      hist.current.push({ role: "user", content: shown || text }, { role: "assistant", content: res.content });
    } catch (e) { cancelAnimationFrame(raf); patch({ streaming: false, error: e.message }); }
    setPhase(null); setBusy(false); abort.current = null;
  }
  const stop = () => abort.current?.abort();
  const send = () => { const v = q; if (!v.trim()) return; setQ(""); if (ta.current) ta.current.style.height = "22px"; ask(v); };
  const quick = k => { const [text, label] = PROMPTS.QUICK[k]; if (k === "err" && !useStore.getState().problems.length && !context().includes("Last error")) return actions.notify("Run the code first – there is no error to explain."); ask(text, label, k); };
  const cur = modelOf(model) || models[0];
  const code = actions.currentCode();
  const hasError = problems.some(p => p.kind !== "warning");
  return <aside className={"ai" + (aiOpen ? " open" : "")} style={{ "--aiw": aiWidth + "px" }} aria-hidden={!aiOpen} aria-label="Assistant">
    <div className="ai-h"><span className="t">Assistant</span><span className="sp" />
      <button className="mpick" ref={pickRef} title={cur?.name} aria-label={`Model: ${cur?.name}`} aria-haspopup="menu" onClick={() => menu.open(pickRef.current, models.map(m => ({ label: m.name, selected: m.id === model, run: () => setModel(m.id) })), { align: "right", width: 240 })}><span>{cur?.short}</span><ChevronDown size={14} /></button>
      <button className="ibtn" title="Close" aria-label="Close assistant" onClick={() => toggleAI(false)}><X size={16} /></button></div>
    <div className="chat" ref={log}>
      {msgs.length === 0 && <div>
        <p className="hello">Ask about the open file, its output or the last error.</p>
        <div className="chips">{suggest(lang, code, hasError).map((c, i) => <button key={i} onClick={() => ask(c.text, c.label, c.intent)}><c.icon size={14} />{c.label}</button>)}</div>
      </div>}
      {msgs.map(m => m.role === "user" ? <AiMessageBubble key={m.id} role="user" content={m.text} /> :
        <AiMessageBubble key={m.id} role="assistant" provider={providerOf(m.model)} content={m.content} isStreaming={m.streaming && !!m.content}>
          <Thinking text={m.reasoning} />
          <Markdown text={m.content} streaming={m.streaming} lang={lang} file={LANGUAGES[lang].file} isEdit={actions.isWholeFile} current={actions.currentCode} onApply={actions.applyCode} onInsert={actions.insertCode} />
          {m.error && <div className="mmeta err">{m.error}</div>}
          {m.metrics && <div className="mmeta"><span>{modelOf(m.model)?.name || String(m.model).split("/").pop()}</span>·<span>{m.metrics.estimated ? "~" : ""}{Math.round(m.metrics.tps)} tok/s</span>·<span>{fmtMs(m.metrics.ms)}</span></div>}
        </AiMessageBubble>)}
    </div>
    {phase && <div className="orbpill" role="status"><ThinkingOrb state={phase.state} size={20} theme="dark" /><span>{phase.label}</span></div>}
    <div className="composer">
      <div className="qa">
        {QA.map(([label, items]) => <div key={label}><span className="label">{label}</span><div className="rowq">{items.map(([k, Icon]) => <button key={k} onClick={() => quick(k)} disabled={busy}><Icon size={14} />{PROMPTS.QUICK[k][1]}</button>)}</div></div>)}
      </div>
      <div className="box">
        <textarea ref={ta} rows={1} aria-label="Message the assistant" placeholder={`Ask about your ${LANGUAGES[lang].name} code…`} value={q} onChange={e => { setQ(e.target.value); e.target.style.height = "22px"; e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px"; }} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <div className="row"><span className="hint">Enter to send · Shift+Enter for a new line</span>
          <button className={"send" + (busy ? " stop" : q.trim() ? " ready" : "")} disabled={!busy && !q.trim()} onClick={busy ? stop : send} aria-label={busy ? "Stop generating" : "Send message"}><ArrowUp size={16} /><Square size={14} /></button></div>
      </div>
    </div>
    {menu.el}
  </aside>;
}
