import argparse
import hashlib
import json
import os
import re
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

import bells
import messages
import render
import substitutions
import whatsapp
import urllib3.util.connection
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

urllib3.util.connection.HAS_IPV6 = False
SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    "Accept": "*/*",
    "Accept-Language": "lv,en;q=0.8",
})
SESSION.mount("https://", HTTPAdapter(max_retries=Retry(total=4, backoff_factor=2, status_forcelist=[500, 502, 503, 504])))

SCHOOL = os.environ.get("EDUPAGE_SCHOOL", "valteh")
CLASS_NAME = os.environ.get("CLASS_NAME", "2.k. 28.grupa")
TZ = ZoneInfo(os.environ.get("TIMEZONE", "Europe/Riga"))
PROXY_URL = os.environ.get("EDUPAGE_PROXY_URL", "").rstrip("/")
BASE = PROXY_URL if PROXY_URL else f"https://{SCHOOL}.edupage.org"
ROOT = Path(__file__).resolve().parent
STATE_FILE = ROOT / "state.json"
ICS_FILE = ROOT / "docs" / "timetable.ics"
DATA_FILE = ROOT / "docs" / "data.json"
CHANGES_FILE = ROOT / "docs" / "changes.json"
NAMES_FILE = ROOT / "names.json"
NAME_FIXES = json.loads(NAMES_FILE.read_text()) if NAMES_FILE.exists() else {}
BROKEN_CHARS = ("?", "\ufffd")
DAY_NAMES = ["Pr", "Ot", "Tr", "Ce", "Pk"]
WEEKDAY_TYPE_CHECK = bells.WEEKDAY_TYPE
PAST_DAYS = 14
CLASS_SHORT = ""
DAILY_HOUR = int(os.environ.get("DAILY_HOUR", "21"))
SITE_URL = os.environ.get("SITE_URL", "https://loduur.github.io/edupage-sync/")
IMG_DIR = ROOT / "out"
FUTURE_DAYS = 60
KEEP_DAYS = 60


def api(path, args):
    r = SESSION.post(
        f"{BASE}/{path}",
        json={"__args": args, "__gsh": "00000000"},
        headers={
            "Content-Type": "application/json",
            "Origin": f"https://{SCHOOL}.edupage.org",
            "Referer": f"https://{SCHOOL}.edupage.org/timetable/view.php",
            "X-Proxy-Key": os.environ.get("EDUPAGE_PROXY_KEY", ""),
        },
        params={"school": SCHOOL} if PROXY_URL else None,
        timeout=30,
    )
    r.raise_for_status()
    return r.json()["r"]


def fetch_versions(today):
    data = api("timetable/server/ttviewer.js?__func=getTTViewerData", [None, today.year])
    by_week = {}
    for tt in data["regular"]["timetables"]:
        if tt.get("hidden"):
            continue
        m = re.match(r"(\d{2})\.(\d{2})\.(\d{4})", tt.get("text", ""))
        if m:
            d = date(int(m[3]), int(m[2]), int(m[1]))
        else:
            d = date.fromisoformat(tt["datefrom"])
        week_start = d - timedelta(days=d.weekday())
        if not (today - timedelta(days=PAST_DAYS) <= week_start <= today + timedelta(days=FUTURE_DAYS)):
            continue
        cur = by_week.get(week_start)
        if cur is None or int(tt["tt_num"]) > int(cur):
            by_week[week_start] = tt["tt_num"]
    return sorted(by_week.items())


def fetch_tables(tt_num):
    data = api("timetable/server/regulartt.js?__func=regularttGetData", [None, str(tt_num)])
    return {t["id"]: {r["id"]: r for r in t["data_rows"]} for t in data["dbiAccessorRes"]["tables"]}


def to_minutes(hhmm):
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def period_window(periods, period_id, day_idx):
    p = periods[period_id]
    default_start = to_minutes(p["starttime"])
    duration = to_minutes(p["endtime"]) - default_start
    override = p.get("daydata", {}).get(str(day_idx), {}).get("starttime")
    start = to_minutes(override) if override else default_start
    return start, start + duration


def fix_name(name):
    if not any(c in name for c in BROKEN_CHARS):
        return name.strip()
    out = []
    for token in name.split():
        fixed = NAME_FIXES.get(token)
        if fixed is None:
            stripped = token.rstrip(".,;:")
            if stripped in NAME_FIXES:
                fixed = NAME_FIXES[stripped] + token[len(stripped):]
        if fixed is None and any(c in token for c in BROKEN_CHARS):
            print(f"WARNING: unknown broken word {token!r} in {name!r}")
        out.append(fixed if fixed is not None else token)
    return " ".join(out)


