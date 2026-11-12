import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import bells

THURSDAY = date(2026, 11, 19)


class SubjectSlotsTest(unittest.TestCase):
    def test_physics_block_uses_its_own_times(self):
        self.assertEqual(bells.slots(THURSDAY, 2, 3, "Fizika I"), [(540, 580), (590, 630)])

    def test_physics_outside_its_periods_uses_school_table(self):
        self.assertEqual(bells.slots(THURSDAY, 10, 10, "Fizika I (Attālināti)"), [(950, 990)])

    def test_other_subjects_use_school_table(self):
        self.assertEqual(bells.slots(THURSDAY, 2, 3, "Ķīmija"), [(550, 590), (600, 640)])


if __name__ == "__main__":
    unittest.main()
