"""Tests: python3 -m unittest sheets/test_auswertung.py"""
import math
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import auswertung as A  # noqa: E402

TZ = timezone(timedelta(hours=1))
NOW = datetime(2026, 11, 5, 20, 0, tzinfo=TZ)
M = timedelta(minutes=1)


def iso(t):
    return t.isoformat()


def cgm(start, minutes, f):
    return [[iso(start + m * M), round(f(m))] for m in range(0, minutes + 1, 5)]


def lunch(days_ago, carbs, units, start, end, hour=12):
    at = datetime(2026, 11, 5, hour, 0, tzinfo=TZ) - timedelta(days=days_ago)

    def f(x):
        if x <= 10:
            return start
        p = min(1, (x - 10) / 180)
        return start + (end - start) * p + math.sin(p * math.pi) * 40

    return dict(t=iso(at), bg=None, carbs=carbs, units=units, weighed=False), cgm(at - 10 * M, 250, f)


def run(parts, entries=(), sensor=()):
    data = dict(
        generated=iso(NOW),
        entries=[p[0] for p in parts] + list(entries),
        sensor=[x for p in parts for x in p[1]] + list(sensor),
        system={},
    )
    return A.analyze(data)


class Meals(unittest.TestCase):
    def outcome(self, *a, **k):
        return run([lunch(*a, **k)]).meals[0].outcome

    def test_good(self):
        a = run([lunch(1, 60, 6, 120, 135)])
        self.assertEqual(a.meals[0].outcome, "good")
        self.assertEqual(a.meals[0].gpu, 10)

    def test_too_little(self):
        self.assertEqual(self.outcome(1, 60, 4, 120, 210), "too-little")

    def test_too_much(self):
        self.assertEqual(self.outcome(1, 60, 8, 160, 100), "too-much")

    def test_off_start(self):
        self.assertEqual(self.outcome(1, 60, 8, 230, 140), "off-start")

    def test_low_is_too_much(self):
        e, s = lunch(1, 60, 8, 120, 120)
        s[30][1] = 62
        self.assertEqual(run([(e, s)]).meals[0].outcome, "too-much")

    def test_correction_after(self):
        e, s = lunch(1, 60, 6, 120, 130)
        corr = dict(t=iso(A.parse_t(e["t"]) + 90 * M), bg=200, carbs=None, units=2)
        a = run([(e, s)], entries=[corr])
        self.assertEqual(a.meals[0].outcome, "too-little")
        self.assertEqual(a.meals[0].corr_after, 2)

    def test_second_meal(self):
        e, s = lunch(1, 60, 6, 120, 130)
        snack = dict(t=iso(A.parse_t(e["t"]) + 60 * M), carbs=20, units=None)
        a = run([(e, s)], entries=[snack])
        self.assertEqual([m.outcome for m in a.meals if m.carbs == 60], ["mixed"])

    def test_typed_value_after_3h(self):
        at = datetime(2026, 11, 4, 12, 0, tzinfo=TZ)
        entries = [dict(t=iso(at), bg=110, carbs=50, units=5), dict(t=iso(at + 170 * M), bg=125, carbs=None, units=None)]
        a = A.analyze(dict(generated=iso(NOW), entries=entries, sensor=[], system={}))
        self.assertEqual(a.meals[0].outcome, "good")

    def test_pending_then_no_data(self):
        at = NOW - timedelta(hours=4)
        entries = [dict(t=iso(at), bg=120, carbs=60, units=6)]
        a = A.analyze(dict(generated=iso(NOW), entries=entries, sensor=[], system={}))
        self.assertEqual(a.meals[0].outcome, "pending")
        a = A.analyze(dict(generated=iso(at + timedelta(hours=9)), entries=entries, sensor=[], system={}))
        self.assertEqual(a.meals[0].outcome, "no-data")


class Slots(unittest.TestCase):
    def test_estimate(self):
        a = run([lunch(1, 60, 6, 120, 130), lunch(2, 45, 5, 110, 120), lunch(3, 80, 7, 115, 140),
                 lunch(4, 60, 4, 120, 220), lunch(5, 30, 5, 140, 80)])
        s = a.slots["midday"]
        self.assertEqual((s["good"], s["little"], s["much"]), (3, 1, 1))
        self.assertEqual(s["est"], dict(gpu=10, lo=9, hi=11.5, sure=False))

    def test_sure(self):
        a = run([lunch(d, 60, 6, 120, 125) for d in range(1, 7)])
        self.assertTrue(a.slots["midday"]["est"]["sure"])

    def test_lean(self):
        a = run([lunch(d, 60, 4, 120, 220) for d in range(1, 4)])
        self.assertEqual(a.slots["midday"]["lean"], "more")


class Basal(unittest.TestCase):
    def nights(self, f, days=(1, 2, 3, 4)):
        return [x for d in days for x in cgm(datetime(2026, 11, 5, 0, 30, tzinfo=TZ) - timedelta(days=d), 360, f)]

    def test_stable(self):
        a = run([], sensor=self.nights(lambda m: 120))
        self.assertEqual(a.basal["verdict"], "stable")

    def test_rising(self):
        a = run([], sensor=self.nights(lambda m: 110 + m / 4))
        self.assertEqual(a.basal["verdict"], "rising")

    def test_late_meal_skips_night(self):
        late = dict(t=iso(datetime(2026, 11, 3, 23, 0, tzinfo=TZ)), carbs=40, units=None)
        a = run([], entries=[late], sensor=self.nights(lambda m: 120, (1, 2, 3)))
        self.assertEqual(len(a.basal["nights"]), 2)


class Corrections(unittest.TestCase):
    def test_factor(self):
        entries, sensor = [], []
        for d in range(1, 5):
            t = datetime(2026, 11, 5, 15, 0, tzinfo=TZ) - timedelta(days=d)
            entries.append(dict(t=iso(t), bg=230, carbs=None, units=2))
            sensor += cgm(t - 5 * M, 245, lambda m: 230 - min(m, 180) * 0.5)
        a = run([], entries=entries, sensor=sensor)
        self.assertEqual(len(a.correction["samples"]), 4)
        self.assertEqual(a.correction["factor"], 45)  # 230 → 140 mit 2 IE


class Report(unittest.TestCase):
    def test_renders(self):
        a = run([lunch(0, 60, 6, 120, 130, hour=12), lunch(1, 60, 4, 120, 220)])
        text = A.report(a, {})
        self.assertIn("Mittags", text)
        self.assertIn("passt", text)
        self.assertIn("nicht ärztlich geprüft", text)


if __name__ == "__main__":
    unittest.main()
