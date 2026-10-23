import { esc, store, icon, toast, copyText } from "./util.js";
import { openMenu } from "./ui.js";

const ACTIONS = {
  explain: ["Explain", "Explain what this code does, step by step (input → processing → output). Name one thing a beginner would not notice."],
  review: ["Review", "Review this code as a teacher: logic bugs, edge cases (empty input, 0, negative numbers), style. Order by importance, at most 5 points. If the code is good, say so."],
  error: ["Explain error", "Explain the last terminal output or error: what happened → why (quote the line) → how to fix → how to spot it next time. One sentence each."],
  practice: ["Practice", "Invent one small practical exercise (5–15 lines) that trains the same topic as this code but with a different story. Give the task, an input/output example and one hint – no solution."],
  fix: ["Fix", "Fix the problems in this code, keeping my names and style. Return the WHOLE file in one code block, then 1–3 sentences on what changed and why."],
};
const SYSTEM = `# Role
You are an experienced programming teacher for second-year students at Valmiera Technical School (group 28). They are beginners; your goal is that the student understands AND the code works.
# Context
After every question you get the current file (with its name), the task description if there is one, the recent terminal output and the language. Work from that code – do not ask for it again.
# How to answer
1. Answer in English unless the student writes in Latvian – then answer in Latvian. Keep technical terms as they are.
2. Be brief. Answer/fix first, explanation second. No preambles.
3. Explain errors as: what happened → why (line number) → how to fix → how to spot it next time.
4. When fixing or completing code, return the WHOLE file in one code block with the correct language tag, then 1–3 sentences on what changed.
5. No tables; at most 5 bullet points. Never invent program output.`;

function parseMarkdown(text, streaming) {
  const blocks = [], re = /```([a-zA-Z#+]*)[^\n]*\n?([\s\S]*?)(```|$)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) blocks.push({ type: "text", text: text.slice(last, m.index) });
    blocks.push({ type: "code", language: m[1], code: m[2].replace(/\n$/, "") });
    last = re.lastIndex;
    if (m[3] !== "```") break;
  }
  if (last < text.length) blocks.push({ type: "text", text: text.slice(last) });
  const tail = blocks.at(-1);
  if (streaming && tail?.type === "text") {
    if ((tail.text.split("**").length - 1) % 2) tail.text = tail.text.slice(0, tail.text.lastIndexOf("**"));
    if ((tail.text.split("`").length - 1) % 2) tail.text = tail.text.slice(0, tail.text.lastIndexOf("`"));
  }
  return blocks;
}
const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>");
const textHtml = s => s.replace(/^\n+|\n+$/g, "").split(/\n{2,}/).map(p => {
  const lines = p.split("\n");
  if (lines.every(l => /^\s*([-*•]|\d+[.)])\s+/.test(l))) return `<ul>${lines.map(l => `<li>${inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ""))}</li>`).join("")}</ul>`;
  if (/^#{1,4}\s/.test(p) && lines.length === 1) return `<p><b>${inline(p.replace(/^#+\s/, ""))}</b></p>`;
  return `<p>${inline(p)}</p>`;
}).join("");
const bodyHtml = (text, streaming) => parseMarkdown(text, streaming).map(b => b.type === "text" ? textHtml(b.text)
  : `<div class="codeblock"><div class="codeblock-h"><span>${esc(b.language || "code")}</span><button class="ibtn sm" data-copy title="Copy" aria-label="Copy code">${icon.copy}</button><button class="ibtn sm" data-apply title="Replace the editor contents" aria-label="Apply to editor">${icon.apply}</button></div><pre>${esc(b.code)}</pre></div>`).join("");

