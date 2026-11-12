# edupage-sync

Syncs the Valmieras tehnikums EduPage timetable for **2.k. 28.grupa** into Google Calendar (and therefore Apple Calendar), publishes a subscribable `.ics`, and posts a Discord message whenever the timetable changes.

Runs on GitHub Actions every 10 minutes (plus an external fast trigger every 2 minutes, see below). `state.json` holds the last published lessons; each run diffs it against the current EduPage data. A run with no EduPage changes writes nothing and creates no commit.

## Setup

### 1. Google Calendar
1. [Google Cloud Console](https://console.cloud.google.com/) → new project → *APIs & Services* → enable **Google Calendar API**.
2. *IAM & Admin → Service Accounts* → create one → *Keys → Add key → JSON*. Download the file.
3. In [Google Calendar](https://calendar.google.com/) create a new calendar (e.g. *Valteh 28.grupa*) → *Settings and sharing* → *Share with specific people* → add the service account email (`...@...iam.gserviceaccount.com`) with **Make changes to events**.
4. Copy the **Calendar ID** from the same settings page (looks like `abc123@group.calendar.google.com`).

### 2. Discord
Server Settings → Integrations → Webhooks → New Webhook → pick a channel → *Copy Webhook URL*.

### 3. GitHub
1. Push this folder to a GitHub repository.
2. *Settings → Secrets and variables → Actions* → add:
   - `GOOGLE_SERVICE_ACCOUNT_JSON` — full contents of the downloaded JSON key
   - `GOOGLE_CALENDAR_ID`
   - `DISCORD_WEBHOOK_URL`
3. *Actions → Sync EduPage timetable → Run workflow* for the first run. It runs every hour afterwards.

### 4. Apple / iPhone Calendar
Add your Google account under *Settings → Apps → Calendar → Accounts* (iOS) or *Calendar → Settings → Accounts* (macOS) and enable the *Valteh 28.grupa* calendar. Changes arrive as soon as Google has them.

Alternative for any calendar app: subscribe to
`https://raw.githubusercontent.com/<user>/edupage-sync/main/docs/timetable.ics`

## Fast trigger

GitHub's `schedule:` is best effort and often fires 10–30 minutes late, so the crons in `.github/workflows/sync.yml` are only a fallback. An external scheduler (cron-job.org) calls the workflow directly:

```
POST https://api.github.com/repos/<user>/edupage-sync/actions/workflows/sync.yml/dispatches
Authorization: Bearer <token>
Accept: application/vnd.github+json
X-GitHub-Api-Version: 2022-11-28

{"ref":"main"}
```

Token: a fine-grained personal access token limited to this repository with **Actions: read and write**. Store it in the scheduler only; it is never needed in the repo. A successful call returns `204 No Content`.

Schedule: every 2 minutes, 06:00–23:00 Europe/Riga, every day. Do not poll more often than every 1–2 minutes — runs are serialised by the `sync` concurrency group and each one hits EduPage through the proxy.

## WhatsApp (Green API)

Messages go to one WhatsApp chat from your own account via [Green API](https://green-api.com):

1. Register → *Create instance* (free **Developer** plan).
2. Open the instance → **QR code** → phone: WhatsApp → *Linked devices* → *Link a device* → scan.
3. Copy **idInstance** and **apiTokenInstance**; add them as repo secrets `GREEN_API_ID_INSTANCE` and `GREEN_API_TOKEN`.
4. Find the group ID: `GREEN_API_ID_INSTANCE=… GREEN_API_TOKEN=… python whatsapp.py --chats` → add the `…@g.us` value as secret `WHATSAPP_CHAT_ID`.
5. Test: `… WHATSAPP_CHAT_ID=… python whatsapp.py --test "Tests"`.

What is sent (as a rendered image + one-line caption with the website link):
- **Every evening before a school day** (first run after 21:00 Riga): an image of tomorrow's lessons (times, rooms, teachers, breaks, substitutions), with "✅ Izmaiņu nav" or the number of changes since the last message.
- **Immediately**: a new weekly timetable (week image), timetable changes (week image), and new/cancelled substitutions (day image) from EduPage's *Aizvietošana* page.

`DAILY_HOUR` (default `21`) changes the digest hour. Linked-device automation is outside WhatsApp's terms; keep volume low.

## 28teh – workspace (`ide/`)

`ide/` is the **28teh workspace**: Monaco editor, an xterm.js terminal, saved projects with share links, live viewing and version history, and an AI assistant, for Python, JavaScript, Java, C, C++, C#, Lua, PIL and Bash. The timetable console command `compiler [language|list|id]` opens it at `docs/compiler/`, a static build served by GitHub Pages (`cd ide && npm run build:pages`): Python and PIL run in the browser, C/C++/C#/Lua on godbolt.org and Java/JavaScript/Bash on wandbox.org, and projects and the assistant use the `edupage-proxy` Worker. The same app can also run on its own Linux server with a sandboxed terminal and one `compiler <file>` command. Details in [`ide/README.md`](ide/README.md).

## Games

The timetable console has `doom` (and `games`): DOOM shareware v1.9 runs in js-dos v8 (emulator from v8.js-dos.com, CORS-enabled) inside the console panel itself (an isolated iframe appended to the console output, so the timetable stays visible); the bundle `docs/games/doom.jsdos` was built from the official `doom19s.zip` shareware release (DOOM1.WAD 4,196,020 bytes) with a `.jsdos/dosbox.conf` autoexec. Only redistributable shareware files are included. Close with Ctrl+Q.

## Ping Pong

The console command `PingPong` (also `pingpong`, `pong`; `pingpong <code>` joins directly) opens `docs/pingpong/` in a full-screen iframe over the timetable, so leaving it restores the page and console exactly as they were. One player creates a lobby and shares its 5-character code or invite link; up to 8 players join, and the host picks the mode, score, event frequency and strength, John Pong's difficulty and which of the 32 events can happen. Modes: Klasika, Haoss, Izdzīvošana, Boss cīņa, Turnīrs, Boss maratons, Hardcore, Nejaušība, Spējas, Pēdējā rakete, John Pong izaicinājums, Notikumu vētra, 2D Pong and Komandas.

`docs/pingpong/sim.js` is the only copy of the rules: a pure module with no DOM, run by both the Worker and every browser. `/pingpong/create` and `/pingpong/lobbies/<code>` upgrade to a WebSocket handled by one `PingPongLobby` Durable Object per code (`proxy/pingpong.js`). New modes are one entry in `MODES`, new events one entry in `EVENT_LIST`, new boss attacks one entry in `ATTACKS`.

Each browser simulates the match locally at 60 Hz, a little ahead of the server (`docs/pingpong/predict.js`). Local input applies on the next step and is sent as a step-tagged intent; the server applies it at that step and relays it to the other players. The server stays authoritative: about 5 times a second, and immediately after a goal, event or boss change, it sends the full state with the last applied input of each player. The client restores that state, replays its unacknowledged inputs to the present step and blends any small correction over about 70 ms. Goals, random events, mystery boxes and boss defeats only ever happen on the server, so a client holds a ball that crosses the goal line until the server confirms it. The Worker never accepts a position, score or outcome from a client.

Lobbies live only in memory and use no hibernation, so an open lobby keeps its Durable Object running. A disconnected player has 20 seconds to reconnect while a stand-in plays their paddle. A lobby closes when its last player leaves, after 60 seconds with nobody connected, or after 15 minutes idle in the lobby screen. A Worker restart ends any running lobby.

Tests: `node --test proxy/pingpong.test.js`, including a simulated laggy network. When changing files in `docs/pingpong/`, bump the `?v=` numbers in `index.html` and the imports at the top of `pingpong.js` and `predict.js`. Client and Worker share a wire protocol, so deploy the Worker before pushing the page (`cd proxy && npx wrangler deploy --config wrangler.toml`).

## Starpbrīdis (arena FPS)

The console command `arena` (also `fps`, `shooter`) and the "starpbrīdis" button in the v2 sidebar open `docs/arena/` in a full-screen iframe, like Ping Pong; leaving it posts `arena:exit` and restores the page. It is a Quake-inspired arena shooter on Three.js 0.170 (import map, no build step) with bots. Touch-only devices get a "needs keyboard and mouse" screen.

`docs/arena/sim/` holds the rules and has no DOM or Three.js, so the planned multiplayer Worker can run the same code:
- `movement.js`: a fixed 60 Hz player move with Quake-style air acceleration (strafe-jumping), bhop, slide, wall jump and dash.
- `collision.js`: swept box traces against convex brushes.
- `nav.js`: generates each map's bot waypoint graph at load.
- `bots.js`: the bot AI, which steers by sending the same inputs a player does.
- `game.js`: match rules.
- `weapons.js`: the six weapons (pistol, SMG, assault rifle, AA-12, sniper rifle, rocket launcher) and the fire/reload state machine. A weapon is one `WEAPONS` entry; rockets are projectiles with splash damage and knockback, so firing at your own feet is a rocket jump. The sniper zooms ×4 and is only accurate while scoped (right mouse button).
- `maps/`: brush data.

All tuning values live in `sim/constants.js` and the `WEAPONS` table.

Pickups are weapons, health, mega health, armor and ammo boxes. Bots fetch weapons, armor and ammo and choose a weapon by range.

The weapon models (`docs/arena/assets/weapons/*.glb`) are built from code. Run `tools/arena/build_weapons.py` with headless Blender, and `tools/arena/render_previews.py` to render check images. Each model has named parts (`Body`, `Bolt`/`Slide`, `Drum`/`Mag`/`Rocket`, `Trigger`, `Muzzle`, `Eject`, `HandL`) that `render/viewmodel.js` animates. Its `CONFIG` table holds the per-weapon hold position, magazine direction, reload choreography and shell type.

```
"/path/to/Blender" --background --factory-startup --python tools/arena/build_weapons.py
```

Tests: `node --test proxy/arena.test.js`. After changing any file in `docs/arena/`, run `python3 tools/arena/stamp_version.py <n>` with a higher number. It rewrites the import map so every module and model URL carries `?v=<n>`, because GitHub Pages caches files for 10 minutes. Locally, `python3 tools/arena/devserver.py 8124 docs` serves without caching.

## Collaborative drawing

The console command `paint [room]` (alias `draw`) opens `docs/paint/`, a shared canvas the whole class draws on in real time. Rooms are separate canvases (`paint fizika`); the default room is `klase`. Joining asks once for a name; there is no access code, only the Worker's origin check.

Real-time sync runs in the `edupage-proxy` Worker: `/paint/rooms/<room>` upgrades to a WebSocket handled by one `PaintRoom` Durable Object per room (`proxy/paint.js`, SQLite storage, WebSocket hibernation, so idle rooms cost nothing). Strokes are stored as vector ops, so the drawing survives reconnects, reloads and Worker restarts. A second clear deletes everything before the previous clear, which keeps storage bounded.

When changing any file in `docs/paint/`, bump the `?v=` number in `index.html` and in the imports at the top of `paint.js`; GitHub Pages caches each file for 10 minutes, and without the bump a browser can mix a new page with an old script. Deploy after changing it: `cd proxy && npx wrangler deploy --config wrangler.toml` (the first deploy runs the `paint-v1` migration that creates the Durable Object class). Locally: `npx wrangler dev --config proxy/wrangler.toml --port 8790` and serve `docs/` on port 8123.

## Stundu saraksts v2 (`docs/v2/`)

A separate student dashboard next to the current lesson list (v1 stays the default). Switch with the console command `versions 2`; the v2 terminal (`` ` `` or ⌘K) has `versions 1` to go back. The v2 terminal (`docs/v2/js/terminal.js` + `commands.js`) carries all v1 console commands (themes, colours, juarch, games, paint, PingPong, compiler, admin …) plus `class` and `open`, and shares the command history with v1. `?v=1` always opens v1. Both versions share the `prefs` object in `localStorage`: v2 only adds `prefs.version` and `prefs.v2` (class, tab, consultation day, bus stop, trip, seen changes), so themes, colours and history survive switching.

Sections: timetable for any class, change log, teacher consultations, VTU Valmiera city buses and intercity journeys. No build step: plain ES modules in `docs/v2/js/`, opencode-style design in `docs/v2/app.css` (JetBrains Mono stands in for the commercial Berkeley Mono).

**All classes.** Each sync run also calls `classes.publish` (`classes.py`) with the tables and substitution pages already fetched for the main class, so there are no extra EduPage requests. It writes `docs/classes/index.json` (classes, bells, published weeks, next-week status), `docs/classes/<slug>.json` (the snapshot: events and substitutions) and `docs/classes/<slug>.changes.json` (last 100 change entries: `published`, `updated` with added/changed/moved/removed lessons, `substitutions`, each with `detectedAt`). Only weeks present in the current fetch are compared; a week that is not (yet) published keeps its last known lessons. Files are written only when their content changes. A failure in this step is logged as a warning and never blocks the v1 pipeline. Tests: `python -m unittest tests/test_classes.py`.

**Consultations.** `docs/data/consultations.json` is transcribed by hand from the school's PDF (a scanned image without a text layer). When the school publishes a new schedule, update the JSON (`approved`, `source`, `teachers[].days.mon…fri`) and push.

**City buses.** An interactive map (Leaflet 1.9.4 from unpkg, Esri grey basemap) fed live from the Valmiera municipality ArcGIS services: route lines in the official colours read from the municipality's web map, stop markers, a searchable stop list, a route bar that highlights one route and filters its stops, and "nearest stop" via geolocation. Timetables are the official per-stop images attached there; no times are copied into this repo.

**Intercity.** `transit.py` (workflow `transit.yml`, daily) builds a compact timetable and fare shards from the ATD (buses) and VIVI (trains) GTFS feeds and stores them in the `TRANSIT` KV namespace; the `edupage-proxy` Worker serves them at `/transit/*`, and `docs/v2/js/route.js` searches journeys in the browser. 1188.lv offers no API and disallows automated searches, so it is only linked.

**PWA.** `docs/v2/manifest.webmanifest` + `docs/v2/sw.js`, scoped to `/v2/`. The service worker precaches the app shell, serves class and consultation data network-first with an offline fallback (the page then shows a "Bezsaistē" banner with the data's timestamp) and never caches ArcGIS. **When changing any file in `docs/v2/`, bump `VERSION` in `sw.js`**; open apps then show "Pieejama jauna versija · Atjaunot" instead of reloading on their own.

**Cloudflare.** The site is served by Workers static assets (`wrangler.jsonc`, directory `docs/`). With the repo secrets `CLOUDFLARE_API_TOKEN` (Workers Scripts + KV edit) and `CLOUDFLARE_ACCOUNT_ID`, the sync workflow runs `wrangler deploy` after every pushed sync commit and the transit workflow uploads to KV. One-time: `cd proxy && npx wrangler kv namespace create TRANSIT`, put the id in `proxy/wrangler.toml`, deploy the Worker.

## Local run

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python sync.py --dry-run
```

`--dry-run` fetches and prints the diff, writes `docs/timetable.ics`, but does not touch Google, Discord or `state.json`.

## Lesson times

Lesson times come from the school's official bell schedule (`bells.py`, typed in from [MĀCĪBU STUNDU LAIKI](https://valmierastehnikums.lv/wp-content/uploads/2024/10/MACIBU_STUNDU_LAIKI.pdf-3.pdf)): separate tables for Monday, Tuesday–Thursday, Friday and the shortened pre-holiday day (30-minute lessons). A day is treated as pre-holiday when the next day is a Latvian public holiday; lessons on public holidays are skipped. To force a schedule for a specific date, add it to `overrides.json`, e.g. `{"2026-12-18": "short"}` (values: `monday`, `midweek`, `friday`, `short`).

## Names with missing diacritics

EduPage's data has `?` in place of Latvian letters in most subject, room and group names (e.g. `Soci?l?s zin. un v?sture`). `names.json` maps broken words to correct ones and is applied to every name. When a new unknown broken word appears, the sync log prints `WARNING: unknown broken word …` — add it to `names.json` and push.

## Configuration

Environment variables: `CLASS_NAME` (default `2.k. 28.grupa`), `EDUPAGE_SCHOOL` (default `valteh`), `TIMEZONE` (default `Europe/Riga`). Class names must match the EduPage "Klases" list exactly.