def build_events(tables, week_start, tt_num, overrides):
    classes = [c for c in tables["classes"].values() if c["name"].strip() == CLASS_NAME.strip()]
    if not classes:
        raise SystemExit(f"Class '{CLASS_NAME}' not found. Available: {[c['name'] for c in tables['classes'].values()]}")
    class_id = classes[0]["id"]
    global CLASS_SHORT
    CLASS_SHORT = classes[0]["short"].strip()
    periods = tables["periods"]
    events = {}
    for card in tables["cards"].values():
        lesson = tables["lessons"].get(card["lessonid"])
        if not lesson or class_id not in lesson["classids"] or not card["period"] or not card["days"]:
            continue
        subject = fix_name(tables["subjects"].get(lesson["subjectid"], {}).get("name", "?"))
        groups = [tables["groups"][g] for g in lesson["groupids"] if g in tables["groups"] and tables["groups"][g]["classid"] == class_id]
        group_names = [fix_name(g["name"]) for g in groups if not g["entireclass"]]
        teachers = [fix_name(tables["teachers"][t]["short"]) for t in lesson["teacherids"] if t in tables["teachers"]]
        rooms = [fix_name(tables["classrooms"][r]["short"]) for r in card["classroomids"] if r in tables["classrooms"]]
        first = int(card["period"])
        last = first + int(lesson.get("durationperiods") or 1) - 1
        for day_idx, bit in enumerate(card["days"]):
            if bit != "1":
                continue
            day = week_start + timedelta(days=day_idx)
            if bells.is_holiday(day):
                continue
            win = bells.window(day, first, last, overrides)
            if win:
                start_min, end_min = win
                edupage_start, _ = period_window(periods, str(first), day_idx)
                if bells.day_type(day, overrides) == WEEKDAY_TYPE_CHECK.get(day.weekday()) and edupage_start != start_min:
                    print(f"WARNING: EduPage start for {day} period {first} is {edupage_start // 60:02d}:{edupage_start % 60:02d}, bells table says {start_min // 60:02d}:{start_min % 60:02d}")
            else:
                start_min, _ = period_window(periods, str(first), day_idx)
                _, end_min = period_window(periods, str(last), day_idx)
            start = datetime.combine(day, datetime.min.time(), TZ) + timedelta(minutes=start_min)
            end = datetime.combine(day, datetime.min.time(), TZ) + timedelta(minutes=end_min)
            summary = subject + (f" ({', '.join(group_names)})" if group_names else "")
            desc_parts = []
            if teachers:
                desc_parts.append("Skolotājs: " + ", ".join(teachers))
            if group_names:
                desc_parts.append("Grupa: " + ", ".join(group_names))
            desc_parts.append(f"Stundas: {first}." if first == last else f"Stundas: {first}.–{last}.")
            desc_parts.append(f"Stundu saraksts v{tt_num}")
            ev = {
                "date": day.isoformat(),
                "start": start.isoformat(),
                "end": end.isoformat(),
                "summary": summary,
                "location": ", ".join(rooms),
                "description": "\n".join(desc_parts),
                "periods": f"{first}." if first == last else f"{first}.–{last}.",
                "teachers": teachers,
                "groups": group_names,
                "version": tt_num,
                "dayType": bells.day_type(day, overrides),
            }
            ev["hash"] = hashlib.sha1("|".join([ev["summary"], ev["start"], ev["end"], ev["location"], ev["description"]]).encode()).hexdigest()
            events[f"{day.isoformat()}|{first}|{lesson['id']}"] = ev
    return events


def load_state():
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {"events": {}}


def save_state(state):
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=1, sort_keys=True) + "\n")


def compute_diff(old_events, new_events, scope_start):
    added = {k: v for k, v in new_events.items() if k not in old_events}
    changed = {k: v for k, v in new_events.items() if k in old_events and old_events[k]["hash"] != v["hash"]}
    removed = {k: v for k, v in old_events.items() if k not in new_events and v["date"] >= scope_start.isoformat()}
    return added, changed, removed


def event_line(ev):
    d = date.fromisoformat(ev["date"])
    room = f" ({ev['location']})" if ev["location"] else ""
    return f"{DAY_NAMES[d.weekday()] if d.weekday() < 5 else d.strftime('%a')} {d:%d.%m} {ev['periods']} {ev['summary']}{room}"


