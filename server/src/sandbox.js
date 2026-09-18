import { execFileSync } from "node:child_process";

export const FIREJAIL = (() => { try { return execFileSync("/bin/sh", ["-c", "command -v firejail"], { encoding: "utf8" }).trim() || null; } catch { return null; } })();
export const MODE = FIREJAIL ? "firejail" : process.env.SANDBOX === "dev" ? "dev" : "none";

// Builds argv for one run. Every run gets: no network, private copy of its own temp workspace as filesystem root,
// private /tmp and /dev, all capabilities dropped, seccomp filter, no new privileges, no root, address-space /
// CPU / process / file-size limits and a hard wall-clock timeout. The workspace path is the only writable directory.
export function sandboxCommand(lang, workspace) {
  const script = lang.script;
  if (MODE === "firejail") {
    const wall = new Date(lang.wall * 1000).toISOString().substr(11, 8);
    const args = [
      "--quiet", "--noprofile", "--net=none", `--private=${workspace}`, "--private-tmp", "--private-dev", "--private-cache",
      "--nosound", "--no3d", "--nodbus", "--novideo", "--nou2f", "--caps.drop=all", "--seccomp", "--nonewprivs", "--noroot", "--nogroups",
      `--rlimit-as=${lang.mem * 1024 * 1024}`, `--rlimit-cpu=${lang.cpu}`, "--rlimit-nproc=64", `--rlimit-fsize=${16 * 1024 * 1024}`, "--rlimit-nofile=256",
      `--timeout=${wall}`, "--", "/bin/sh", "-c", `cd ~ && ${script}`,
    ];
    return { file: FIREJAIL, args };
  }
  // Development fallback (macOS / no firejail): plain shell in the workspace, limits enforced by the runner's timers only.
  return { file: "/bin/sh", args: ["-c", `ulimit -t ${lang.cpu} -f ${16 * 1024} 2>/dev/null; cd "${workspace}" && ${script}`] };
}

export function sandboxEnv(workspace) {
  return { PATH: "/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin", HOME: MODE === "firejail" ? "/root" : workspace, LANG: "C.UTF-8", LC_ALL: "C.UTF-8", TERM: "xterm-256color", PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8"};
}

export function sandboxIdentity() {
  const uid = process.env.SANDBOX_UID ? +process.env.SANDBOX_UID : undefined, gid = process.env.SANDBOX_GID ? +process.env.SANDBOX_GID : undefined;
  return uid ? { uid, gid: gid || uid } : {};
}
