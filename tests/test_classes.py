import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import classes


def lesson(day, start, summary, room="101.", teacher="A.B", end=None):
    return {"date": day, "start": f"{day}T{start}:00+02:00", "end": f"{day}T{end or start}:40+02:00", "periods": "1.",
            "summary": summary, "location": room, "teachers": [teacher], "groups": [], "dayType": "midweek", "slots": None}


WEEK = "2026-11-16"
TODAY = date(2026, 11, 12)


class DiffWeekTest(unittest.TestCase):
    def test_room_change_is_changed_not_added(self):
        delta = classes.diff_week([lesson("2026-11-16", "08", "Fizika")], [lesson("2026-11-16", "08", "Fizika", room="204.")])
        self.assertEqual(delta["added"], [])
        self.assertEqual(delta["removed"], [])
        self.assertEqual(delta["changed"][0]["fields"], ["room"])

    def test_time_change_same_day(self):
        delta = classes.diff_week([lesson("2026-11-16", "08", "Fizika")], [lesson("2026-11-16", "10", "Fizika")])
        self.assertEqual(delta["changed"][0]["fields"], ["time"])

    def test_moved_to_other_day(self):
        delta = classes.diff_week([lesson("2026-11-16", "08", "Fizika")], [lesson("2026-11-18", "08", "Fizika")])
        self.assertEqual(len(delta["moved"]), 1)
        self.assertEqual(delta["changed"], [])

    def test_added_and_cancelled(self):
        delta = classes.diff_week([lesson("2026-11-16", "08", "Fizika")], [lesson("2026-11-16", "08", "Ķīmija")])
        self.assertEqual([e["summary"] for e in delta["added"]], ["Ķīmija"])
        self.assertEqual([e["summary"] for e in delta["removed"]], ["Fizika"])

    def test_identical_week_has_no_changes(self):
        events = [lesson("2026-11-16", "08", "Fizika"), lesson("2026-11-17", "09", "Ķīmija")]
        self.assertFalse(any(classes.diff_week(events, list(events)).values()))


class SnapshotTest(unittest.TestCase):
    def previous(self):
        return {"weeks": [{"weekStart": "2026-11-09", "version": "522"}, {"weekStart": WEEK, "version": "523"}],
                "events": [lesson("2026-11-10", "08", "Fizika"), lesson("2026-11-16", "08", "Fizika")], "substitutions": []}

    def test_first_run_is_baseline_without_entries(self):
        snapshot, entries = classes.build_snapshot(None, {WEEK: ("523", [lesson("2026-11-16", "08", "Fizika")])}, [], TODAY, "t")
        self.assertEqual(entries, [])
        self.assertEqual(len(snapshot["events"]), 1)

    def test_missing_week_keeps_last_known_events(self):
        snapshot, entries = classes.build_snapshot(self.previous(), {WEEK: ("523", [lesson("2026-11-16", "08", "Fizika")])}, [], TODAY, "t")
        self.assertEqual(entries, [])
        self.assertIn("2026-11-10", [e["date"] for e in snapshot["events"]])

    def test_new_week_is_published_entry(self):
        fetched = {"2026-11-23": ("524", [lesson("2026-11-23", "08", "Fizika")])}
        _, entries = classes.build_snapshot(self.previous(), fetched, [], TODAY, "t")
        self.assertEqual([(e["kind"], e["weekStart"], e["lessons"]) for e in entries], [("published", "2026-11-23", 1)])

    def test_changed_week_is_updated_entry(self):
        fetched = {WEEK: ("525", [lesson("2026-11-16", "08", "Fizika", teacher="C.D")])}
        _, entries = classes.build_snapshot(self.previous(), fetched, [], TODAY, "t")
        self.assertEqual(entries[0]["kind"], "updated")
        self.assertEqual(entries[0]["changed"][0]["fields"], ["teacher"])

    def test_new_substitution_is_logged(self):
        sub = {"date": "2026-11-13", "period": "2", "text": "Atcelts", "kind": "remove"}
        _, entries = classes.build_snapshot(self.previous(), {}, [sub], TODAY, "t")
        self.assertEqual(entries[0]["kind"], "substitutions")
        self.assertEqual(entries[0]["added"], [sub])


if __name__ == "__main__":
    unittest.main()
