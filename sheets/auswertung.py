#!/usr/bin/env python3
"""
gluciq – tägliche Auswertung der Google-Tabelle.

Holt Einträge, Dexcom-Werte und „Mein System“ über die Web-App (doGet mit Code)
und schreibt eine kurze Auswertung auf Deutsch. Dieselben Regeln wie
src/domain/system/analyze.ts in der App:

  Mahlzeit bewerten: Wert ~3 h danach (2,5–4 h) gegen den Startwert.
    ±40 mg/dL → passt · >40 höher oder Korrektur 20 min–3 h danach → zu wenig Insulin
    >40 tiefer oder unter 70 innerhalb von 4 h → zu viel Insulin
  Zählt nicht: Start außerhalb 70–180, zweite Mahlzeit innerhalb 3 h, < 10 g.
  Faktor pro Tageszeit: ab 3 passenden Mahlzeiten Median (g pro IE, auf 0,5), ab 6 „ziemlich sicher“.
  Korrektur: Korrekturen ohne Essen 3 h davor/danach und ohne anderes NovoRapid 4,5 h davor, ab 4.
  Tresiba: Nächte ohne Essen/NovoRapid ab 21 Uhr, Veränderung 1–6 Uhr, ab 3 Nächten.

Nur Standardbibliothek. Aufruf:
  GLUCIQ_URL=… GLUCIQ_TOKEN=… python3 sheets/auswertung.py [--days 28]
  python3 sheets/auswertung.py --file daten.json      (zum Testen)
"""
from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timedelta

MIN = timedelta(minutes=1)
RULES = dict(
    min_carbs=10, outcome_at=180, outcome_from=150, outcome_to=240, tolerance=40,
    start_min=70, start_max=180, low=70, low_window=240, corr_from=20, corr_to=180,
    other_meal=180, wait_hours=8, min_good=3, confident_good=6, meal_dose_window=45,
)
SLOTS = [("morning", "Morgens", 5, 11), ("midday", "Mittags", 11, 16), ("evening", "Abends", 16, 22), ("late", "Spät", 22, 5)]
LABEL = {
    "good": "passt", "too-little": "zu wenig Insulin", "too-much": "zu viel Insulin",
    "pending": "wartet auf Werte", "no-data": "kein Wert nach 3 h", "off-start": "Start außerhalb 70–180",
    "mixed": "zweite Mahlzeit innerhalb 3 h",
}


