import hashlib
import json
import re
import unicodedata
from datetime import date, timedelta
from pathlib import Path

import bells
import substitutions

OUT_DIR = Path(__file__).resolve().parent / "docs" / "classes"
CHANGES_LIMIT = 100
KEEP_PAST_DAYS = 14
EVENT_FIELDS = ("date", "start", "end", "periods", "summary", "location", "teachers", "groups", "dayType", "slots")


def slugify(name):
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")


def course_of(name):
    match = re.match(r"\s*(\d+)\s*\.\s*k", name)
    return int(match[1]) if match else None


def week_of(iso):
    day = date.fromisoformat(iso)
    return (day - timedelta(days=day.weekday())).isoformat()


def compact(event):
    return {field: event.get(field) for field in EVENT_FIELDS}


def _same_lesson(a, b):
    return a["date"] == b["date"] and a["summary"] == b["summary"]


def _changed_fields(before, after):
    fields = []
    if before["location"] != after["location"]:
        fields.append("room")
    if before["teachers"] != after["teachers"]:
        fields.append("teacher")
    if before["start"] != after["start"] or before["end"] != after["end"]:
        fields.append("time")
    return fields


def _take_pairs(old, new, matches):
    pairs = []
    for before in list(old):
        after = next((candidate for candidate in new if matches(before, candidate)), None)
        if after is not None:
            old.remove(before)
            new.remove(after)
            pairs.append((before, after))
    return pairs


def diff_week(old_events, new_events):
    old = sorted(old_events, key=lambda e: e["start"])
    new = sorted(new_events, key=lambda e: e["start"])
    _take_pairs(old, new, lambda a, b: a == b)
    changed = [{"before": a, "after": b, "fields": _changed_fields(a, b)} for a, b in _take_pairs(old, new, lambda a, b: _same_lesson(a, b) and a["start"] == b["start"])]
    changed += [{"before": a, "after": b, "fields": _changed_fields(a, b)} for a, b in _take_pairs(old, new, _same_lesson)]
    moved = [{"before": a, "after": b} for a, b in _take_pairs(old, new, lambda a, b: a["summary"] == b["summary"])]
    return {"added": new, "removed": old, "changed": changed, "moved": moved}


def _entry(kind, detected_at, week_start, body):
    digest = hashlib.sha1(json.dumps([kind, week_start, body], sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:12]
    return {"id": digest, "kind": kind, "detectedAt": detected_at, "weekStart": week_start, **body}


def build_snapshot(previous, fetched_weeks, subs, today, detected_at):
    keep_from = (today - timedelta(days=KEEP_PAST_DAYS + today.weekday())).isoformat()
    old_weeks = {w["weekStart"]: w for w in (previous or {}).get("weeks", []) if w["weekStart"] >= keep_from}
    old_events = [e for e in (previous or {}).get("events", []) if week_of(e["date"]) >= keep_from]
    entries = []
    weeks = dict(old_weeks)
    events = [e for e in old_events if week_of(e["date"]) not in fetched_weeks]
    for week_start, (version, week_events) in sorted(fetched_weeks.items()):
        events += week_events
        weeks[week_start] = {"weekStart": week_start, "version": version}
        if previous is None:
            continue
        if week_start not in old_weeks:
            entries.append(_entry("published", detected_at, week_start, {"version": version, "lessons": len(week_events)}))
            continue
        delta = diff_week([e for e in old_events if week_of(e["date"]) == week_start], week_events)
        if any(delta.values()):
            entries.append(_entry("updated", detected_at, week_start, {"version": version, **delta}))
    if previous is not None:
        old_subs = {substitutions.key(r): r for r in previous.get("substitutions", []) if r["date"] >= today.isoformat()}
        new_subs = {substitutions.key(r): r for r in subs}
        added = [r for k, r in new_subs.items() if k not in old_subs]
        removed = [r for k, r in old_subs.items() if k not in new_subs]
        if added or removed:
            entries.append(_entry("substitutions", detected_at, week_of(today.isoformat()), {"added": added, "removed": removed}))
    snapshot = {
        "weeks": sorted(weeks.values(), key=lambda w: w["weekStart"]),
        "substitutions": sorted(subs, key=lambda r: (r["date"], r["period"])),
        "events": sorted(events, key=lambda e: e["start"]),
    }
    return snapshot, entries


def _read(path):
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text())
    except json.JSONDecodeError:
        return None


def _write_if_changed(path, payload, stamp_field, stamp):
    previous = _read(path)
    if previous is not None and {k: v for k, v in previous.items() if k != stamp_field} == payload:
        return False
    path.write_text(json.dumps({**payload, stamp_field: stamp}, ensure_ascii=False, separators=(",", ":")) + "\n")
    return True


def collect_classes(tables_by_version):
    found = {}
    for tables in tables_by_version.values():
        for row in tables["classes"].values():
            name = row["name"].strip()
            found.setdefault(slugify(name), {"name": name, "short": row["short"].strip()})
    return found


def publish(build_class_events, versions, tables_by_version, subst_pages, fix_name, today, detected_at, dry_run=False):
    valid = {tt: t for tt, t in tables_by_version.items() if t.get("cards") and t.get("classes")}
    classes = collect_classes(valid)
    if not classes:
        raise ValueError("no classes in any timetable version")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for slug, info in sorted(classes.items()):
        fetched = {}
        for week_start, tt_num in versions:
            tables = valid.get(tt_num)
            if tables is None or not any(r["name"].strip() == info["name"] for r in tables["classes"].values()):
                continue
            fetched[week_start.isoformat()] = (tt_num, [compact(e) for e in build_class_events(tables, week_start, tt_num, info["name"]).values()])
        subs = [r for iso, page in sorted(subst_pages.items()) for r in substitutions.parse(page, [info["short"], info["name"]], fix_name, iso)]
        class_path = OUT_DIR / f"{slug}.json"
        changes_path = OUT_DIR / f"{slug}.changes.json"
        previous = _read(class_path)
        snapshot, entries = build_snapshot(previous, fetched, subs, today, detected_at)
        if dry_run:
            print(f"class {info['name']}: {len(snapshot['events'])} events, {len(entries)} new change entries")
            continue
        if entries or not changes_path.exists():
            log = (_read(changes_path) or {}).get("entries", [])
            unsaved_run = {e["id"] for e in log if e["detectedAt"] > (previous or {}).get("updated", "")}
            log = [e for e in entries if e["id"] not in unsaved_run] + log
            changes_path.write_text(json.dumps({"id": slug, "entries": log[:CHANGES_LIMIT]}, ensure_ascii=False, separators=(",", ":")) + "\n")
        payload = {"id": slug, "name": info["name"], "short": info["short"], **snapshot}
        written += _write_if_changed(class_path, payload, "updated", detected_at)
    current_week = today - timedelta(days=today.weekday())
    published = {ws for ws, _ in versions}
    index = {
        "bells": bells.SCHEDULES,
        "weeks": [{"weekStart": ws.isoformat(), "version": tt} for ws, tt in versions],
        "nextWeek": {"weekStart": (current_week + timedelta(days=7)).isoformat(), "status": "published" if current_week + timedelta(days=7) in published else "unpublished"},
        "classes": [{"id": slug, "name": c["name"], "short": c["short"], "course": course_of(c["name"])} for slug, c in sorted(classes.items(), key=lambda kv: (course_of(kv[1]["name"]) or 99, kv[1]["name"]))],
    }
    if not dry_run:
        written += _write_if_changed(OUT_DIR / "index.json", index, "updated", detected_at)
    print(f"classes: {len(classes)} published, {written} files written")
