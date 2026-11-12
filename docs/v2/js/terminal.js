import { esc, isJuarch } from "./store.js";
import { buildCommands } from "./commands.js";

const HISTORY_KEY = "con-history";
const HISTORY_LIMIT = 50;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function tokenize(text) {
  const out = [];
  const re = /"([^"]*)"?|'([^']*)'?|(\S+)/g;
  let match;
  while ((match = re.exec(text))) out.push(match[1] ?? match[2] ?? match[3]);
  return out;
}

function readHistory() {
  try {
    const list = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(list) ? list.filter(x => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function createTerminal({ panel, output, form, input, prompt, hint, openers }, ctx) {
  const state = { root: false, vim: false, secret: null, confirm: null, busy: null, cancel: false, game: null };
  let history = readHistory();
  let historyIndex = -1;

  const scroll = () => { output.scrollTop = output.scrollHeight; };
  const print = (html, tone = "") => {
    const line = document.createElement("div");
    if (tone) line.className = tone;
    line.innerHTML = html;
    output.appendChild(line);
    scroll();
    return line;
  };
  const pre = lines => {
    const block = document.createElement("pre");
    block.innerHTML = lines.join("\n");
    output.appendChild(block);
    scroll();
    return block;
  };

  function setPrompt() {
    const juarch = isJuarch();
    prompt.textContent = state.root ? (juarch ? "⚡#" : "#") : juarch ? "»" : "❯";
    prompt.dataset.mode = state.root ? "root" : juarch ? "juarch" : "";
  }

  function saveHistory() {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch {}
  }

  function closeGame() {
    if (!state.game) return;
    state.game.remove();
    state.game = null;
    panel.classList.remove("is-gaming");
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  function stopBusy() {
    if (state.busy === "seq") state.cancel = true;
    else if (state.busy) { clearInterval(state.busy); state.busy = null; print('<span class="dim">^C</span>'); }
  }

  const io = {
    state, print, pre, sleep,
    focus: () => input.focus(),
    width: () => output.clientWidth,
    history: () => history,
    clearHistory() { history = []; try { localStorage.removeItem(HISTORY_KEY); } catch {} },
    setPrompt,
    clear() { closeGame(); output.innerHTML = ""; },
    toggle: open => toggle(open),
    askSecret(label, onSecret) {
      state.secret = onSecret;
      input.type = "password";
      input.placeholder = "";
      prompt.textContent = label;
      input.focus();
    },
    askConfirm(question, onYes) {
      state.confirm = onYes;
      print(`${question} <span class="dim">[j/N]</span>`);
      input.placeholder = "j/N";
      prompt.textContent = "?";
    },
    runAsRoot(args) {
      state.root = true;
      setPrompt();
      if (args[0] === "-i" || args[0] === "su") return print(`root@${esc(location.hostname || "localhost")}:~# `);
      print(`<span class="cmd">${isJuarch() ? "⚡#" : "#"}</span> ${esc(args.join(" "))}`);
      execute(args);
    },
    async steps(list) {
      state.busy = "seq";
      state.cancel = false;
      try {
        for (const step of list) {
          if (state.cancel) { print('<span class="dim">^C</span>'); return false; }
          if (typeof step === "number") { await sleep(step); continue; }
          if (typeof step === "function") { await step(); continue; }
          if (step.bar !== undefined) {
            const bar = pre([""]);
            for (let i = 0; i <= 20; i++) { if (state.cancel) break; bar.innerHTML = ` ${step.bar.padEnd(22)} ${"█".repeat(i)}${"░".repeat(20 - i)} ${String(i * 5).padStart(3)}%`; await sleep(step.ms || 35); }
            continue;
          }
          print(step);
          await sleep(step.startsWith(":: ") ? 260 : 120);
        }
        return !state.cancel;
      } finally {
        state.busy = null;
      }
    },
    animate(frames, interval) {
      const block = pre([""]);
      let i = 0;
      state.busy = setInterval(() => {
        if (i >= frames.length) { clearInterval(state.busy); state.busy = null; return; }
        block.innerHTML = frames[i++];
        scroll();
      }, interval);
    },
    openGame(title, frame) {
      closeGame();
      const box = document.createElement("div");
      box.className = "game-box";
      box.innerHTML = `<div class="game-bar"><b>${esc(title)}</b><span class="dim">bultiņas · ctrl šauj · atstarpe atver · esc izvēlne</span><span class="game-space"></span><button type="button" data-game="fs">Pilnekrāns</button><button type="button" data-game="close">Aizvērt · Ctrl+Q</button></div>`;
      box.appendChild(frame);
      box.querySelector('[data-game="close"]').onclick = closeGame;
      box.querySelector('[data-game="fs"]').onclick = () => { if (document.fullscreenElement) document.exitFullscreen(); else frame.requestFullscreen?.(); };
      output.appendChild(box);
      panel.classList.add("is-gaming");
      state.game = box;
      scroll();
      setTimeout(() => { try { frame.contentWindow.focus(); } catch {} }, 600);
    },
  };

  const { commands, aliases, pool } = buildCommands(io, ctx);

  function execute(tokens) {
    let [name, ...args] = tokens;
    if (aliases[name]) { const expanded = tokenize(aliases[name]); name = expanded[0]; args = [...expanded.slice(1), ...args]; }
    if (!commands[name]) {
      const matches = Object.keys(commands).filter(k => k.startsWith(name) && !commands[k].hide?.());
      if (matches.length !== 1) return print(`${esc(name)}: komanda nav atrasta${matches.length > 1 ? ` · varbūt: ${matches.join(", ")}` : ""} · ievadi <b>help</b>`, "err");
      name = matches[0];
    }
    try {
      const result = commands[name].f(args);
      if (result?.catch) result.catch(error => print(esc(String(error)), "err"));
    } catch (error) {
      print(esc(String(error)), "err");
    }
  }

  function run(line) {
    print(`<span class="cmd">${esc(prompt.textContent)}</span> ${esc(line)}`);
    if (state.vim) {
      if (/^:(q|q!|wq|x)$/.test(line.trim())) { state.vim = false; print('<span class="dim">iziets no vim. Apsveicam, tas izdodas ne visiem.</span>'); }
      else print('<span class="dim">-- tikai lasāms -- (iziet: :q)</span>');
      return;
    }
    const tokens = tokenize(line);
    if (tokens.length) execute(tokens);
  }

  function complete() {
    const value = input.value;
    const tokens = tokenize(value);
    const endsWithSpace = /\s$/.test(value);
    const argIndex = endsWithSpace ? tokens.length : Math.max(0, tokens.length - 1);
    const partial = endsWithSpace ? "" : tokens[tokens.length - 1] || "";
    const cmd = aliases[tokens[0]] ? tokenize(aliases[tokens[0]])[0] : tokens[0];
    const options = pool(cmd, argIndex).filter(option => option.toLowerCase().startsWith(partial.toLowerCase()));
    if (!options.length) return;
    if (options.length === 1) {
      const head = endsWithSpace ? value : value.slice(0, value.length - partial.length);
      input.value = `${head}${options[0]} `;
      return;
    }
    let common = options[0];
    for (const option of options) while (!option.toLowerCase().startsWith(common.toLowerCase())) common = common.slice(0, -1);
    if (common.length > partial.length) input.value = value.slice(0, value.length - partial.length) + common;
    else print(`<span class="dim">${options.slice(0, 40).map(esc).join("  ")}</span>`);
  }

  function toggle(open = panel.hidden) {
    panel.hidden = !open;
    if (open) {
      if (!output.childElementCount) print('Stundu saraksta konsole · ievadi <b>help</b> · Tab pabeidz · ↑↓ vēsture · Ctrl+C aptur · Esc aizver');
      setPrompt();
      input.focus();
    } else if (state.game) {
      closeGame();
    }
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    const value = input.value;
    input.value = "";
    if (state.secret) {
      const onSecret = state.secret;
      state.secret = null;
      input.type = "text";
      input.placeholder = "help";
      setPrompt();
      onSecret(value);
      return;
    }
    if (state.confirm) {
      const onYes = state.confirm;
      state.confirm = null;
      input.placeholder = "help";
      setPrompt();
      print(`<span class="cmd">?</span> ${esc(value)}`);
      if (["j", "jā", "y", "yes"].includes(value.trim().toLowerCase())) onYes();
      else print("pārtraukts");
      return;
    }
    const line = value.trim();
    if (!line) return;
    history = [line, ...history.filter(h => h !== line)].slice(0, HISTORY_LIMIT);
    saveHistory();
    historyIndex = -1;
    run(line);
  });

  input.addEventListener("keydown", event => {
    if (event.key === "Escape") return toggle(false);
    if (event.key === "Tab") { event.preventDefault(); complete(); return; }
    if (event.key.toLowerCase() === "c" && event.ctrlKey) { event.preventDefault(); if (state.busy) stopBusy(); else { print(`<span class="cmd">${esc(prompt.textContent)}</span> ${esc(input.value)}^C`); input.value = ""; } return; }
    if (event.key.toLowerCase() === "l" && event.ctrlKey) { event.preventDefault(); io.clear(); return; }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    if (state.secret) return;
    event.preventDefault();
    historyIndex = Math.max(-1, Math.min(history.length - 1, historyIndex + (event.key === "ArrowUp" ? 1 : -1)));
    input.value = history[historyIndex] || "";
  });

  addEventListener("message", event => { if (event.data === "game-close") closeGame(); });
  for (const opener of openers) opener.addEventListener("click", () => toggle());
  document.addEventListener("keydown", event => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "") || document.activeElement?.isContentEditable;
    if ((event.key === "k" && (event.metaKey || event.ctrlKey)) || (event.key === "`" && !typing)) {
      event.preventDefault();
      toggle();
    }
  });
  if (hint) hint.textContent = "Tab · ↑↓ · Esc";

  return { toggle };
}
