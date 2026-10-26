const HINTS = [
  [/NoSuchElementException|EOFError/, "The program expected more input than it received."],
  [/ArithmeticException: \/ by zero|ZeroDivisionError|integer divide by zero|DivideByZeroException/, "Division by zero."],
  [/ArrayIndexOutOfBounds|IndexOutOfRangeException|IndexError: list index out of range|StringIndexOutOfBounds/, "Index outside the array bounds – check loop limits (< instead of <=)."],
  [/NullPointerException|NullReferenceException|Cannot read properties of (undefined|null)/, "The value is null – it was never assigned."],
  [/NumberFormatException|ValueError: invalid literal for int|FormatException|InputMismatchException|could not convert string to float/, "The text is not a number – validate the input first."],
  [/StackOverflowError|RecursionError|stack overflow|Maximum call stack/, "Infinite recursion – the base case is missing."],
  [/Segmentation fault|SIGSEGV/i, "Invalid memory access – check array indices and pointers."],
  [/NameError: name '\w+' is not defined|is not defined/, "The name is not defined (or misspelled)."],
  [/cannot find symbol|was not declared in this scope|undeclared|does not exist in the current context/, "Unknown name – check the spelling or declare it before use."],
  [/';' expected|expected ';'|missing ';'|CS1002|Expected a semicolon/, "Missing semicolon (usually at the end of this or the previous line)."],
  [/incompatible types|cannot convert|invalid conversion|TypeError:/, "Type mismatch."],
  [/attempt to (?:call|index|concatenate|perform arithmetic on) a nil value/, "The value is nil – the variable was never assigned or the function does not exist."],
  [/IndentationError|unexpected indent/, "Inconsistent indentation."],
  [/unterminated string|missing terminating|unclosed string/, "Unclosed string literal."],
  [/expected '\)'|expected '}'|reached end of file while parsing|unexpected EOF|'end' expected/, "A closing bracket or block end is missing."],
  [/undefined reference to `main'|no main method|does not contain a static 'Main'/, "The program has no main entry point."],
];
const EXIT_REASONS = { 124: "Time limit exceeded", 134: "Process aborted", 136: "Arithmetic exception (SIGFPE) – division by zero?", 137: "Process killed – memory or process limit reached", 139: "Segmentation fault – invalid memory access", 152: "CPU time limit exceeded – infinite loop?", 153: "File size limit exceeded" };

export const hintFor = message => HINTS.find(([re]) => re.test(message))?.[1] || "";
export const exitReason = code => EXIT_REASONS[code] || "";
export const stripAnsi = s => s.replace(/\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07/g, "");

export function diagnose(language, text, { exitCode = 0, file = "main" } = {}) {
  const items = [];
  const add = (kind, line, column, message) => {
    message = (message || "").trim();
    if (!message || items.some(i => i.line === +line && i.message === message)) return;
    items.push({ kind, line: +line || 0, column: +column || 0, message, hint: hintFor(message) });
  };
  const f = file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let m, re;
  if (language === "java") {
    re = new RegExp(`${f}:(\\d+): (error|warning): (.*)`, "g"); while ((m = re.exec(text))) add(m[2], m[1], 0, m[3]);
    const ex = text.match(/(?:Exception in thread "[^"]*" |Caused by: )((?:[\w.]+\.)?(\w+(?:Exception|Error)))(?::\s*([^\n]*))?/);
    const at = text.match(new RegExp(`at [\\w.$]+\\(${f}:(\\d+)\\)`));
    if (ex) add("runtime", at?.[1] || 0, 0, ex[2] + (ex[3] ? ": " + ex[3] : ""));
  } else if (language === "c" || language === "cpp") {
    re = new RegExp(`${f}:(\\d+):(\\d+): (?:fatal )?(error|warning): (.*)`, "g"); while ((m = re.exec(text))) add(m[3], m[1], m[2], m[4]);
    if (!items.length && /undefined reference/.test(text)) add("error", 0, 0, text.match(/undefined reference to [^\n]*/)[0]);
    m = text.match(/terminate called after throwing an instance of '([^']+)'\s*(?:what\(\):\s*(.*))?/); if (m) add("runtime", 0, 0, m[1] + (m[2] ? ": " + m[2] : ""));
  } else if (language === "csharp") {
    re = new RegExp(`${f}\\((\\d+),(\\d+)\\): (error|warning) (CS\\d+: .*)`, "g"); while ((m = re.exec(text))) add(m[3], m[1], m[2], m[4]);
    m = text.match(/Unhandled Exception:\s*([\w.]+(?:Exception|Error))(?::\s*([^\n]*))?/); if (m) add("runtime", 0, 0, m[1].split(".").pop() + (m[2] ? ": " + m[2] : ""));
  } else if (language === "python") {
    const frames = [...text.matchAll(new RegExp(`File "[^"]*${f}", line (\\d+)`, "g"))];
    const last = text.trim().split("\n").pop() || "";
    if (frames.length && /^\w+(?:Error|Exception|Interrupt|Exit)\b/.test(last)) add(/SyntaxError|IndentationError/.test(last) ? "error" : "runtime", frames.at(-1)[1], 0, last);
  } else if (language === "javascript") {
    const at = text.match(new RegExp(`${f}:(\\d+)(?::(\\d+))?`));
    const error = text.match(/^(\w*Error(?:: [^\n]*)?)$/m);
    if (error) add(/SyntaxError/.test(error[1]) ? "error" : "runtime", at?.[1] || 0, at?.[2] || 0, error[1]);
  } else if (language === "lua") {
    m = text.match(new RegExp(`${f}:(\\d+): ([^\\n]*)`)); if (m) add("runtime", m[1], 0, m[2]);
  } else if (language === "pil") {
    re = new RegExp(`(Error|Warning): (.*?)(?: at ${f}:(\\d+))?\\.$`, "gm"); while ((m = re.exec(text))) add(m[1] === "Error" ? "error" : "warning", m[3], 0, m[2]);
  } else if (language === "bash") {
    re = new RegExp(`${f}: line (\\d+): (.*)`, "g"); while ((m = re.exec(text))) add("runtime", m[1], 0, m[2]);
  }
  if (exitCode !== 0 && exitCode !== 130 && !items.some(i => i.kind !== "warning")) add("runtime", 0, 0, exitReason(exitCode) || `Process exited with code ${exitCode}`);
  return items.sort((a, b) => (a.line || 1e9) - (b.line || 1e9));
}
