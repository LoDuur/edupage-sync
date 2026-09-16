import json
from datetime import date, timedelta
from pathlib import Path

OVERRIDES_FILE = Path(__file__).resolve().parent / "overrides.json"

SCHEDULES = {
    "monday": ["8:10-8:50", "9:20-10:00", "10:10-10:50", "11:00-11:40", "11:50-12:30", "12:40-13:20", "13:30-14:10", "14:20-15:00", "15:10-15:50", "16:00-16:40"],
    "midweek": ["8:10-8:50", "9:10-9:50", "10:00-10:40", "10:50-11:30", "11:40-12:20", "12:30-13:10", "13:20-14:00", "14:10-14:50", "15:00-15:40", "15:50-16:30"],
    "friday": ["8:10-8:50", "9:00-9:40", "9:45-10:25", "10:30-11:10", "11:15-11:55", "12:00-12:40", "12:45-13:25", "13:30-14:10", "14:15-14:55", "15:00-15:40"],
    "short": ["8:10-8:40", "9:00-9:30", "9:40-10:10", "10:20-10:50", "11:00-11:30", "11:40-12:10", "12:20-12:50", "13:00-13:30", "13:40-14:10", "14:20-14:50"],
}
WEEKDAY_TYPE = {0: "monday", 1: "midweek", 2: "midweek", 3: "midweek", 4: "friday"}


def _minutes(hhmm):
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


TABLES = {
    name: {i + 1: tuple(_minutes(t) for t in slot.split("-")) for i, slot in enumerate(slots)}
    for name, slots in SCHEDULES.items()
}


def easter(year):
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month, day = divmod(h + l - 7 * m + 114, 31)
    return date(year, month, day + 1)


def public_holidays(year):
    e = easter(year)
    days = {
        date(year, 1, 1),
        e - timedelta(days=2),
        e,
        e + timedelta(days=1),
        date(year, 5, 1),
        date(year, 5, 4),
        e + timedelta(days=49),
        date(year, 6, 23),
        date(year, 6, 24),
        date(year, 11, 18),
        date(year, 12, 24),
        date(year, 12, 25),
        date(year, 12, 26),
        date(year, 12, 31),
    }
    may = date(year, 5, 1)
    days.add(may + timedelta(days=(6 - may.weekday()) % 7 + 7))
    for d in (date(year, 5, 4), date(year, 11, 18)):
        if d.weekday() >= 5:
            days.add(d + timedelta(days=7 - d.weekday()))
    return days


def is_holiday(d):
    return d in public_holidays(d.year)


def load_overrides():
    if OVERRIDES_FILE.exists():
        return json.loads(OVERRIDES_FILE.read_text())
    return {}


def day_type(d, overrides=None):
    override = (overrides if overrides is not None else load_overrides()).get(d.isoformat())
    if override in SCHEDULES:
        return override
    if is_holiday(d + timedelta(days=1)):
        return "short"
    return WEEKDAY_TYPE.get(d.weekday(), "midweek")


def window(d, first_period, last_period, overrides=None):
    table = TABLES[day_type(d, overrides)]
    if first_period in table and last_period in table:
        return table[first_period][0], table[last_period][1]
    return None