def parse_t(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def slot_for(t: datetime) -> str:
    h = t.hour  # Zeiten kommen mit Berliner Offset, also Ortszeit
    if 5 <= h < 11:
        return "morning"
    if 11 <= h < 16:
        return "midday"
    if 16 <= h < 22:
        return "evening"
    return "late"


def de(n: float, digits: int = 1) -> str:
    s = f"{n:.{digits}f}".rstrip("0").rstrip(".") if digits else f"{round(n)}"
    return s.replace(".", ",")


def half(n: float) -> float:
    return round(n * 2) / 2


@dataclass
class Readings:
    pts: list[tuple[datetime, float]]

    def near(self, t: datetime, tol_min: float = 20):
        best = None
        for x in self.pts:
            d = abs((x[0] - t).total_seconds())
            if d <= tol_min * 60 and (best is None or d < best[0]):
                best = (d, x)
        return best[1] if best else None

    def between(self, a: datetime, b: datetime):
        return [x for x in self.pts if a <= x[0] <= b]


@dataclass
class Meal:
    t: datetime
    carbs: float
    units: float
    weighed: bool | None
    bg: float | None
    outcome: str = ""
    before: float | None = None
    after: float | None = None
    after_min: int | None = None
    lowest: float | None = None
    corr_after: float = 0

    @property
    def gpu(self) -> float:
        return self.carbs / self.units


@dataclass
class Analysis:
    now: datetime
    meals: list[Meal] = field(default_factory=list)
    slots: dict = field(default_factory=dict)
    correction: dict = field(default_factory=dict)
    basal: dict = field(default_factory=dict)
    day: dict = field(default_factory=dict)
    last_sensor: datetime | None = None


def analyze(data: dict, now: datetime | None = None) -> Analysis:
    r = RULES
    now = now or parse_t(data["generated"])
    entries = sorted(
        ({**e, "t": parse_t(e["t"])} for e in data.get("entries", [])), key=lambda e: e["t"]
    )
    sensor = sorted((parse_t(t), float(v)) for t, v in data.get("sensor", []) if v is not None)
    typed = [(e["t"], float(e["bg"])) for e in entries if e.get("bg")]
    # Sensorwerte haben Vorrang; ein getippter Wert zählt nur, wo kein Sensorwert innerhalb 10 min liegt.
    sens = Readings(sensor)
    merged = sorted(sensor + [x for x in typed if not sens.near(x[0], 10)])
    rd = Readings(merged)
    a = Analysis(now=now, last_sensor=sensor[-1][0] if sensor else None)

    food = [e for e in entries if (e.get("carbs") or 0) >= 5]
    corrections = [e for e in entries if (e.get("units") or 0) > 0 and not (e.get("carbs") or 0)]

    for e in entries:
        carbs = e.get("carbs") or 0
        if carbs < r["min_carbs"]:
            continue
        units = e.get("units") or 0
        if not units:  # Dosis evtl. separat eingetragen
            cands = [c for c in corrections if abs((c["t"] - e["t"]).total_seconds()) <= r["meal_dose_window"] * 60]
            if cands:
                d = min(cands, key=lambda c: abs((c["t"] - e["t"]).total_seconds()))
                corrections.remove(d)
                units = d["units"]
        if not units:
            continue
        m = Meal(t=e["t"], carbs=carbs, units=units, weighed=e.get("weighed"), bg=e.get("bg"))
        judge(m, rd, food, corrections, now)
        a.meals.append(m)

    for key, label, _, _ in SLOTS:
        own = [m for m in a.meals if slot_for(m.t) == key]
        good = [m.gpu for m in own if m.outcome == "good"]
        little = sum(m.outcome == "too-little" for m in own)
        much = sum(m.outcome == "too-much" for m in own)
        judged = len(good) + little + much
        est = None
        lean = None
        if len(good) >= r["min_good"]:
            est = dict(gpu=half(statistics.median(good)), lo=half(min(good)), hi=half(max(good)),
                       sure=len(good) >= r["confident_good"])
        elif judged >= 3 and little >= judged * 0.6:
            lean = "more"
        elif judged >= 3 and much >= judged * 0.6:
            lean = "less"
        ratios = [m.gpu for m in own]
        a.slots[key] = dict(label=label, meals=own, good=len(good), little=little, much=much, judged=judged,
                            est=est, lean=lean, used=(min(ratios), max(ratios)) if ratios else None)

    a.correction = correction_samples(entries, food, rd, sensor)
    a.basal = basal_check(Readings(sensor), entries, now)
    a.day = day_stats(sensor, now)
    return a


def judge(m: Meal, rd: Readings, food: list, corrections: list, now: datetime) -> None:
    r = RULES
    t = m.t
    m.before = m.bg if m.bg else (rd.near(t, 20) or (None, None))[1]
    win = rd.between(t + r["outcome_from"] * MIN, t + r["outcome_to"] * MIN)
    if win:
        x = min(win, key=lambda x: abs((x[0] - (t + r["outcome_at"] * MIN)).total_seconds()))
        m.after, m.after_min = x[1], round((x[0] - t).total_seconds() / 60)
    following = rd.between(t + 30 * MIN, t + r["low_window"] * MIN)
    m.lowest = min((x[1] for x in following), default=None)
    m.corr_after = sum(c["units"] for c in corrections if t + r["corr_from"] * MIN <= c["t"] <= t + r["corr_to"] * MIN)
    other = any(t + 15 * MIN < f["t"] < t + r["other_meal"] * MIN for f in food)
    elapsed = now - t
    wait = elapsed < timedelta(hours=r["wait_hours"])
    if m.lowest is not None and m.lowest < r["low"]:
        m.outcome = "too-much"
    elif elapsed < r["outcome_from"] * MIN:
        m.outcome = "pending"
    elif other:
        m.outcome = "mixed"
    elif m.before is None:
        m.outcome = "pending" if wait else "no-data"
    elif not (r["start_min"] <= m.before <= r["start_max"]):
        m.outcome = "off-start"
    elif m.corr_after:
        m.outcome = "too-little"
    elif m.after is None:
        m.outcome = "pending" if wait else "no-data"
    elif m.after - m.before > r["tolerance"]:
        m.outcome = "too-little"
    elif m.after - m.before < -r["tolerance"]:
        m.outcome = "too-much"
    else:
        m.outcome = "good"


def correction_samples(entries, food, rd: Readings, sensor) -> dict:
    sens = Readings(sensor)
    rapid = [e for e in entries if (e.get("units") or 0) > 0]
    samples, lows = [], 0
    for e in rapid:
        if e.get("carbs"):
            continue
        t = e["t"]
        after = sens.between(t + 120 * MIN, t + 240 * MIN)
        if any(x[1] < 70 for x in after):
            lows += 1
        if any(t - 180 * MIN <= f["t"] <= t + 180 * MIN for f in food):
            continue
        if any(o is not e and t - 270 * MIN <= o["t"] <= t + 240 * MIN for o in rapid):
            continue
        at = e.get("bg") or (rd.near(t, 15) or (None, None))[1]
        if not at or len(after) < 3:
            continue
        lowest = min(x[1] for x in after)
        samples.append(dict(t=t, units=e["units"], start=at, lowest=lowest, drop=(at - lowest) / e["units"]))
    return dict(samples=samples, lows=lows,
                factor=round(statistics.median(s["drop"] for s in samples)) if len(samples) >= 4 else None)


def basal_check(sens: Readings, entries, now: datetime, nights: int = 14) -> dict:
    out = []
    for i in range(nights):
        day = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        start, end = day.replace(hour=1), day.replace(hour=6)
        if end > now:
            continue
        busy = any(start - 4 * timedelta(hours=1) <= e["t"] <= end and ((e.get("carbs") or 0) >= 5 or (e.get("units") or 0) > 0)
                   for e in entries)
        s, en, btw = sens.near(start, 20), sens.near(end, 20), sens.between(start, end)
        if busy or not s or not en or len(btw) < 12:
            continue
        lowest = min(x[1] for x in btw)
        ch = en[1] - s[1]
        kind = "low" if lowest < 70 else "rising" if ch > 30 else "falling" if ch < -30 else "stable"
        out.append(dict(date=start, start=s[1], end=en[1], change=ch, lowest=lowest, kind=kind))
    verdict = None
    if len(out) >= 3:
        c = lambda k: sum(n["kind"] == k for n in out)
        n = len(out)
        verdict = ("lows" if c("low") >= 2 else "stable" if c("stable") >= n * 0.7 and not c("low")
                   else "rising" if c("rising") >= n * 0.5 else "falling" if c("falling") + c("low") >= n * 0.5 else "mixed")
    return dict(nights=out, verdict=verdict,
                median=round(statistics.median(x["change"] for x in out)) if out else None)


def day_stats(sensor, now: datetime) -> dict:
    """Letzte 24 h, soweit Dexcom-Werte da sind."""
    pts = [x for x in sensor if now - timedelta(hours=24) <= x[0] <= now]
    if not pts:
        return {}
    vals = [v for _, v in pts]
    lows, highs, in_low = [], 0, False
    for t, v in pts:
        if v < 70 and not in_low:
            lows.append([t, v])
        if v < 70:
            lows[-1][1] = min(lows[-1][1], v)
        in_low = v < 70
    return dict(n=len(vals), avg=round(statistics.mean(vals)), tir=round(100 * sum(70 <= v <= 180 for v in vals) / len(vals)),
                below=round(100 * sum(v < 70 for v in vals) / len(vals)), above=round(100 * sum(v > 180 for v in vals) / len(vals)),
                lows=lows, max=max(vals), min=min(vals), first=pts[0][0], last=pts[-1][0])


def hm(t: datetime) -> str:
    return t.strftime("%H:%M")


def report(a: Analysis, system: dict) -> str:
    L = []
    now = a.now
    L.append(f"**gluciq – Auswertung {now.strftime('%d.%m.')}**")

    d = a.day
    if d:
        L.append("")
        L.append(f"**Letzte 24 h** (Dexcom bis {hm(d['last'])}): Ø {d['avg']} mg/dL · **{d['tir']} % im Bereich** 70–180 · "
                 f"{d['below']} % darunter · {d['above']} % darüber · min {round(d['min'])} / max {round(d['max'])}")
        for t, v in d["lows"]:
            L.append(f"- ⚠️ Unterzucker ab {hm(t)}, tiefster Wert {round(v)}")
    if not a.last_sensor or now - a.last_sensor > timedelta(hours=14):
        L.append("")
        L.append("⚠️ Keine aktuellen Dexcom-Werte – läuft die Automation „Dexcom senden“?")

    today = [m for m in a.meals if now - m.t <= timedelta(hours=30)]
    L.append("")
    L.append("**Mahlzeiten seit gestern**" if today else "**Mahlzeiten seit gestern:** keine eingetragen")
    for m in sorted(today, key=lambda m: m.t):
        how = f"{de(m.carbs, 0)} g{' (gewogen)' if m.weighed else ''} · {de(m.units)} IE = 1 IE : {de(m.gpu)} g"
        path = ""
        if m.before is not None and m.after is not None:
            path = f" · {round(m.before)} → {round(m.after)} nach {de(m.after_min / 60)} h"
        extra = f" (Korrektur {de(m.corr_after)} IE danach)" if m.corr_after else ""
        lowtxt = f" (tiefster Wert {round(m.lowest)})" if m.outcome == "too-much" and m.lowest is not None and m.lowest < 70 else ""
        L.append(f"- {hm(m.t)} {how}{path} → **{LABEL[m.outcome]}**{extra}{lowtxt}")

    L.append("")
    L.append("**Dein System bisher** (letzte 4 Wochen)")
    for key, label, a_, b_ in SLOTS:
        s = a.slots[key]
        if not s["meals"] and key == "late":
            continue
        span = f" · gespritzt zwischen 1 IE : {de(s['used'][0])} und 1 IE : {de(s['used'][1])} g" if s["used"] and s["used"][0] != s["used"][1] else ""
        counts = f"{s['good']} passt, {s['little']} zu wenig, {s['much']} zu viel"
        if s["est"]:
            e = s["est"]
            L.append(f"- **{label}: 1 IE : {de(e['gpu'])} g** (KE-Faktor {de(10 / e['gpu'])}) – "
                     f"{'ziemlich sicher' if e['sure'] else 'noch unsicher'} · {counts}{span}")
        elif s["lean"] == "more":
            L.append(f"- {label}: noch kein Faktor – bisher meist **zu wenig Insulin** · {counts}{span}")
        elif s["lean"] == "less":
            L.append(f"- {label}: noch kein Faktor – bisher meist **zu viel Insulin** · {counts}{span}")
        else:
            L.append(f"- {label}: noch kein Faktor ({s['good']} von 3 passenden Mahlzeiten){span}")

    c = a.correction
    if c["factor"]:
        L.append(f"- **Korrektur: 1 IE senkt um ca. {c['factor']} mg/dL** (aus {len(c['samples'])} Korrekturen)")
    else:
        L.append(f"- Korrektur: noch {len(c['samples'])} von 4 auswertbaren Korrekturen")
    if c["lows"]:
        L.append(f"- ⚠️ {c['lows']}× unter 70 nach einer Korrektur")

    b = a.basal
    n = len(b["nights"])
    med = f"{int(b['median']):+d}" if b["median"] is not None else "?"
    texts = {
        "stable": f"Nachts stabil ({n} Nächte) – spricht dafür, dass Tresiba passt",
        "rising": f"Steigt nachts (Ø {med} mg/dL 1–6 Uhr) – Tresiba mit dem Arzt besprechen",
        "falling": f"Fällt nachts (Ø {med} mg/dL 1–6 Uhr) – Tresiba mit dem Arzt besprechen",
        "lows": "⚠️ Mehrere Nächte unter 70 – bitte bald mit dem Arzt besprechen",
        "mixed": f"Nachts uneinheitlich ({n} Nächte)",
    }
    L.append(f"- Tresiba: {texts[b['verdict']]}" if b["verdict"] else f"- Tresiba: noch {n} von 3 ruhigen Nächten (ab 21 Uhr nichts essen, kein NovoRapid)")

    ready = all(a.slots[k]["est"] and a.slots[k]["est"]["sure"] for k in ("morning", "midday", "evening")) and c["factor"]
    active = str(system.get("active", "")).strip().lower() == "ja"
    L.append("")
    if active:
        L.append("Phase 2 aktiv: Vorschläge laufen nach „Mein System“.")
    elif ready:
        L.append("✅ **Dein System steht** – nimm die Faktoren mit zu deinem Diabetologen und trag sie danach in „Mein System“ ein.")
    else:
        L.append("Weiter so eintragen – je mehr Mahlzeiten mit Wert nach 3 h, desto schneller steht dein Faktor.")
    L.append("")
    L.append("_Beschreibt nur deine Daten, nicht ärztlich geprüft._")
    return "\n".join(L)


def fetch(url: str, token: str, days: int) -> dict:
    q = urllib.parse.urlencode({"token": token, "days": days})
    with urllib.request.urlopen(f"{url}?{q}", timeout=60) as res:
        data = json.loads(res.read().decode("utf-8"))
    if "error" in data:
        raise SystemExit(f"Fehler von der Web-App: {data['error']}")
    return data


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--file")
    ap.add_argument("--days", type=int, default=28)
    ap.add_argument("--json", action="store_true", help="Rohdaten der Auswertung ausgeben")
    args = ap.parse_args()
    if args.file:
        data = json.load(open(args.file, encoding="utf-8"))
    else:
        url, token = os.environ.get("GLUCIQ_URL"), os.environ.get("GLUCIQ_TOKEN")
        if not url or not token:
            raise SystemExit("GLUCIQ_URL und GLUCIQ_TOKEN setzen")
        data = fetch(url, token, args.days)
    a = analyze(data)
    print(report(a, data.get("system", {})))


if __name__ == "__main__":
    main()
