# 28teh workspace

A browser coding workspace for the 28th group: Monaco editor, a real terminal (xterm.js), saved and shareable projects with version history, live viewing of shared projects, and an AI teaching assistant. One Node process serves everything; no Docker.

## How it fits together

```
browser ── HTTP (projects, AI) ─┐
        └─ Socket.IO (terminal, live updates) ─┤
                                               ▼
                                   server.js (Express + Socket.IO)
                                   ├─ lib/projects.js  SQLite (node:sqlite)
                                   ├─ lib/shell.js     one bash per tab, inside bubblewrap
                                   │    └─ bin/compiler <file>   picks the toolchain by extension
                                   └─ lib/ai/*         OpenRouter / Gemini, keys stay on the server
```

- **Terminal**: each browser tab gets its own bash shell in a fresh working directory, attached over a pseudo-terminal (`node-pty`). It is a real shell, so programs can read input interactively. **Run** writes the open file into that directory and types `compiler <file>`.
- **`compiler`** (`bin/compiler`) is the single command for every language. It finds the language from the extension, compiles if needed, applies per-language CPU and memory limits, and emits small markers the UI uses to show compiling/running/finished, the duration and the exit code. `compiler --help` lists what is installed.
- **Projects** are stored in SQLite. Each browser has a random *workspace key* (Settings shows it, so you can move to another device). Projects are private by default; the owner can share them by link or list them publicly, and optionally allow editing.
- **Live**: anyone viewing a shared project sees the owner's changes about a second after each autosave. It is live *viewing*, not multi-cursor co-editing; if two people edit an editable link at the same time, the second save is rejected and they choose whose version to keep.

## Languages

| Language | Extension | Needs on the server |
|---|---|---|
| Python | `.py` | `python3` |
| JavaScript | `.js` | `node` (system install, e.g. `/usr/bin/node`) |
| Java | `.java` | `java` (JDK 11+, single-file source launch) |
| C / C++ | `.c` / `.cpp` | `gcc` / `g++` |
| C# | `.cs` | `mcs` and `mono` (`mono-devel`) |
| Lua | `.lua` | `lua`, `lua5.4` or `lua5.3` |
| PIL | `.pil` | `bin/pil`, built with `npm run build` |
| Bash | `.sh` | `bash` |

Languages whose toolchain is missing still show up (you can write and save code) but Run is disabled and marked "not installed".

## Run it locally (macOS or Linux)

```bash
cd ide
cp .env.example .env
npm install
npm run build        # optional: builds the PIL interpreter into bin/pil (needs git and a C++20 compiler)
npm run dev          # http://localhost:8787, no access code, no sandbox
```

`npm run dev` sets `AUTH=off` and `SANDBOX=off`, so code runs directly on your machine. That is fine for trying things yourself; never expose a dev server to others.

Checks: `npm test` (diagnostics parser) and `npm run check` (syntax of every module and the `compiler` script).

## Deploy (Linux server)

Code execution needs a Linux machine you control: a VPS or a school server (written for Ubuntu 22.04/24.04 and Debian 12). Serverless hosts (Vercel, Netlify, Cloudflare Workers, GitHub Pages) cannot run compilers or keep terminals open, and most container platforms (Render, Railway, Heroku) do not allow the user namespaces bubblewrap needs, so execution would stay disabled there. The editor, projects and AI still work on those hosts.

1. Install the runtime and toolchains:
   ```bash
   sudo apt update
   sudo apt install -y nodejs npm bubblewrap build-essential git python3 default-jdk-headless lua5.4 mono-devel
   node -v   # needs 22.13 or newer; use NodeSource if the distro ships an older one
   ```
2. Create a dedicated user and install the app:
   ```bash
   sudo useradd --system --create-home --home-dir /opt/28teh --shell /usr/sbin/nologin teh
   sudo -u teh git clone https://github.com/LoDuur/edupage-sync /opt/28teh/app
   cd /opt/28teh/app/ide
   sudo -u teh npm ci --omit=dev
   sudo -u teh npm run build
   sudo -u teh cp .env.example .env   # set ACCESS_HASH, TRUST_PROXY=1, API keys
   ```
