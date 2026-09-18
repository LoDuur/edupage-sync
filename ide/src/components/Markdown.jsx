import React, { useMemo, useState } from "react";
import { Copy, Check, FileInput, ChevronRight } from "lucide-react";
import AIDiff from "@/components/ui/ai-diff";
import { diffLines, hasChanges } from "../lib/diff.js";

// Splits assistant text into paragraphs / lists / code fences. While streaming, an unclosed inline marker is held back instead of rendered broken.
function parse(text, streaming) {
  const blocks = []; const re = /```([a-zA-Z#+]*)[^\n]*\n?([\s\S]*?)(```|$)/g; let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) blocks.push({ t: "text", s: text.slice(last, m.index) });
    blocks.push({ t: "code", lang: m[1] || "", code: m[2].replace(/\n$/, ""), open: m[3] !== "```" });
    last = re.lastIndex; if (m[3] !== "```") break;
  }
  if (last < text.length) blocks.push({ t: "text", s: text.slice(last) });
  if (streaming) { const b = blocks[blocks.length - 1]; if (b && b.t === "text") b.s = holdBack(b.s); }
  return blocks;
}
function holdBack(s) {
  const bold = s.split("**").length - 1, tick = s.split("`").length - 1;
  if (bold % 2) s = s.slice(0, s.lastIndexOf("**"));
  if (tick % 2) s = s.slice(0, s.lastIndexOf("`"));
  return s;
}
function inline(s) {
  const out = []; const re = /(\*\*(.+?)\*\*|`([^`]+)`)/g; let last = 0, m, k = 0;
  while ((m = re.exec(s))) { if (m.index > last) out.push(s.slice(last, m.index)); out.push(m[2] !== undefined ? <b key={k++}>{m[2]}</b> : <code key={k++}>{m[3]}</code>); last = re.lastIndex; }
  if (last < s.length) out.push(s.slice(last));
  return out;
}
function Text({ s }) {
  const paras = s.replace(/^\n+|\n+$/g, "").split(/\n{2,}/); const out = [];
  paras.forEach((p, i) => {
    const lines = p.split("\n");
    if (lines.every(l => /^\s*([-*•]|\d+[.)])\s+/.test(l))) return out.push(<ul key={i} className="mdul">{lines.map((l, j) => <li key={j} className="mdli">{inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ""))}</li>)}</ul>);
    if (/^#{1,4}\s/.test(p) && lines.length === 1) return out.push(<div key={i} className="mdh">{inline(p.replace(/^#+\s/, ""))}</div>);
    out.push(<p key={i} className="mdp">{inline(p)}</p>);
  });
  return out;
}
function CodeBlock({ lang, code, onInsert }) {
  const [copied, setCopied] = useState(false);
  return <div className="codeblk">
    <div className="hd"><span>{lang || "code"}</span><span className="sp" />
      {onInsert && <button className="ibtn sm" title="Insert at cursor" aria-label="Insert code at cursor" onClick={() => onInsert(code)}><FileInput size={14} /></button>}
      <button className="ibtn sm" title="Copy code" aria-label="Copy code" onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check size={14} /> : <Copy size={14} />}</button>
    </div>
    <pre>{code}</pre>
  </div>;
}
export function Thinking({ text }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return <div className={"thinking" + (open ? " open" : "")}>
    <button onClick={() => setOpen(o => !o)} aria-expanded={open}><ChevronRight size={14} />Thinking</button>
    {open && <pre>{text}</pre>}
  </div>;
}
// isEdit(code, lang) → true when the block is a whole-file rewrite; current() → the editor's text; onApply(code) writes it.
export default function Markdown({ text, streaming, lang, isEdit, current, onApply, onInsert, file }) {
  const blocks = useMemo(() => {
    const bs = parse(text || "", streaming);
    if (!streaming) for (const b of bs) if (b.t === "code" && !b.open && isEdit?.(b.code, b.lang)) { const lines = diffLines(current(), b.code); if (hasChanges(lines)) b.diff = lines; }
    return bs;
  }, [text, streaming]);
  return blocks.map((b, i) => {
    if (b.t === "text") return <Text key={i} s={b.s} />;
    if (b.diff) return <div key={i} className="aidiff"><AIDiff lines={b.diff} title={file} onAccept={() => onApply(b.code)} onReject={() => {}} /></div>;
    return <CodeBlock key={i} lang={b.lang || lang} code={b.code} onInsert={onInsert} />;
  });
}
