importScripts("pil.js?v=" + (new URL(self.location.href).searchParams.get("v") || ""));
const dec = new TextDecoder(), enc = new TextEncoder();
onmessage = async e => {
  const { code, stdin, eof } = e.data;
  const input = enc.encode(stdin || "");
  let pos = 0, delivered = 0, buf = [], sent = 0, needAt = -1;
  const flush = () => { if (buf.length) { const s = dec.decode(new Uint8Array(buf)); sent += s.length; postMessage({ t: "out", s }); buf = []; } };
  const put = c => { if (needAt >= 0) return; buf.push(c); if (c === 10 || buf.length > 4096) flush(); };
  const readStdin = () => {
    if (pos < input.length) { delivered++; return input[pos++]; }
    if (delivered > 0) { delivered = 0; return null; }
    if (!eof && needAt < 0) { flush(); needAt = sent; postMessage({ t: "need", at: needAt }); }
    return null;
  };
  let rc = 0;
  try {
    const m = await createPIL({ noInitialRun: true, print() {}, printErr() {}, stdout: put, stderr: put, stdin: readStdin });
    m.FS.writeFile("prog.pil", code);
    try { rc = m.callMain(["prog.pil"]); }
    catch (err) { if (err && err.name === "ExitStatus") rc = err.status; else throw err; }
  } catch (err) { flush(); if (needAt < 0) postMessage({ t: "crash", s: String(err && err.message || err) }); rc = -1; }
  flush();
  postMessage({ t: "done", rc, needAt });
};
