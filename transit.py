import csv
import io
import json
import math
import sys
import zipfile
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

FEEDS = [
    ("atd", "https://www.atd.lv/sites/default/files/GTFS/gtfs-latvia-lv.zip"),
    ("vivi", "https://vivi.lv/uploads/GTFS.zip"),
]
TZ = ZoneInfo("Europe/Riga")
DAYS = 60
FARE_SHARDS = 128
PLACE_RADIUS_M = 1000
TRANSFER_RADIUS_M = 400
TRANSFER_NEIGHBOURS = 8
WALK_M_PER_MIN = 75
MIN_TRANSFER_MIN = 3
MIN_STOPS = 1000
MIN_TRIPS = 1000
OUT_DIR = Path(__file__).resolve().parent / "out"


def download(url):
    response = requests.get(url, timeout=120, headers={"User-Agent": "edupage-sync transit builder"})
    response.raise_for_status()
    return zipfile.ZipFile(io.BytesIO(response.content))


def read(archive, name):
    if name not in archive.namelist():
        return []
    with archive.open(name) as raw:
        text = io.TextIOWrapper(raw, encoding="utf-8-sig")
        return [{k.strip(): (v or "").strip() for k, v in row.items() if k} for row in csv.DictReader(text, skipinitialspace=True)]


def minutes(hms):
    h, m, _ = hms.split(":")
    return int(h) * 60 + int(m)


def distance_m(a, b):
    lat = math.radians((a[0] + b[0]) / 2)
    return math.hypot((a[0] - b[0]) * 111_320, (a[1] - b[1]) * 111_320 * math.cos(lat))