export function createAssistant({ root, accessHeaders, models, getContext, applyCode }) {
  root.innerHTML = `
    <div class="assistant-h"><button class="btn ghost sm" data-model aria-haspopup="menu"></button></div>
    <div class="chat" aria-live="polite"><div class="empty-state small"><p>Ask about the open file, the terminal output or the last error.</p></div></div>
    <div class="composer">
      <div class="chips">${Object.entries(ACTIONS).map(([k, [label]]) => `<button class="chip" data-action="${k}">${label}</button>`).join("")}</div>
      <textarea rows="2" placeholder="Ask about your code…" aria-label="Message the assistant"></textarea>
      <div class="composer-f"><span class="muted small">Enter to send, Shift+Enter for a new line</span><button class="btn sm" data-send>Send</button></div>
    </div>`;
  const chat = root.querySelector(".chat"), input = root.querySelector("textarea"), sendButton = root.querySelector("[data-send]"), modelButton = root.querySelector("[data-model]");
  const history = [];
  let model = store.get("model", ""), busy = null;
  if (!models.some(m => m.id === model)) model = models[0]?.id || "";
  const labelOf = id => models.find(m => m.id === id)?.label || id;
  const renderModel = () => { modelButton.innerHTML = `${icon.sparkle}<span>${esc(model ? labelOf(model) : "No model configured")}</span>${icon.chevron}`; };
  renderModel();
  modelButton.onclick = () => openMenu(modelButton, models.length ? models.map(m => ({ label: m.label, on: m.id === model, run: () => { model = m.id; store.set("model", model); renderModel(); } })) : [{ label: "No AI provider key is set on the server", disabled: true }], { align: "left" });

  chat.addEventListener("click", async e => {
    const block = e.target.closest(".codeblock"); if (!block) return;
    const code = block.querySelector("pre").textContent;
    if (e.target.closest("[data-copy]") && await copyText(code)) toast("Code copied");
    if (e.target.closest("[data-apply]")) applyCode(code);
  });
  root.querySelector(".chips").addEventListener("click", e => { const b = e.target.closest("[data-action]"); if (b) ask(ACTIONS[b.dataset.action][1], ACTIONS[b.dataset.action][0]); });
  input.addEventListener("input", () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 160) + "px"; });
  input.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
  sendButton.onclick = () => busy ? busy.abort() : send();
  function send() { const text = input.value.trim(); if (!text) return; input.value = ""; input.style.height = "auto"; ask(text, text); }

  async function ask(prompt, shown) {
    if (busy) return;
    if (!model) return toast("No AI model is available – set an API key on the server.", "error");
    chat.querySelector(".empty-state")?.remove();
    const user = document.createElement("div"); user.className = "msg user"; user.textContent = shown; chat.appendChild(user);
    const answer = document.createElement("div"); answer.className = "msg ai";
    answer.innerHTML = `<div class="msg-who">${esc(labelOf(model))}</div><details class="thinking" hidden><summary>Reasoning</summary><pre></pre></details><div class="msg-body"><span class="typing"><i></i><i></i><i></i></span></div><div class="msg-meta"></div>`;
    chat.appendChild(answer); chat.scrollTop = chat.scrollHeight;
    const body = answer.querySelector(".msg-body"), thinking = answer.querySelector(".thinking"), meta = answer.querySelector(".msg-meta");
    busy = new AbortController(); sendButton.textContent = "Stop";
    for (const b of root.querySelectorAll("[data-action]")) b.disabled = true;
    const startedAt = performance.now();
    let content = "", reasoning = "", usage = null, frame = 0, error = "";
    const paint = () => { frame = 0; if (reasoning) { thinking.hidden = false; thinking.querySelector("pre").textContent = reasoning; } if (content) body.innerHTML = bodyHtml(content, true); chat.scrollTop = chat.scrollHeight; };
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: accessHeaders(), signal: busy.signal, body: JSON.stringify({ model, messages: [{ role: "system", content: SYSTEM }, ...history.slice(-6), { role: "user", content: prompt + "\n\n" + getContext() }] }) });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || `HTTP ${response.status}`);
      const reader = response.body.getReader(), decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n"); buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          let chunk; try { chunk = JSON.parse(line.slice(5)); } catch { continue; }
          if (chunk.error) { error = chunk.error; continue; }
          if (chunk.done) { usage = chunk.usage; continue; }
          content += chunk.delta || ""; reasoning += chunk.reasoning || "";
          if (!frame) frame = requestAnimationFrame(paint);
        }
      }
    } catch (e) { if (e.name !== "AbortError") error = e.message; }
    cancelAnimationFrame(frame);
    if (reasoning) { thinking.hidden = false; thinking.querySelector("pre").textContent = reasoning; }
    body.innerHTML = bodyHtml(content, false) || (error ? "" : "<p class=\"muted\">No answer.</p>");
    const seconds = Math.max(0.05, (performance.now() - startedAt) / 1000), tokens = usage?.output || Math.round((content.length + reasoning.length) / 4);
    meta.textContent = error || `${seconds.toFixed(1)} s, ${usage?.output ? "" : "about "}${Math.round(tokens / seconds)} tokens per second`;
    meta.classList.toggle("error", !!error);
    if (content) history.push({ role: "user", content: shown }, { role: "assistant", content });
    busy = null; sendButton.textContent = "Send";
    for (const b of root.querySelectorAll("[data-action]")) b.disabled = false;
    chat.scrollTop = chat.scrollHeight;
  }

  return { ask: key => ask(ACTIONS[key][1], ACTIONS[key][0]), focus: () => input.focus() };
}
