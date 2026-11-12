import { esc, fold, setVersion } from "./store.js";

export function createTerminal({ panel, output, form, input, openers }, { tabs, classes, selectClass, openTab }) {
  const history = [];
  let historyIndex = -1;

  const print = (html, tone = "") => {
    const line = document.createElement("div");
    if (tone) line.className = tone;
    line.innerHTML = html;
    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
  };

  const commands = {
    help: { usage: "", text: "komandu saraksts", run() { for (const [name, c] of Object.entries(commands)) print(`<b>${name}</b>${c.usage ? ` ${esc(c.usage)}` : ""} <span class="cmd">— ${esc(c.text)}</span>`); } },
    versions: {
      usage: "[1|2]",
      text: "stundu saraksta versija (1 – pašreizējā, 2 – jaunā)",
      run([choice]) {
        if (!choice) { print("  <b>1</b> Legacy – pašreizējais saraksts"); print("● <b>2</b> New – šī versija"); return; }
        if (choice === "2") return print("jau izmanto 2. versiju", "ok");
        if (choice !== "1") return print("lietojums: versions 1|2", "err");
        setVersion(1);
        print("pārslēdz uz 1. versiju…", "ok");
        location.href = "../";
      },
    },
    class: {
      usage: "<nosaukums>",
      text: "izvēlas klasi (piem. class 28)",
      run(args) {
        const needle = fold(args.join(" "));
        if (!needle) return print("lietojums: class &lt;nosaukums&gt;", "err");
        const matches = classes().filter(c => fold(c.name).includes(needle));
        const exact = matches.find(c => fold(c.name) === needle || fold(c.short) === needle);
        const target = exact || (matches.length === 1 ? matches[0] : null);
        if (!target) return print(matches.length ? `neviennozīmīgi: ${matches.map(c => esc(c.name)).join(" | ")}` : "klase nav atrasta", "err");
        selectClass(target.id);
        print(`klase: ${esc(target.name)}`, "ok");
      },
    },
    open: {
      usage: `<${Object.keys(tabs).join("|")}>`,
      text: "atver sadaļu",
      run([name]) {
        const key = Object.keys(tabs).find(k => k.startsWith(fold(name || "")));
        if (!name || !key) return print(`lietojums: open ${Object.keys(tabs).join("|")}`, "err");
        openTab(key);
        print(`atvērts: ${esc(tabs[key])}`, "ok");
      },
    },
    clear: { usage: "", text: "notīra termināli", run() { output.innerHTML = ""; } },
    exit: { usage: "", text: "aizver termināli", run() { toggle(false); } },
  };

  function run(line) {
    print(`<span class="cmd">❯ ${esc(line)}</span>`);
    const [name, ...args] = line.trim().split(/\s+/);
    const command = commands[name] || commands[Object.keys(commands).find(k => k.startsWith(name)) || ""];
    if (!command) return print(`${esc(name)}: komanda nav atrasta · ievadi <b>help</b>`, "err");
    command.run(args);
  }

  function toggle(open = panel.hidden) {
    panel.hidden = !open;
    if (open) {
      if (!output.childElementCount) print('Ievadi <b>help</b>. Piem.: <b>versions 1</b>, <b>class 28</b>, <b>open autobusi</b>');
      input.focus();
    }
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    const line = input.value.trim();
    input.value = "";
    if (!line) return;
    history.unshift(line);
    historyIndex = -1;
    run(line);
  });
  input.addEventListener("keydown", event => {
    if (event.key === "Escape") return toggle(false);
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    historyIndex = Math.max(-1, Math.min(history.length - 1, historyIndex + (event.key === "ArrowUp" ? 1 : -1)));
    input.value = history[historyIndex] || "";
  });
  for (const opener of openers) opener.addEventListener("click", () => toggle());
  document.addEventListener("keydown", event => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "");
    if ((event.key === "k" && (event.metaKey || event.ctrlKey)) || (event.key === "`" && !typing)) {
      event.preventDefault();
      toggle();
    }
  });

  return { toggle };
}
