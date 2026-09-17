from datetime import date

DAYS = ["Pirmdiena", "Otrdiena", "Trešdiena", "Ceturtdiena", "Piektdiena", "Sestdiena", "Svētdiena"]


def _d(iso):
    d = date.fromisoformat(iso)
    return f"{DAYS[d.weekday()]}, {d:%d.%m.}"


def _hm(iso):
    return iso[11:16]


def lesson_line(ev):
    meta = " · ".join(x for x in [ev.get("location", ""), ", ".join(ev.get("teachers", []))] if x)
    return f"{ev['periods']:<6} {_hm(ev['start'])}–{_hm(ev['end'])}  {ev['summary']}" + (f" · {meta}" if meta else "")


def day_block(iso, events):
    lines = [f"*{_d(iso)}*"]
    if not events:
        lines.append("Nav stundu")
    lines += [lesson_line(e) for e in sorted(events, key=lambda e: e["start"])]
    return "\n".join(lines)


def daily(class_name, iso, events, subs, changes):
    lines = [f"*{_d(iso)}* · {class_name}"]
    if events:
        lines += [lesson_line(e) for e in sorted(events, key=lambda e: e["start"])]
        if any(e.get("dayType") == "short" for e in events):
            lines.append("_Pirmssvētku diena – 30 min stundas_")
    else:
        lines.append("Šodien nav stundu")
    if subs:
        lines += ["", "*Aizvietošana šodien*"] + [f"{s['period']}. {s['text']}" for s in subs]
    if changes:
        lines += ["", "*Izmaiņas kopš pēdējās ziņas*"] + changes
    return "\n".join(lines)


def week(class_name, version, week_start, days):
    end = date.fromordinal(week_start.toordinal() + 4)
    lines = [f"*Jauns stundu saraksts {week_start:%d.%m.}–{end:%d.%m.}* · {class_name} (v{version})", ""]
    for iso, events in days:
        lines.append(day_block(iso, events))
        lines.append("")
    return "\n".join(lines).rstrip()


def changes(added, changed, removed, event_line):
    lines = ["*Izmaiņas stundu sarakstā*"]
    for mark, group in (("➕", added), ("✏️", changed), ("➖", removed)):
        for k in sorted(group, key=lambda k: group[k]["start"]):
            lines.append(f"{mark} {event_line(group[k])}")
    return "\n".join(lines)


def substitutions(added, removed):
    lines = ["*Aizvietošana*"]
    by_date = {}
    for r in added:
        by_date.setdefault(r["date"], []).append(f"{r['period']}. {r['text']}")
    for r in removed:
        by_date.setdefault(r["date"], []).append(f"{r['period']}. {r['text']} _(atcelts)_")
    for iso in sorted(by_date):
        lines.append(f"*{_d(iso)}*")
        lines += by_date[iso]
    return "\n".join(lines)
