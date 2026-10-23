importScripts("pil.js");
const decoder = new TextDecoder(), encoder = new TextEncoder();
onmessage = async ({ data }) => {
  const input = encoder.encode(data.stdin || "");
  let pos = 0, delivered = 0, buffer = [], sent = 0, needAt = -1;
  const flush = () => { if (buffer.length) { const s = decoder.decode(new Uint8Array(buffer)); sent += s.length; postMessage({ t: "out", s }); buffer = []; } };
  const put = c => { if (needAt >= 0) return; buffer.push(c); if (c === 10 || buffer.length > 4096) flush(); };
  const readStdin = () => {
    if (pos < input.length) { delivered++; return input[pos++]; }
    if (delivered > 0) { delivered = 0; return null; }
    if (!data.eof && needAt < 0) { flush(); needAt = sent; postMessage({ t: "need", at: needAt }); }
    return null;
  };
  let rc = 0;
  try {
    const pil = await createPIL({ noInitialRun: true, print() {}, printErr() {}, stdout: put, stderr: put, stdin: readStdin });
    pil.FS.writeFile("main.pil", data.code);
    try { rc = pil.callMain(["run", "main.pil"]); }
    catch (e) { if (e?.name === "ExitStatus") rc = e.status; else throw e; }
  } catch (e) { flush(); if (needAt < 0) postMessage({ t: "crash", s: String(e?.message || e) }); rc = 1; }
  flush();
  postMessage({ t: "done", rc });
};
