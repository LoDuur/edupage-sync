# 28teh sandbox server

Runs student programs for the 28teh IDE: `WebSocket → node-pty → Firejail → language toolchain`, streaming the PTY to xterm.js.

## Security model
Every run:
- gets a fresh temporary workspace (`$RUN_DIR/ws-*`, default `/tmp/28teh-runs`) containing only the source file, removed on exit/timeout/disconnect;
- is executed through **Firejail** with `--net=none --private=<workspace> --private-tmp --private-dev --caps.drop=all --seccomp --nonewprivs --noroot --nogroups`, `--rlimit-as` (memory), `--rlimit-cpu`, `--rlimit-nproc=64`, `--rlimit-fsize=16M`, `--rlimit-nofile=256` and a hard `--timeout` per language (see `src/languages.js`);
- runs as the dedicated low-privilege user given by `SANDBOX_UID`/`SANDBOX_GID` (node-pty drops privileges when the server is started as root); never as the server's own user;
- is killed by the server after the wall-clock limit or 2 MB of output; the server accepts at most 200 KB of source.

The server **refuses to start** without Firejail unless `SANDBOX=dev` is set. Dev mode runs code unsandboxed and is for local development on macOS only.

## Deploy (Debian/Ubuntu)
```bash
sudo apt install -y firejail python3 default-jdk gcc g++ lua5.4 mono-devel git build-essential
sudo useradd --system --no-create-home --shell /usr/sbin/nologin sandbox
git clone https://github.com/LoDuur/edupage-sync && cd edupage-sync
tools/build-pil-native.sh            # builds server/bin/pil
cd server && npm ci --omit=dev
```
`/etc/systemd/system/28teh.service`:
```ini
[Service]
WorkingDirectory=/opt/edupage-sync/server
ExecStart=/usr/bin/node src/index.js
Environment=PORT=8787 SANDBOX_UID=$(id -u sandbox) SANDBOX_GID=$(id -g sandbox) ORIGINS=https://loduur.github.io RUN_DIR=/var/lib/28teh/runs
User=root
Restart=always
```
Put it behind Caddy/nginx with TLS (`wss://…/ws`). Then build the IDE with the server URL baked in:
```bash
cd ide && VITE_WS_URL=wss://run.example.com/ws npm run build   # writes docs/compiler
```
Without `VITE_WS_URL` (or when the server is unreachable) the IDE falls back to Wandbox for Python/Java/C/C++/C#/Lua and to the in-browser wasm build for PIL, and says so in the toolbar and status bar.

## Endpoints
- `GET /health` → `{ ok, mode }`
- `GET /api/runtimes` → detected toolchains per language (the IDE greys out unavailable ones and marks them *remote*)
- `WS /ws` → `{type:"run",lang,code,cols,rows}` · `{type:"stdin",data}` · `{type:"resize",cols,rows}` · `{type:"kill"}` ⇢ `{type:"started"}` · `{type:"out",data}` · `{type:"exit",code,signal,ms,reason}` · `{type:"error",message}`
