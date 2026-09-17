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

## Java compiler (`compiler/`)

`compiler/` is a separate page (console command `compiler`) with a Java editor. Code is compiled and run on [Wandbox](https://wandbox.org) (OpenJDK 22, UTF-8). Saving goes to Supabase (project `edupage-sync`, table `snippets`) through the `save_snippet` RPC, which checks a bcrypt-hashed class passkey stored in `settings`. Anonymous clients can only read: saved snippets are public and immutable (no insert/update/delete grants). The same code gates the page itself (`compiler/`) and the works archive (`compiler/works/`) client-side (SHA-256 in `compiler/ui.js`), and is checked server-side for saving. Change it with `select set_passkey('new-key');` in the Supabase SQL editor and update `ACCESS_HASH` in `compiler/ui.js`. The editor has Java autocompletion (Tab / Ctrl+Space, snippets `sout psvm fori sc …`), error-line highlighting and an AI helper (pollinations.ai, keyless).

## PIL interpreter (`compiler/pil/`)

`compiler/pil/` (console command `pil` or `compiler pil`) is the same editor for [PIL](https://github.com/Acerx-AMJ/PIL), a small COBOL/assembly-style esolang. The upstream C++ interpreter is compiled to WebAssembly (`compiler/pil/pil.js`, single file) and runs in a Web Worker inside the browser: no server, stdin from the `stdin` tab, 10 s timeout per run, Latvian UTF-8 output. Rebuild with `tools/build-pil.sh` (needs `brew install emscripten`); the interpreter commit is in `compiler/pil/VERSION`. `compiler/pil/pil-lang.js` holds the CodeMirror mode, Tab completion (all built-ins with argument hints, snippets `main func loop if readnum …`), bundled examples and the language reference shown in the `Valoda` tab and given to the AI helper. Note the upstream README is older than the code: the real names are `println printfln readln readch const` (the page hints this on `No such function` errors). Saved works share the `snippets` table with Java through the `lang` column (`save_snippet(..., p_lang)`); the works archive shows both with a language filter.

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
