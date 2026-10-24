import { readFileSync, writeFileSync, rmSync, mkdirSync, cpSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ide = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(ide, "..", "docs", "compiler");
const worker = (process.env.WORKER_URL || "https://edupage-proxy.loduur.workers.dev").replace(/\/$/, "");
const version = name => JSON.parse(readFileSync(path.join(ide, "node_modules", name, "package.json"), "utf8")).version;
const cdn = (name, file) => `https://cdn.jsdelivr.net/npm/${name}@${version(name)}/${file}`;

const sources = ["app.css", "js", "pil"];
const hash = createHash("sha256");
const walk = p => statSync(p).isDirectory() ? readdirSync(p).sort().forEach(n => walk(path.join(p, n))) : hash.update(p).update(readFileSync(p));
for (const s of sources) walk(path.join(ide, "public", s));
const build = hash.update(worker).digest("hex").slice(0, 10);
const assets = `assets/${build}`;

rmSync(out, { recursive: true, force: true });
mkdirSync(path.join(out, assets), { recursive: true });
cpSync(path.join(ide, "public", "js"), path.join(out, assets, "js"), { recursive: true });
cpSync(path.join(ide, "public", "pil"), path.join(out, assets, "pil"), { recursive: true });

const css = readFileSync(path.join(ide, "public", "app.css"), "utf8")
  .replaceAll("url(vendor/font/sans/", `url(${cdn("@fontsource/ibm-plex-sans", "files/")}`)
  .replaceAll("url(vendor/font/mono/", `url(${cdn("@fontsource/jetbrains-mono", "files/")}`);
writeFileSync(path.join(out, assets, "app.css"), css);

const config = { api: `${worker}/ide`, chat: `${worker}/ai/chat`, monaco: cdn("monaco-editor", "min/vs") };
writeFileSync(path.join(out, assets, "config.js"), `window.WORKSPACE = ${JSON.stringify(config)};\n`);

const replacements = [
  ['href="vendor/xterm.css"', `href="${cdn("@xterm/xterm", "css/xterm.css")}"`],
  ['href="app.css"', `href="${assets}/app.css"`],
  ['<script src="config.js"></script>', `<script src="${assets}/config.js"></script>`],
  ['<script src="socket.io/socket.io.js"></script>\n', ""],
  ['src="vendor/xterm.js"', `src="${cdn("@xterm/xterm", "lib/xterm.js")}"`],
  ['src="vendor/addon-fit.js"', `src="${cdn("@xterm/addon-fit", "lib/addon-fit.js")}"`],
  ['src="vendor/monaco/loader.js"', `src="${cdn("monaco-editor", "min/vs/loader.js")}"`],
  ['src="js/main.js"', `src="${assets}/js/main.js"`],
];
let html = readFileSync(path.join(ide, "public", "index.html"), "utf8");
for (const [from, to] of replacements) {
  if (!html.includes(from)) throw new Error(`index.html no longer contains ${from}`);
  html = html.replace(from, to);
}
writeFileSync(path.join(out, "index.html"), html);
console.log(`built docs/compiler (${assets}) → API ${config.api}`);