def active_days(calendar, exceptions, start):
    days = {}
    for row in calendar:
        first = datetime.strptime(row["start_date"], "%Y%m%d").date()
        last = datetime.strptime(row["end_date"], "%Y%m%d").date()
        weekdays = [row[d] == "1" for d in ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")]
        days[row["service_id"]] = {i for i in range(DAYS) if first <= start + timedelta(days=i) <= last and weekdays[(start + timedelta(days=i)).weekday()]}
    for row in exceptions:
        offset = (datetime.strptime(row["date"], "%Y%m%d").date() - start).days
        if not 0 <= offset < DAYS:
            continue
        bucket = days.setdefault(row["service_id"], set())
        if row["exception_type"] == "1":
            bucket.add(offset)
        elif row["exception_type"] == "2":
            bucket.discard(offset)
    return days


def bitset(offsets):
    return format(sum(1 << i for i in offsets), "x").zfill(math.ceil(DAYS / 4))


def stop_flags(row):
    return str((1 if row.get("pickup_type") == "1" else 0) + (2 if row.get("drop_off_type") == "1" else 0))


def cluster_places(stops):
    places, place_of = [], []
    by_name = {}
    for idx, (name, lat, lon) in enumerate(stops):
        candidates = by_name.setdefault(name, [])
        match = next((p for p in candidates if distance_m((lat, lon), places[p][1:]) <= PLACE_RADIUS_M), None)
        if match is None:
            match = len(places)
            places.append([name, lat, lon])
            candidates.append(match)
        place_of.append(match)
    return places, place_of


def walking_transfers(stops):
    cell = TRANSFER_RADIUS_M / 111_320
    grid = {}
    for idx, (_, lat, lon) in enumerate(stops):
        grid.setdefault((int(lat / cell), int(lon / cell)), []).append(idx)
    transfers = []
    for idx, (_, lat, lon) in enumerate(stops):
        gx, gy = int(lat / cell), int(lon / cell)
        near = []
        for dx in (-1, 0, 1):
            for dy in (-2, -1, 0, 1, 2):
                for other in grid.get((gx + dx, gy + dy), []):
                    if other != idx:
                        d = distance_m((lat, lon), stops[other][1:])
                        if d <= TRANSFER_RADIUS_M:
                            near.append((d, other))
        for d, other in sorted(near)[:TRANSFER_NEIGHBOURS]:
            transfers.append([idx, other, max(MIN_TRANSFER_MIN, math.ceil(d / WALK_M_PER_MIN))])
    return transfers


def build(start):
    agencies, routes, stops, trips, services = [], [], [], [], []
    stop_index, service_index = {}, {}
    fares = {}
    feeds = []
    for feed, url in FEEDS:
        archive = download(url)
        feeds.append({"name": feed, "url": url})
        days = active_days(read(archive, "calendar.txt"), read(archive, "calendar_dates.txt"), start)
        agency_index = {}
        for row in read(archive, "agency.txt"):
            agency_index[row.get("agency_id", "")] = len(agencies)
            agencies.append([row["agency_name"], row.get("agency_url", "")])
        route_index = {}
        for row in read(archive, "routes.txt"):
            agency = agency_index.get(row.get("agency_id", ""), next(iter(agency_index.values()), 0))
            route_index[row["route_id"]] = len(routes)
            routes.append([row.get("route_short_name", ""), row.get("route_long_name", ""), agency, int(row.get("route_type") or 3), [str(len(routes)), feed]])
        raw_stops = {row["stop_id"]: row for row in read(archive, "stops.txt") if row.get("location_type", "") in ("", "0")}
        times = {}
        for row in read(archive, "stop_times.txt"):
            times.setdefault(row["trip_id"], []).append(row)
        for row in read(archive, "trips.txt"):
            offsets = days.get(row["service_id"])
            stop_rows = sorted(times.get(row["trip_id"], []), key=lambda r: int(r["stop_sequence"]))
            if not offsets or len(stop_rows) < 2 or row["route_id"] not in route_index or any(r["stop_id"] not in raw_stops for r in stop_rows):
                continue
            pattern = bitset(offsets)
            if pattern not in service_index:
                service_index[pattern] = len(services)
                services.append(pattern)
            stop_ids = []
            for r in stop_rows:
                key = (feed, r["stop_id"])
                if key not in stop_index:
                    s = raw_stops[r["stop_id"]]
                    stop_index[key] = len(stops)
                    stops.append((s["stop_name"], round(float(s["stop_lat"]), 5), round(float(s["stop_lon"]), 5)))
                stop_ids.append(stop_index[key])
            stamps = [minutes(r["departure_time"] or r["arrival_time"]) for r in stop_rows[:-1]] + [minutes(stop_rows[-1]["arrival_time"] or stop_rows[-1]["departure_time"])]
            if any(b < a for a, b in zip(stamps, stamps[1:])):
                continue
            trip = [route_index[row["route_id"]], service_index[pattern], row.get("trip_headsign", ""), stop_ids, [stamps[0]] + [b - a for a, b in zip(stamps, stamps[1:])]]
            flags = "".join(stop_flags(r) for r in stop_rows)
            if flags.strip("0"):
                trip.append(flags)
            trips.append(trip)
        zone_stops = {}
        for stop_id, s in raw_stops.items():
            if (feed, stop_id) in stop_index:
                zone_stops.setdefault(s.get("zone_id") or stop_id, []).append(stop_index[(feed, stop_id)])
        prices = {row["fare_id"]: float(row["price"]) for row in read(archive, "fare_attributes.txt") if row.get("price") and float(row["price"]) > 0}
        for row in read(archive, "fare_rules.txt"):
            price = prices.get(row["fare_id"])
            origins = zone_stops.get(row.get("origin_id", ""))
            destinations = zone_stops.get(row.get("destination_id", ""))
            if price is None or not origins or not destinations:
                continue
            group = str(route_index[row["route_id"]]) if row.get("route_id") in route_index else feed if not row.get("route_id") else None
            if group is None:
                continue
            table = fares.setdefault(group, {})
            for o in origins:
                for d in destinations:
                    table.setdefault(str(o), {})[str(d)] = price
    places, place_of = cluster_places(stops)
    core = {
        "generated": datetime.now(TZ).isoformat(timespec="seconds"),
        "start": start.isoformat(),
        "days": DAYS,
        "fareShards": FARE_SHARDS,
        "agencies": agencies,
        "routes": routes,
        "places": places,
        "stops": [[name, lat, lon, place_of[i]] for i, (name, lat, lon) in enumerate(stops)],
        "services": services,
        "trips": trips,
        "transfers": walking_transfers(stops),
    }
    return core, fares, feeds


def shard_of(group):
    return int(group) % FARE_SHARDS if group.isdigit() else sum(ord(ch) for ch in group) % FARE_SHARDS


def main():
    start = datetime.now(TZ).date()
    core, fares, feeds = build(start)
    if len(core["stops"]) < MIN_STOPS or len(core["trips"]) < MIN_TRIPS:
        sys.exit(f"refusing to publish: {len(core['stops'])} stops, {len(core['trips'])} trips")
    shards = [{} for _ in range(FARE_SHARDS)]
    for group, table in fares.items():
        shards[shard_of(group)][group] = table
    dump = lambda value: json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    meta = {"generated": core["generated"], "start": core["start"], "days": DAYS, "stops": len(core["stops"]), "trips": len(core["trips"]), "feeds": feeds}
    entries = [{"key": "transit:core", "value": dump(core)}, {"key": "transit:meta", "value": dump(meta)}]
    entries += [{"key": f"transit:fares:{i}", "value": dump(shard)} for i, shard in enumerate(shards)]
    OUT_DIR.mkdir(exist_ok=True)
    (OUT_DIR / "kv.json").write_text(json.dumps(entries, ensure_ascii=False))
    (OUT_DIR / "core.json").write_text(entries[0]["value"])
    sizes = sorted(len(e["value"].encode()) for e in entries[2:])
    print(f"stops={meta['stops']} trips={meta['trips']} places={len(core['places'])} transfers={len(core['transfers'])} core={len(entries[0]['value'].encode()) / 1e6:.2f} MB fares total={sum(sizes) / 1e6:.1f} MB max={sizes[-1] / 1e3:.0f} kB median={sizes[len(sizes) // 2] / 1e3:.0f} kB")


if __name__ == "__main__":
    main()
