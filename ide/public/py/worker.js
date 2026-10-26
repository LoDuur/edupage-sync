const PYODIDE = new URL(location.href).searchParams.get("pyodide");
const OUTPUT_LIMIT = 2 * 1024 * 1024;
const { loadPyodide } = await import(PYODIDE + "pyodide.mjs");
const decoder = new TextDecoder();
const ready = loadPyodide({ indexURL: PYODIDE }).then(py => { postMessage({ type: "ready" }); return py; }, e => { postMessage({ type: "failed", error: String(e?.message || e) }); throw e; });

function cleanTraceback(message) {
  const lines = message.trimEnd().split("\n"), kept = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\s+File "\/lib\/python[^"]*_pyodide/.test(lines[i])) { while (lines[i + 1] && /^\s{4}/.test(lines[i + 1]) && !/^\s+File /.test(lines[i + 1])) i++; continue; }
    kept.push(lines[i]);
  }
  return kept.join("\n") + "\n";
}

function exitCodeOf(error) {
  if (error.type !== "SystemExit") return 1;
  const value = error.message.trimEnd().split("\n").pop().replace(/^SystemExit:?\s*/, "");
  return value === "" || value === "None" ? 0 : /^-?\d+$/.test(value) ? +value : 1;
}

onmessage = async ({ data }) => {
  const py = await ready;
  const lines = data.stdin.split("\n");
  let index = 0, pending = "", written = 0, needs = false;
  const flush = () => { if (pending) { postMessage({ type: "out", text: pending }); pending = ""; } };
  const write = buffer => {
    if (needs) return buffer.length;
    written += buffer.length;
    if (written > OUTPUT_LIMIT) throw new Error("output limit");
    pending += decoder.decode(buffer, { stream: true });
    flush();
    return buffer.length;
  };
  py.setStdout({ write });
  py.setStderr({ write });
  py.setStdin({
    isatty: false,
    stdin: () => {
      if (index < lines.length - 1) return lines[index++] + "\n";
      if (!data.eof) { flush(); needs = true; }
      return undefined;
    },
  });
  const globals = py.globals.get("dict")();
  globals.set("__name__", "__main__");
  let exitCode = 0;
  try { py.runPython(data.code, { globals, filename: data.file }); }
  catch (error) {
    exitCode = exitCodeOf(error);
    if (!needs && error.type !== "SystemExit") pending += written > OUTPUT_LIMIT ? "\nOutput limit (2 MB) reached – the program was stopped.\n" : cleanTraceback(error.message);
    if (written > OUTPUT_LIMIT) exitCode = 153;
  } finally { globals.destroy(); }
  flush();
  postMessage({ type: "done", exitCode, needs });
};