def gcal_service():
    from google.oauth2 import service_account
    from googleapiclient.discovery import build

    info = json.loads(os.environ["GOOGLE_SERVICE_ACCOUNT_JSON"])
    creds = service_account.Credentials.from_service_account_info(info, scopes=["https://www.googleapis.com/auth/calendar"])
    return build("calendar", "v3", credentials=creds, cache_discovery=False)


def gcal_body(key, ev):
    return {
        "summary": ev["summary"],
        "location": ev["location"],
        "description": ev["description"],
        "start": {"dateTime": ev["start"], "timeZone": str(TZ)},
        "end": {"dateTime": ev["end"], "timeZone": str(TZ)},
        "extendedProperties": {"private": {"edupage_key": key}},
    }


def sync_google(state_events, added, changed, removed):
    from googleapiclient.errors import HttpError

    service = gcal_service()
    cal = os.environ["GOOGLE_CALENDAR_ID"]
    for key, ev in removed.items():
        gid = state_events[key].get("gcal_id")
        if gid:
            try:
                service.events().delete(calendarId=cal, eventId=gid).execute()
            except HttpError as e:
                if e.resp.status not in (404, 410):
                    raise
    for key, ev in {**added, **changed}.items():
        gid = state_events.get(key, {}).get("gcal_id")
        body = gcal_body(key, ev)
        if gid:
            try:
                service.events().update(calendarId=cal, eventId=gid, body=body).execute()
                continue
            except HttpError as e:
                if e.resp.status not in (404, 410):
                    raise
        ev["gcal_id"] = service.events().insert(calendarId=cal, body=body).execute()["id"]


def ics_escape(s):
    return s.replace("\\", "\\\\").replace(";", "\;").replace(",", "\\,").replace("\n", "\\n")


def ics_time(iso):
    return datetime.fromisoformat(iso).astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def write_ics(events):
    now = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        f"PRODID:-//edupage-sync//{SCHOOL}//LV",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{ics_escape(CLASS_NAME)}",
        f"X-WR-TIMEZONE:{TZ}",
        "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
        "X-PUBLISHED-TTL:PT1H",
    ]
    for key in sorted(events, key=lambda k: events[k]["start"]):
        ev = events[key]
        lines += [
            "BEGIN:VEVENT",
            f"UID:{hashlib.sha1(key.encode()).hexdigest()}@{SCHOOL}.edupage",
            f"DTSTAMP:{now}",
            f"DTSTART:{ics_time(ev['start'])}",
            f"DTEND:{ics_time(ev['end'])}",
            f"SUMMARY:{ics_escape(ev['summary'])}",
        ]
        if ev["location"]:
            lines.append(f"LOCATION:{ics_escape(ev['location'])}")
        lines.append(f"DESCRIPTION:{ics_escape(ev['description'])}")
        lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")
    ICS_FILE.parent.mkdir(parents=True, exist_ok=True)
    ICS_FILE.write_text("\r\n".join(lines) + "\r\n")


def write_site_data(events, versions, added, changed, removed, subs=None):
    now = datetime.now(TZ).isoformat(timespec="seconds")
    changes = json.loads(CHANGES_FILE.read_text()) if CHANGES_FILE.exists() else []
    if added or changed or removed:
        entry = {"time": now, "versions": [v for _, v in versions], "added": [], "changed": [], "removed": []}
        for name, group in (("added", added), ("changed", changed), ("removed", removed)):
            entry[name] = [event_line(group[k]) for k in sorted(group, key=lambda k: group[k]["start"])]
        changes.insert(0, entry)
        CHANGES_FILE.write_text(json.dumps(changes[:50], ensure_ascii=False, indent=1) + "\n")
    data = {
        "school": SCHOOL,
        "className": CLASS_NAME,
        "timezone": str(TZ),
        "updated": now,
        "versions": [{"weekStart": ws.isoformat(), "num": num} for ws, num in versions],
        "bells": bells.SCHEDULES,
        "substitutions": sorted((subs or {}).values(), key=lambda r: (r["date"], r["period"])),
        "events": [{k: v for k, v in ev.items() if k not in ("hash", "gcal_id")} for _, ev in sorted(events.items(), key=lambda kv: kv[1]["start"])],
    }
    DATA_FILE.write_text(json.dumps(data, ensure_ascii=False) + "\n")


