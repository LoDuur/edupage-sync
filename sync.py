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
import urllib3.util.connection
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

urllib3.util.connection.HAS_IPV6 = False
SESSION = requests.Session()
SESSION.mount("https://", HTTPAdapter(max_retries=Retry(total=4, backoff_factor=2, status_forcelist=[500, 502, 503, 504])))

SCHOOL = os.environ.get("EDUPAGE_SCHOOL", "valteh")
CLASS_NAME = os.environ.get("CLASS_NAME", "2.k. 28.grupa")
TZ = ZoneInfo(os.environ.get("TIMEZONE", "Europe/Riga"))
BASE = f"https://{SCHOOL}.edupage.org/timetable/server"
ROOT = Path(__file__).resolve().parent
STATE_FILE = ROOT / "state.json"
ICS_FILE = ROOT / "docs" / "timetable.ics"
DATA_FILE = ROOT / "docs" / "data.json"
CHANGES_FILE = ROOT / "docs" / "changes.json"
DAY_NAMES = ["Pr", "Ot", "Tr", "Ce", "Pk"]
PAST_DAYS = 14
FUTURE_DAYS = 60
KEEP_DAYS = 60


def api(path, args):
    r = SESSION.post(
        f"{BASE}/{path}",
        json={"__args": args, "__gsh": "00000000"},
        headers={"Content-Type": "application/json"},
        timeout=30,
    )
    r.raise_for_status()
    return r.json()["r"]


def fetch_versions(today):
    data = api("ttviewer.js?__func=getTTViewerData", [None, today.year])
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
    data = api("regulartt.js?__func=regularttGetData", [None, str(tt_num)])
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


def build_events(tables, week_start, tt_num):
    classes = [c for c in tables["classes"].values() if c["name"].strip() == CLASS_NAME.strip()]
    if not classes:
        raise SystemExit(f"Class '{CLASS_NAME}' not found. Available: {[c['name'] for c in tables['classes'].values()]}")
    class_id = classes[0]["id"]
    periods = tables["periods"]
    events = {}
    for card in tables["cards"].values():
        lesson = tables["lessons"].get(card["lessonid"])
        if not lesson or class_id not in lesson["classids"] or not card["period"] or not card["days"]:
            continue
        subject = tables["subjects"].get(lesson["subjectid"], {}).get("name", "?")
        groups = [tables["groups"][g] for g in lesson["groupids"] if g in tables["groups"] and tables["groups"][g]["classid"] == class_id]
        group_names = [g["name"] for g in groups if not g["entireclass"]]
        teachers = [tables["teachers"][t]["short"] for t in lesson["teacherids"] if t in tables["teachers"]]
        rooms = [tables["classrooms"][r]["short"] for r in card["classroomids"] if r in tables["classrooms"]]
        first = int(card["period"])
        last = first + int(lesson.get("durationperiods") or 1) - 1
        for day_idx, bit in enumerate(card["days"]):
            if bit != "1":
                continue
            day = week_start + timedelta(days=day_idx)
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


def write_site_data(events, versions, added, changed, removed):
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
        "events": [{k: v for k, v in ev.items() if k not in ("hash", "gcal_id")} for _, ev in sorted(events.items(), key=lambda kv: kv[1]["start"])],
    }
    DATA_FILE.write_text(json.dumps(data, ensure_ascii=False) + "\n")


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
    new_events = {}
    for week_start, tt_num in versions:
        new_events.update(build_events(fetch_tables(tt_num), week_start, tt_num))
    print(f"Versions: {versions}; events: {len(new_events)}")

    state = load_state()
    old_events = state["events"]
    added, changed, removed = compute_diff(old_events, new_events, versions[0][0])
    print(f"added={len(added)} changed={len(changed)} removed={len(removed)}")
    for mark, group in (("+", added), ("~", changed), ("-", removed)):
        for key in sorted(group, key=lambda k: group[k]["start"]):
            print(mark, event_line(group[key]))

    if args.dry_run:
        write_ics({**old_events, **new_events})
        write_site_data({**old_events, **new_events}, versions, {}, {}, {})
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

    cutoff = (today - timedelta(days=KEEP_DAYS)).isoformat()
    state["events"] = {k: v for k, v in old_events.items() if v["date"] >= cutoff}
    write_ics(state["events"])
    write_site_data({**state["events"], **new_events}, versions, added, changed, removed)
    save_state(state)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        raise
