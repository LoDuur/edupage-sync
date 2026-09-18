import React, { useEffect, useRef, useState } from "react";
import { Sparkles, X, ChevronDown, ArrowUp, User, FileInput } from "lucide-react";
import { useStore } from "../store.js";
import { loadModels, chat, brandOf, BRAND_ICONS } from "../lib/ai.js";
import { PROMPTS } from "../lib/prompts.js";
import { PIL, LANGUAGES } from "../lib/languages.js";
import { getEditor } from "../lib/editor.js";
import { useMenu } from "./Menu.jsx";

const brandUrl = id => BRAND_ICONS[brandOf(id)] || BRAND_ICONS["openrouter-color"];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function md(s) { const parts = s.split(/```[a-zA-Z#+]*\n?([\s\S]*?)```/g); return parts.map((p, i) => i % 2 ? `<pre>${esc(p.trim())}<button class="ins" data-code="${encodeURIComponent(p.trim())}">Insert</button></pre>` : esc(p).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>")).join(""); }

export default function AIPanel({ actions, context }) {
  const { aiOpen, toggleAI, lang } = useStore();
  const [models, setModels] = useState([]), [model, setModel] = useState(localStorage.getItem("java-ai-model") || "");
  const [msgs, setMsgs] = useState([{ role: "a", html: "Hi! I can see your code, what you typed into the terminal and the last output. Ask me anything about it or use a quick action below." }]);
  const [busy, setBusy] = useState(false), [q, setQ] = useState("");
  const log = useRef(null), ta = useRef(null), hist = useRef([]), pickRef = useRef(null);
  const menu = useMenu();
  useEffect(() => { loadModels().then(ms => { setModels(ms); if (!ms.some(m => m.id === model)) setModel(ms[0]?.id || ""); }); }, []);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [msgs, busy]);
  useEffect(() => { if (aiOpen) setTimeout(() => ta.current?.focus(), 250); }, [aiOpen]);
  const pick = id => { setModel(id); localStorage.setItem("java-ai-model", id); };
  async function ask(text, shown) {
    if (busy || !text.trim()) return; setBusy(true); toggleAI(true);
    setMsgs(m => [...m, { role: "u", text: shown || text }]);
    try {
      const c = context();
      const res = await chat(model, [{ role: "system", content: PROMPTS.system(lang, PIL.DOC_TEXT) }, ...hist.current.slice(-6), { role: "user", content: text + "\n\n" + c }]);
      hist.current.push({ role: "user", content: shown || text }, { role: "assistant", content: res.content });
      setMsgs(m => [...m, { role: "a", html: md(res.content), model: res.model }]);
    } catch (e) { setMsgs(m => [...m, { role: "a", html: `<span style="color:var(--err)">${esc(e.message)}</span>` }]); }
    setBusy(false);
  }
  const onLogClick = e => { const b = e.target.closest(".ins"); if (!b) return; const code = decodeURIComponent(b.dataset.code); actions.insertCode(code); };
  const modelName = models.find(m => m.id === model)?.name || (models.length ? "Model" : "pollinations");
  return <aside className={"ai" + (aiOpen ? " open" : "")} aria-hidden={!aiOpen}><div className="ai-inner">
    <div className="ai-h"><span className="t"><span className="g"><Sparkles size={13} strokeWidth={2.2} /></span>Assistant</span><span className="sp" />
      <button className="mpick" ref={pickRef} title="Model" onClick={() => menu.open(pickRef.current, models.length ? models.map(m => ({ label: m.name, img: brandUrl(m.id), selected: m.id === model, run: () => pick(m.id) })) : [{ label: "pollinations (fallback)", selected: true }], { align: "right", width: 260 })}><img src={brandUrl(model || "openai")} alt="" /><span>{modelName}</span><ChevronDown size={13} /></button>
      <button className="ibtn" title="Close" onClick={() => toggleAI(false)}><X size={16} strokeWidth={1.8} /></button></div>
    <div className="chat" ref={log} onClick={onLogClick}>
      {msgs.map((m, i) => <div key={i} className={"m " + m.role}><span className="av">{m.role === "a" ? <Sparkles size={13} strokeWidth={2.2} /> : <User size={13} />}</span>
        {m.role === "a" ? <div className="bub" dangerouslySetInnerHTML={{ __html: m.html + (m.model ? `<span class="prov">${esc(m.model)}</span>` : "") }} /> : <div className="bub">{m.text}</div>}</div>)}
      {busy && <div className="m a"><span className="av"><Sparkles size={13} strokeWidth={2.2} /></span><div className="bub"><span className="think"><i /><i /><i /></span></div></div>}
    </div>
    <div className="composer">
      <div className="chips">{Object.entries(PROMPTS.QUICK).map(([k, [text, label]]) => <button key={k} onClick={() => { if (k === "err" && !useStore.getState().problems.length && !context().includes("Last error")) return actions.notify("Run the code first – there is no error to explain."); ask(text, label); }}>{label}</button>)}</div>
      <div className="glass">
        <textarea ref={ta} rows={1} placeholder={`Ask about your ${LANGUAGES[lang].name} code…`} value={q} onChange={e => { setQ(e.target.value); e.target.style.height = "22px"; e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px"; }} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); const v = q; setQ(""); e.target.style.height = "22px"; ask(v); } }} />
        <div className="row"><span className="hint">Enter to send · Shift+Enter for a new line</span><button className="send" disabled={busy || !q.trim()} onClick={() => { const v = q; setQ(""); ask(v); }} title="Send"><ArrowUp size={16} strokeWidth={2.4} /></button></div>
      </div>
    </div>
    {menu.el}
  </div></aside>;
}
