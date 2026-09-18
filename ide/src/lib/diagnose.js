// Turns compiler / runtime text into structured problems { kind, line, col, msg, hint }.
const HINTS = [
  [/NoSuchElementException/, "The program expected more input than it received."],
  [/ArithmeticException: \/ by zero|ZeroDivisionError|integer divide by zero|DivideByZeroException/, "Division by zero."],
  [/ArrayIndexOutOfBounds|IndexOutOfRangeException|IndexError: list index out of range|StringIndexOutOfBounds/, "Index outside the array bounds – check loop limits (< instead of <=)."],
  [/NullPointerException|NullReferenceException/, "The variable is null – it was never assigned a value."],
  [/NumberFormatException|ValueError: invalid literal for int|FormatException|InputMismatchException|could not convert string to float/, "The text is not a number – validate the input first."],
  [/StackOverflowError|RecursionError|stack overflow/, "Infinite recursion – the base case is missing."],
  [/Segmentation fault|SIGSEGV/i, "Invalid memory access – check array indices and pointers."],
  [/NameError: name '\w+' is not defined/, "The name is not defined (or misspelled)."],
  [/cannot find symbol|was not declared in this scope|undeclared|does not exist in the current context/, "Unknown name – check the spelling or declare it before use."],
  [/';' expected|expected ';'|missing ';'|CS1002/, "Missing semicolon (usually on the previous line)."],
  [/incompatible types|cannot convert|invalid conversion|TypeError:/, "Type mismatch."],
  [/attempt to (?:call|index|concatenate|perform arithmetic on) a nil value/, "The value is nil – the variable was never assigned or the function does not exist."],
  [/IndentationError|unexpected indent/, "Inconsistent indentation."],
  [/unterminated string|missing terminating|unclosed string/, "Unclosed string literal."],
  [/expected '\)'|expected '}'|reached end of file while parsing|unexpected EOF|expected 'end'|'end' expected/, "A closing bracket or block end is missing."],
  [/undefined reference to `main'|no main method|does not contain a static 'Main'/, "The program has no main entry point."],
];
export const hintFor = msg => { for (const [re, h] of HINTS) if (re.test(msg)) return h; return ""; };
const EXIT = { 137: "Process killed – time or memory limit exceeded (infinite loop?)", 139: "Segmentation fault – invalid memory access", 134: "Process aborted", 136: "Arithmetic exception (SIGFPE) – division by zero?", 124: "Time limit exceeded" };
const STALE = { printn: "println", printfn: "printfln", readline: "readln", readchar: "readch", global: "const (file level)" };

// `text` is the combined compiler + program transcript (ANSI already stripped). `file` is the source file name the tool used.
export function diagnose(lang, text, { rc = 0, signal = "", file = "prog", cls = "Main" } = {}) {
  const items = []; let m, re;
  const add = (kind, line, col, msg) => { msg = (msg || "").trim(); if (!msg) return; line = +line || 0; if (items.some(i => i.line === line && i.msg === msg)) return; items.push({ kind, line, col: +col || 0, msg, hint: msg.includes("–") ? "" : hintFor(msg) }); };
  const f = file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (lang === "java") {
    re = new RegExp(`(?:\\./)?(?:${f}|${cls}\\.java):(\\d+): (error|warning): (.*)`, "g"); while ((m = re.exec(text))) add(m[2], m[1], 0, m[3]);
    const ex = text.match(/(?:Exception in thread "[^"]*" |Caused by: )((?:[\w.]+\.)?(\w+(?:Exception|Error)))(?:: ([^\n]*))?/); const at = text.match(new RegExp(`at (?:\\w+\\.)*\\w+\\((?:${f}|${cls}\\.java):(\\d+)\\)`)); if (ex) add("runtime", at ? at[1] : 0, 0, ex[2] + (ex[3] ? ": " + ex[3] : ""));
  } else if (lang === "c" || lang === "cpp") {
    re = new RegExp(`(?:${f}|prog\\.cc?):(\\d+):(\\d+): (?:fatal )?(error|warning): (.*)`, "g"); while ((m = re.exec(text))) add(m[3], m[1], m[2], m[4]);
    if (!items.length && /undefined reference/.test(text)) add("error", 0, 0, (text.match(/undefined reference to [^\n]*/) || ["Linker error"])[0]);
    m = text.match(/terminate called after throwing an instance of '([^']+)'\s*\n?\s*(?:what\(\):\s*(.*))?/); if (m) add("runtime", 0, 0, m[1] + (m[2] ? ": " + m[2] : ""));
  } else if (lang === "csharp") {
    re = new RegExp(`(?:${f}|prog\\.cs)\\((\\d+),(\\d+)\\): (error|warning) (CS\\d+: .*)`, "g"); while ((m = re.exec(text))) add(m[3], m[1], m[2], m[4]);
    m = text.match(/Unhandled Exception:\s*\n?\s*([\w.]+(?:Exception|Error))(?:: ([^\n]*))?/); if (m) add("runtime", 0, 0, m[1].split(".").pop() + (m[2] ? ": " + m[2] : ""));
  } else if (lang === "python") {
    const frames = [...text.matchAll(new RegExp(`File "[^"]*(?:${f}|prog\\.py)", line (\\d+)`, "g"))]; const last = text.trim().split("\n").pop();
    if (frames.length && /^\w+(?:Error|Exception|Interrupt|Exit)\b/.test(last)) add(/SyntaxError|IndentationError/.test(last) ? "error" : "runtime", frames[frames.length - 1][1], 0, last);
  } else if (lang === "lua") {
    m = text.match(new RegExp(`(?:${f}|prog\\.lua):(\\d+): ([^\\n]*)`)); if (m) add("runtime", m[1], 0, m[2].replace(/\s*\(.*\)$/, "")); else if (/^lua:/m.test(text)) add("runtime", 0, 0, text.match(/^lua: (.*)$/m)[1]);
  } else if (lang === "pil") {
    re = new RegExp(`(Error|Warning): (.*?)(?: at (?:${f}|prog\\.pil):(\\d+))?\\.$`, "gm"); while ((m = re.exec(text))) add(m[1] === "Error" ? "error" : "warning", m[3], 0, m[2]);
    for (const it of items) { const s = it.msg.match(/No such function '([\w-]+)'/); if (s && STALE[s[1]]) it.hint = `In this PIL version it is called "${STALE[s[1]]}".`; }
  }
  if (signal) add("runtime", 0, 0, `Process terminated: ${signal}`);
  else if (rc !== 0 && !items.some(i => i.kind !== "warning")) add("runtime", 0, 0, EXIT[rc] || `Process exited with code ${rc}`);
  return items.sort((a, b) => (a.line || 1e9) - (b.line || 1e9));
}
export const stripAnsi = s => s.replace(/\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07/g, "");