def fetch_substitutions(today, overrides):
    rows = []
    for i in range(0, 8):
        d = today + timedelta(days=i)
        if d.weekday() >= 5 or bells.is_holiday(d):
            continue
        page = api("substitution/server/viewer.js?__func=getSubstViewerDayDataHtml", [None, {"date": d.isoformat(), "mode": "classes"}])
        rows += substitutions.parse(page, CLASS_SHORT, fix_name, d.isoformat())
    return {substitutions.key(r): r for r in rows}


def discord_text(title, lines, color):
    url = os.environ.get("DISCORD_WEBHOOK_URL")
    if not url:
        return
    requests.post(url, json={"embeds": [{"title": title, "description": "\n".join(lines[:30]), "color": color}]}, timeout=30).raise_for_status()


def footer_text():
    return f"{SITE_URL.replace('https://', '').rstrip('/')} · atjaunināts {datetime.now(TZ):%d.%m. %H:%M}"


def week_days(ws, events):
    return [((ws + timedelta(days=i)).isoformat(), [e for e in events.values() if e["date"] == (ws + timedelta(days=i)).isoformat()]) for i in range(5)]


def send_week_image(title, ws, events, subs, caption):
    IMG_DIR.mkdir(exist_ok=True)
    by_date = {}
    for r in subs.values():
        by_date.setdefault(r["date"], []).append(r)
    path = render.week_image(CLASS_NAME, title, week_days(ws, events), by_date, IMG_DIR / f"week-{ws}.png", footer_text())
    return whatsapp.send_image(str(path), caption)


def is_school_day(d):
    return d.weekday() < 5 and not bells.is_holiday(d)


