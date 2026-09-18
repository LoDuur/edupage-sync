import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
export const PIL_BIN = process.env.PIL_BIN || path.join(here, "..", "bin", "pil");

const which = bin => { try { return execFileSync("/bin/sh", ["-c", `command -v ${bin}`], { encoding: "utf8" }).trim() || null; } catch { return null; } };
const version = (bin, arg = "--version") => { try { return execFileSync(bin, [arg], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 5000 }).split("\n")[0].trim(); } catch (e) { return (e.stdout || e.stderr || "").toString().split("\n")[0].trim() || null; } };

// Each language: source file name, shell script (compile && run), toolchain probes, resource limits.
// Scripts run inside the sandboxed workspace; RUN_MARK is echoed between compile and run so the client can show phases.
export const RUN_MARK = "\u001b]7777;run\u0007";
const mark = `printf '${RUN_MARK.replace("\u001b", "\\033").replace("\u0007", "\\007")}'`;

export const LANGUAGES = {
  python: { name: "Python", file: "main.py", needs: ["python3"], script: `${mark}; exec python3 -u main.py`, mem: 512, cpu: 10, wall: 30, versionOf: () => version("python3") },
  lua:    { name: "Lua", file: "main.lua", needs: ["lua"], script: `${mark}; exec lua main.lua`, mem: 512, cpu: 10, wall: 30, versionOf: () => version("lua", "-v") },
  java:   { name: "Java", file: "main.java", needs: ["java"], script: `${mark}; exec java -Xmx256m -Xss1m -XX:+UseSerialGC -XX:TieredStopAtLevel=1 -Dfile.encoding=UTF-8 -Dstdout.encoding=UTF-8 main.java`, mem: 3072, cpu: 20, wall: 45, versionOf: () => version("java", "-version") },
  c:      { name: "C", file: "main.c", needs: ["gcc"], script: `gcc -Wall -O0 -std=c17 main.c -o out -lm && ${mark} && exec ./out`, mem: 1024, cpu: 15, wall: 40, versionOf: () => version("gcc") },
  cpp:    { name: "C++", file: "main.cpp", needs: ["g++"], script: `g++ -Wall -O0 -std=c++20 main.cpp -o out && ${mark} && exec ./out`, mem: 1024, cpu: 20, wall: 45, versionOf: () => version("g++") },
  csharp: { name: "C#", file: "Program.cs", needs: ["mcs", "mono"], alt: ["dotnet"], script: `mcs -nologo -out:Program.exe Program.cs && ${mark} && exec mono Program.exe`, mem: 1024, cpu: 15, wall: 45, versionOf: () => version("mono") },
  pil:    { name: "PIL", file: "main.pil", needs: [], bin: PIL_BIN, script: `${mark}; exec "${PIL_BIN}" main.pil`, mem: 512, cpu: 10, wall: 30, versionOf: () => "PIL (native)" },
};

export function detectRuntimes() {
  const out = {};
  for (const [id, l] of Object.entries(LANGUAGES)) {
    const missing = l.needs.filter(b => !which(b));
    let available = missing.length === 0;
    let ver = null;
    if (id === "pil") { available = existsSync(PIL_BIN); ver = available ? "PIL (native)" : null; }
    else if (id === "csharp" && !available && which("dotnet")) { available = false; }
    if (available && id !== "pil") ver = l.versionOf();
    out[id] = { name: l.name, file: l.file, available, version: ver, missing: available ? [] : (id === "pil" ? ["bin/pil (run tools/build-pil-native.sh)"] : missing) };
  }
  return out;
}
