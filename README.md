# edupage-sync

Syncs the Valmieras tehnikums EduPage timetable for **2.k. 28.grupa** into Google Calendar (and therefore Apple Calendar), publishes a subscribable `.ics`, and posts a Discord message whenever the timetable changes.

Runs hourly on GitHub Actions. `state.json` holds the last published lessons; each run diffs it against the current EduPage data.

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

`ide/` is the **28teh workspace**: a monochrome, terminal-first web IDE (vanilla JS + Monaco + xterm.js, JetBrains Mono) served by a small Node server that gives every browser session its own Docker container (Ubuntu, non-root `developer`, 256 MB / 0.5 CPU / 64 pids, read-only rootfs) attached as a real interactive shell, plus an AI assistant that streams from OpenRouter or Gemini through the server (keys never reach the browser). It needs a host with Docker, so it is not served from GitHub Pages – `docs/compiler/index.html` only forwards to wherever it is deployed. Setup, Docker socket implications and the security model are in [`ide/README.md`](ide/README.md).

## Games

The timetable console has `doom` (and `games`): DOOM shareware v1.9 runs in js-dos v8 (emulator from v8.js-dos.com, CORS-enabled) inside the console panel itself (an isolated iframe appended to the console output, so the timetable stays visible); the bundle `docs/games/doom.jsdos` was built from the official `doom19s.zip` shareware release (DOOM1.WAD 4,196,020 bytes) with a `.jsdos/dosbox.conf` autoexec. Only redistributable shareware files are included. Close with Ctrl+Q.

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
