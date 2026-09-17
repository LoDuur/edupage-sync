importScripts("pil.js");
const dec = new TextDecoder(), enc = new TextEncoder();
onmessage = async e => {
  const { code, stdin } = e.data;
  const input = enc.encode(stdin || "");
  let pos = 0, buf = [];
  const flush = () => { if (buf.length) { postMessage({ t: "out", s: dec.decode(new Uint8Array(buf)) }); buf = []; } };
  const put = c => { buf.push(c); if (c === 10 || buf.length > 4096) flush(); };
  let rc = 0;
  try {
    const m = await createPIL({ noInitialRun: true, print() {}, printErr() {}, stdout: put, stderr: put, stdin: () => pos < input.length ? input[pos++] : null });
    m.FS.writeFile("prog.pil", code);
    try { rc = m.callMain(["prog.pil"]); }
    catch (err) { if (err && err.name === "ExitStatus") rc = err.status; else throw err; }
  } catch (err) { flush(); postMessage({ t: "crash", s: String(err && err.message || err) }); rc = -1; }
  flush();
  postMessage({ t: "done", rc });
};