def notify_discord(added, changed, removed, versions):
    url = os.environ.get("DISCORD_WEBHOOK_URL")
    if not url:
        return
    lines = []
    for mark, group in (("➕", added), ("✏️", changed), ("➖", removed)):
        for key in sorted(group, key=lambda k: group[k]["start"]):
            lines.append(f"{mark} {event_line(group[key])}")
    shown = lines[:25]
    if len(lines) > 25:
        shown.append(f"… vēl {len(lines) - 25}")
    embed = {
        "title": f"Stundu saraksts atjaunināts — {CLASS_NAME}",
        "description": "\n".join(shown),
        "color": 0x2ECC71 if not removed and not changed else 0xF39C12,
        "footer": {"text": f"Pievienotas {len(added)} · Mainītas {len(changed)} · Dzēstas {len(removed)} · versijas {', '.join(v for _, v in versions)}"},
        "url": f"https://{SCHOOL}.edupage.org/timetable/view.php",
    }
    r = requests.post(url, json={"embeds": [embed]}, timeout=30)
    r.raise_for_status()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    today = datetime.now(TZ).date()
    versions = fetch_versions(today)
    if not versions:
        print("No visible timetable versions in range; nothing to do.")
        return
    overrides = bells.load_overrides()
    new_events = {}
    for week_start, tt_num in versions:
        new_events.update(build_events(fetch_tables(tt_num), week_start, tt_num, overrides))
    print(f"Versions: {versions}; events: {len(new_events)}")

    state = load_state()
    old_events = state["events"]
    added, changed, removed = compute_diff(old_events, new_events, versions[0][0])
    print(f"added={len(added)} changed={len(changed)} removed={len(removed)}")
    for mark, group in (("+", added), ("~", changed), ("-", removed)):
        for key in sorted(group, key=lambda k: group[k]["start"]):
            print(mark, event_line(group[key]))

    subs_new = fetch_substitutions(today, overrides)
    subs_old = state.get("substitutions", {})
    subs_added = [r for k, r in subs_new.items() if k not in subs_old]
    subs_removed = [r for k, r in subs_old.items() if k not in subs_new and r["date"] >= today.isoformat()]
    print(f"substitutions: {len(subs_new)} current, +{len(subs_added)} -{len(subs_removed)}")

    seen_versions = state.get("seen_versions")
    new_versions = [] if seen_versions is None else [(ws, num) for ws, num in versions if num not in seen_versions]

    now = datetime.now(TZ)
    tomorrow = today + timedelta(days=1)
    send_daily = is_school_day(tomorrow) and now.hour >= DAILY_HOUR and state.get("last_daily") != today.isoformat()

    if args.dry_run:
        write_ics({**old_events, **new_events})
        write_site_data({**old_events, **new_events}, versions, {}, {}, {}, subs_new)
        print("--- vakara ziņas priekšskatījums (rīt) ---")
        print(messages.daily(CLASS_NAME, tomorrow.isoformat(), [e for e in new_events.values() if e["date"] == tomorrow.isoformat()],
                             [r for r in subs_new.values() if r["date"] == tomorrow.isoformat()], []))
        return

    if added or changed or removed:
        if os.environ.get("GOOGLE_CALENDAR_ID") and os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON"):
            sync_google(old_events, added, changed, removed)
        for key in removed:
            del old_events[key]
        for key, ev in {**added, **changed}.items():
            gid = ev.get("gcal_id") or old_events.get(key, {}).get("gcal_id")
            old_events[key] = {k: v for k, v in ev.items() if k != "gcal_id"}
            if gid:
                old_events[key]["gcal_id"] = gid
        notify_discord(added, changed, removed, versions)
        if not new_versions:
            dates = sorted({ev["date"] for g in (added, changed, removed) for ev in g.values()})
            weeks = sorted({date.fromisoformat(d) - timedelta(days=date.fromisoformat(d).weekday()) for d in dates})
            n = len(added) + len(changed) + len(removed)
            for ws in weeks:
                send_week_image(f"Izmaiņas stundu sarakstā {ws:%d.%m.}–{ws + timedelta(days=4):%d.%m.}", ws, new_events, subs_new,
                                f"*Izmaiņas stundu sarakstā* ({n})\n{SITE_URL}")

    for ws, num in new_versions:
        send_week_image(f"Stundu saraksts {ws:%d.%m.}–{ws + timedelta(days=4):%d.%m.}", ws, new_events, subs_new,
                        f"*Jauns stundu saraksts {ws:%d.%m.}–{ws + timedelta(days=4):%d.%m.}*\n{SITE_URL}")
    state["seen_versions"] = sorted({num for _, num in versions} | set(seen_versions or []))[-20:]

    if subs_added or subs_removed:
        text = messages.substitutions(subs_added, subs_removed)
        discord_text(f"Aizvietošana — {CLASS_NAME}", text.split("\n")[1:], 0xE67E22)
        IMG_DIR.mkdir(exist_ok=True)
        for iso in sorted({r["date"] for r in subs_added + subs_removed}):
            path = render.day_image(CLASS_NAME, iso, [e for e in new_events.values() if e["date"] == iso],
                                    [r for r in subs_new.values() if r["date"] == iso], IMG_DIR / f"day-{iso}.png", footer_text())
            cancelled = [r for r in subs_removed if r["date"] == iso]
            note = f"\n_(atcelts: {', '.join(r['period'] + '. st.' for r in cancelled)})_" if cancelled else ""
            whatsapp.send_image(str(path), f"*Aizvietošana {messages._d(iso)}*{note}\n{SITE_URL}")
    state["substitutions"] = {k: r for k, r in subs_new.items()}

    if send_daily:
        since = state.get("last_daily_at") or ""
        recent = []
        if CHANGES_FILE.exists():
            for c in json.loads(CHANGES_FILE.read_text()):
                if c["time"] > since:
                    recent += [f"➕ {l}" for l in c["added"]] + [f"✏️ {l}" for l in c["changed"]] + [f"➖ {l}" for l in c["removed"]]
        if added or changed or removed:
            for mark, group in (("➕", added), ("✏️", changed), ("➖", removed)):
                recent += [f"{mark} {event_line(group[k])}" for k in group]
        recent = list(dict.fromkeys(recent))
        target = tomorrow.isoformat()
        day_subs = [r for r in subs_new.values() if r["date"] == target]
        IMG_DIR.mkdir(exist_ok=True)
        path = render.day_image(CLASS_NAME, target, [e for e in new_events.values() if e["date"] == target],
                                day_subs, IMG_DIR / f"day-{target}.png", footer_text())
        caption = f"*Rīt: {messages._d(target)}* · {CLASS_NAME}"
        caption += f"\nAizvietošana: {len(day_subs)}" if day_subs else ""
        caption += f"\nIzmaiņas kopš pēdējās ziņas: {len(recent)}" if recent else "\nIzmaiņu nav"
        caption += f"\n{SITE_URL}"
        sent = whatsapp.send_image(str(path), caption)
        if sent:
            state["last_daily"] = today.isoformat()
            state["last_daily_at"] = now.isoformat(timespec="seconds")

    cutoff = (today - timedelta(days=KEEP_DAYS)).isoformat()
    state["events"] = {k: v for k, v in old_events.items() if v["date"] >= cutoff}
    write_ics(state["events"])
    write_site_data({**state["events"], **new_events}, versions, added, changed, removed, subs_new)
    save_state(state)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        raise
