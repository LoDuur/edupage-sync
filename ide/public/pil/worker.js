importScripts("pil.js");
const decoder = new TextDecoder(), encoder = new TextEncoder();
onmessage = async ({ data }) => {
  const input = encoder.encode(data.stdin || "");
  let pos = 0, delivered = 0, buffer = [], needs = false;
  const flush = () => { if (buffer.length) { postMessage({ type: "out", text: decoder.decode(new Uint8Array(buffer)) }); buffer = []; } };
  const put = c => { if (needs) return; buffer.push(c); if (c === 10 || buffer.length > 4096) flush(); };
  const readStdin = () => {
    if (pos < input.length) { delivered++; return input[pos++]; }
    if (delivered > 0) { delivered = 0; return null; }
    if (!data.eof && !needs) { flush(); needs = true; postMessage({ type: "need" }); }
    return null;
  };
  let exitCode = 0;
  try {
    const pil = await createPIL({ noInitialRun: true, print() {}, printErr() {}, stdout: put, stderr: put, stdin: readStdin });
    pil.FS.writeFile("main.pil", data.code);
    try { exitCode = pil.callMain(["run", "main.pil"]); }
    catch (e) { if (e?.name === "ExitStatus") exitCode = e.status; else throw e; }
  } catch (e) { flush(); if (!needs) postMessage({ type: "crash", error: String(e?.message || e) }); return; }
  flush();
  postMessage({ type: "done", exitCode, needs });
};