3. Check the sandbox works for that user: `sudo -u teh bwrap --unshare-all --ro-bind / / true && echo ok`. On Ubuntu 24.04 the `bubblewrap` package ships the AppArmor profile that allows this.
4. systemd unit `/etc/systemd/system/28teh.service`:
   ```ini
   [Unit]
   Description=28teh workspace
   After=network.target

   [Service]
   User=teh
   WorkingDirectory=/opt/28teh/app/ide
   ExecStart=/usr/bin/node server.js
   Restart=always
   Environment=NODE_ENV=production
   # Caps for the whole service, sandboxes included.
   MemoryMax=3G
   TasksMax=1024
   CPUQuota=200%

   [Install]
   WantedBy=multi-user.target
   ```
   ```bash
   sudo systemctl daemon-reload && sudo systemctl enable --now 28teh
   journalctl -u 28teh -f      # look for "sandbox bwrap" in the start line
   ```
5. TLS with Caddy (`/etc/caddy/Caddyfile`), WebSockets work without extra config:
   ```
   code.example.com {
     reverse_proxy 127.0.0.1:8787
   }
   ```
6. Point `docs/compiler/index.html` (`WORKSPACE_URL`) at the new address so the timetable's `compiler` command opens it.

Updating: `git pull && npm ci --omit=dev && sudo systemctl restart 28teh`. The database lives in `ide/data/` (or `DATABASE_PATH`); back it up with `sqlite3 data/28teh.db ".backup backup.db"`.

## Security model

What was reviewed and tested, and what it relies on:

- **Isolation**: with `SANDBOX=auto` every shell runs inside bubblewrap with new user, PID, network, IPC and UTS namespaces, all capabilities dropped, no network, a read-only view of `/usr` and selected `/etc` entries, a private `/tmp`, and only its own working directory writable. The app directory, `.env`, the database and other sessions' directories are not mounted. The environment is cleared, so API keys and `ACCESS_HASH` are not visible to user code. If bubblewrap is missing or cannot create namespaces, the server starts but refuses to open terminals and says why.
- **Limits**: `compiler` sets per-run CPU time (20–30 s) and address-space limits; the shell caps file size (16 MB), open files and processes (`MAX_PROCESSES`, counted across all sandboxes of the service user). Terminals close after `IDLE_MINUTES` without input, on disconnect and on restart, and their directories are deleted. Output is rate-limited to 1 MB/s per terminal. `MAX_PER_IP` and `MAX_TOTAL` cap concurrent terminals.
- **Not enforced per terminal**: total memory and disk use across many processes. The systemd `MemoryMax`/`TasksMax` above protect the host; put `RUN_DIR` on a small separate filesystem if disk exhaustion is a concern.
- **Projects**: every API call needs the access code and a workspace key. Private projects return 404 to anyone else; read-only viewers get 403 on writes; only the owner can change sharing, metadata or delete. Inputs are validated (200 KB code limit, text length limits, known languages only), saves are limited to 120 per minute per IP and 500 projects per workspace key, and history keeps at most 50 versions per project.
- **Trust**: the workspace key is the only proof of ownership. Anyone who has it controls those projects, so it is shown only in Settings.

Isolation was exercised on macOS only in `SANDBOX=off` mode during development; the bubblewrap path needs to be verified on the target Linux server with step 3 above.

## Keyboard shortcuts

`⌘/Ctrl+Enter` run or stop, `⌘S` save, `⌘⇧S` named version, `⌘⇧P` command palette, `⌘P` find a project, `⌘B` sidebar, `⌘J` terminal panel, `Ctrl+\`` focus terminal/editor, `⌘⌥B` side panel, `⌘,` settings. Monaco's own shortcuts (find/replace, folding, F1 command list, multi-cursor) work unchanged. The full list is under **Shortcuts** in the sidebar.

## Configuration

See `.env.example`. Real environment variables override `.env`.
