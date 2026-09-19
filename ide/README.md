# 28teh workspace

A terminal-first web IDE for the class: Monaco editor · per-session Docker sandbox attached as a real shell (xterm.js ↔ Socket.IO ↔ Dockerode) · AI assistant streamed through the server from OpenRouter or Gemini.

```
ide/
├── public/            index.html · client.js · styles.css (built from src/styles.css)
├── server.js          Express (static, /api/auth, /api/models, /api/chat SSE) + Socket.IO terminal wiring
├── lib/sandbox.js     Dockerode: create/attach/resize/destroy, idle sweeper, boot reconcile, marker filter
├── lib/ai/            index.js (registry) · openrouter.js · gemini.js · sse.js
├── lib/auth.js        class-code gate (sha256) for the socket handshake and /api/*
├── Dockerfile         sandbox image (ubuntu:24.04, user `developer`, /usr/local/bin/visit-site)
└── .env.example       every variable the server reads – copy to .env (git-ignored)
```

## Setup

### 1. Install Docker and start the daemon

- **Linux (Debian/Ubuntu)** – Docker Engine: `curl -fsSL https://get.docker.com | sh`, then `sudo systemctl enable --now docker`.
- **macOS** – install [Docker Desktop](https://www.docker.com/products/docker-desktop/) and start it (whale icon in the menu bar). It exposes the socket at `/var/run/docker.sock` (a symlink to `~/.docker/run/docker.sock`).
- **Windows** – install Docker Desktop (WSL 2 backend). The daemon listens on the named pipe `//./pipe/docker_engine`; set `DOCKER_HOST=npipe:////./pipe/docker_engine` in `.env` (the server also tries this pipe by default on Windows).

Verify the daemon is running before anything else:

```bash
docker info
```
It must print `Server Version:` without errors. `Cannot connect to the Docker daemon` means it is not started or your user cannot reach the socket (next step).

### 2. Give Node access to the Docker socket

The Node process talks to Docker over the socket. On Linux the socket is owned by `root:docker`, so either run the server as a user in the `docker` group:

```bash
sudo usermod -aG docker $USER   # log out and back in afterwards
```
or point `DOCKER_HOST` at a TCP endpoint you have secured with TLS. Do **not** `chmod 666 /var/run/docker.sock` on a shared machine. On macOS/Windows Docker Desktop already grants the desktop user access.

**What this means:** anything that can talk to the Docker socket can start a privileged container with the host filesystem mounted – i.e. it has **root on the host**. Giving this server the socket is giving it host-root-equivalent power. Run it on a dedicated VM/host, as its own user, and never expose the socket to the containers it creates (this server never mounts it).

### 3. Build the sandbox image

```bash
cd ide
docker build -t 28teh-sandbox .
```
Sanity check the image runs as the non-root user and the marker script works:

```bash
docker run --rm 28teh-sandbox -c 'whoami; visit-site'
```
Expected: `developer` and `::TRIGGER_OPEN_URL::https://my-editor-website.com`.

### 4. Configure and run the server

```bash
cd ide
npm ci                      # public/styles.css is committed; run `npm run build:css` after editing src/styles.css
cp .env.example .env        # fill in ACCESS_HASH and at least one provider key
npm start                   # http://localhost:8787
```
- `ACCESS_HASH` – sha256 hex of the class access code: `echo -n THECODE | shasum -a 256`. Without it the server refuses to start (set `AUTH=off` only on your own machine).
- `OPENROUTER_KEY` and/or `GEMINI_API_KEY` – a model appears in the selector only when its provider's key is present. Keys are read server-side only; the browser never sees them.
- `.env` is git-ignored (`git check-ignore ide/.env` prints the path). Never commit it.

Behind nginx/Caddy: terminate TLS there, proxy WebSockets (`Upgrade`/`Connection` headers), and set `TRUST_PROXY=1` so the per-IP container cap uses `X-Forwarded-For`. `docs/compiler/index.html` on GitHub Pages forwards to the URL you put in its `WORKSPACE_URL` constant.

### 5. Development

`npm run dev` restarts on file changes; `npm run watch:css` rebuilds Tailwind while editing `src/styles.css`. `GET /health` reports whether Docker is reachable and how many sessions are live.

## How a session works

1. Browser connects with the class code → `terminal-open {cols, rows}`.
2. Server checks caps (`MAX_PER_IP`, `MAX_TOTAL`), creates a container from `28teh-sandbox` with this `HostConfig`:
   `Memory 256 MiB`, `MemorySwap = Memory`, `NanoCpus 0.5·10⁹`, `PidsLimit 64`, `CapDrop ALL`, `SecurityOpt no-new-privileges`, `ReadonlyRootfs true` with tmpfs on `/tmp` (64 MB, noexec) and `/home/developer` (128 MB), `User developer`, `NetworkMode bridge`, no binds, not privileged.
3. `container.attach` (TTY, hijacked) is piped both ways: `terminal-input` → stdin, stdout/stderr → `terminal-output`. `terminal-resize` calls `container.resize`.
4. Output is line-scanned on the server: a line that is exactly `::TRIGGER_OPEN_URL::<url>` is removed before it reaches the browser (partial lines are held back until the newline, so no fragment flashes). If `<url>` is exactly in `ALLOWED_URLS` (`https://my-editor-website.com`) the server emits `open-url`; otherwise it logs `rejected open-url` and drops it. The browser re-checks the same allowlist before `window.open`.
5. The container is killed and removed on socket disconnect, when the shell exits, on `IDLE_MINUTES` without input (sweeper runs every 60 s), on `SIGINT`/`SIGTERM`, and – for anything left behind by a crash – at the next server start (`reconcile()` removes every container labelled `28teh.session`).
6. **Run** writes the active editor file into the container home via `docker exec` (`base64 -d`) and types the language's command into the live shell, so the program runs in the same terminal the student is already using.

## Security notes – read before exposing this to anyone

- **Docker socket = host root.** The server process can do anything Docker can. Compromise of the Node process (dependency, bug, leaked `.env`) is compromise of the host. Run it on a machine that holds nothing else you care about.
- **Network is allowed (tradeoff resolved as option a).** Containers sit on the default bridge with outbound internet so `curl`, `git clone`, `pip`/`npm` installs work. Consequences: a student can download anything, exfiltrate data, hit other hosts on your network from your IP, or run a crypto miner for `IDLE_MINUTES`. CPU/memory are capped; **bandwidth is not**. If you need a closed sandbox, set `NetworkMode: "none"` in `lib/sandbox.js` and accept that curl/git only work offline.
- **Access gate is the only perimeter.** One shared class code guards both the shell and the AI proxy. Anyone with the code gets a Linux shell with internet. Rotate the code (update `ACCESS_HASH`) when it leaks; there is no per-student identity or audit trail beyond the server log.
- **Container hardening reduces, not removes, escape risk.** `CapDrop ALL`, `no-new-privileges`, read-only rootfs, non-root user and the default seccomp/AppArmor profiles block the common paths, but a kernel vulnerability in the container runtime or the host kernel is still an escape route. Containers are not VMs. Keep the host kernel and Docker patched; consider gVisor (`runsc`) or Kata as the runtime if you need stronger isolation.
- **Server crash mid-session.** Containers keep running until the server restarts (`reconcile()` then removes them) or until you `docker rm -f $(docker ps -aq --filter label=28teh.session)` by hand. Run the server under systemd with `Restart=always` so the window is short. `MAX_TOTAL` bounds the damage of a burst.
- **Resource caps are per container, not global.** `MAX_PER_IP`/`MAX_TOTAL` cap the number of containers; a NAT'd classroom shares one IP, so tune `MAX_PER_IP` to the class size or put students behind individual codes.
- **What is not protected:** denial of service via many WebSocket connections that never open a container (rate-limit at the reverse proxy), abuse of the AI proxy quota with a leaked code, and anything a student does *from* the sandbox to third parties.
- **Provider keys** never leave the server, but they are in `.env` in plain text – protect the host's filesystem accordingly.

## Socket.IO protocol

| direction | event | payload |
|---|---|---|
| → server | `terminal-open` / `terminal-restart` | `{cols, rows}` |
| → server | `terminal-input` | string (raw keystrokes, ≤ 64 KB) |
| → server | `terminal-resize` | `{cols, rows}` |
| → server | `run-file` | `{name, content}` → ack `{ok}` or `{ok:false, error}` |
| ← client | `terminal-output` | string |
| ← client | `terminal-status` | `{state: creating\|attached\|exited\|limit\|error, message, idleMs}` |
| ← client | `open-url` | allowlisted URL |
