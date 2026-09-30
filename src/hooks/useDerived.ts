/**
 * Derived, memoised views over the store. Screens read from these rather
 * than recomputing domain logic inline.
 */
import { useEffect, useMemo, useState } from 'react';

import { effectiveReadings, matchManualReadings, type ManualMatch } from '@/domain/glucose/matching';
import { computeStats, computeTrend, createReadingIndex, latestReading, SENSOR_FRESH_MIN } from '@/domain/glucose/stats';
import { buildBolusEvents } from '@/domain/insights/bolusEvents';
import { activeCorrectionSetpoint, activeSetpoint } from '@/domain/bolus/setpoint';
import { analyzeCorrections } from '@/domain/insights/corrections';
import { suggestCorrectionFactor, suggestRatio, type SettingSuggestion } from '@/domain/insights/suggestions';
import { detectPatterns, detectSetpointOutcomes } from '@/domain/insights/patterns';
import { activeInsulin } from '@/domain/insulin/iob';
import { caloriesByMealType, dayTotals } from '@/domain/nutrition/totals';
import { useAppStore } from '@/store/useAppStore';
import type { CorrectionSetpoint, GlucoseReading, GlucoseTrend, Insight, Meal, MealType, RatioSetpoint, TimelineEvent } from '@/types/models';

const DAY = 86400000;

/** Current time, refreshed every `intervalMs`. */
export function useNow(intervalMs = 60000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// One matching pass per version of the glucose list, shared by every hook.
const matchCache = new WeakMap<GlucoseReading[], { matches: Map<string, ManualMatch>; effective: GlucoseReading[] }>();
function matched(glucose: GlucoseReading[]) {
  let hit = matchCache.get(glucose);
  if (!hit) {
    const matches = matchManualReadings(glucose);
    hit = { matches, effective: effectiveReadings(glucose, matches) };
    matchCache.set(glucose, hit);
  }
  return hit;
}

/**
 * Glucose for charts, stats and learning: sensor readings plus typed values
 * that no (delayed) sensor reading has replaced yet.
 */
export function useGlucose(): GlucoseReading[] {
  const glucose = useAppStore((s) => s.glucose);
  return matched(glucose).effective;
}

/** How each typed value relates to the sensor data (matched / waiting / gap). */
export function useManualMatches(): Map<string, ManualMatch> {
  const glucose = useAppStore((s) => s.glucose);
  return matched(glucose).matches;
}

export function useCurrentGlucose(now: Date) {
  const glucose = useGlucose();
  return useMemo(() => {
    const latest = latestReading(glucose);
    const computed = computeTrend(glucose, now, 20);
    const trend: GlucoseTrend = computed?.trend ?? latest?.trend ?? 'stable';
    const ageMin = latest ? (now.getTime() - new Date(latest.timestamp).getTime()) / 60000 : Infinity;
    const stale = ageMin > 30;
    /** Recent enough to use as current glucose in a calculation. */
    const fresh = ageMin <= SENSOR_FRESH_MIN;
    return { latest, trend, stale, fresh };
  }, [glucose, now]);
}

export function useGlucoseWindow(hours: number, now: Date) {
  const glucose = useGlucose();
  return useMemo(() => {
    const index = createReadingIndex(glucose);
    return index.between(new Date(now.getTime() - hours * 3600000), now);
  }, [glucose, hours, now]);
}

export function useGlucoseStats(days: number, now: Date) {
  const glucose = useGlucose();
  const range = useAppStore((s) => s.range);
  return useMemo(() => {
    const index = createReadingIndex(glucose);
    const current = index.between(new Date(now.getTime() - days * DAY), now);
    const previous = index.between(new Date(now.getTime() - 2 * days * DAY), new Date(now.getTime() - days * DAY));
    return {
      readings: current,
      previousReadings: previous,
      stats: computeStats(current, range),
      previousStats: computeStats(previous, range),
    };
  }, [glucose, range, days, now]);
}

export function useActiveInsulin(now: Date): number {
  const insulin = useAppStore((s) => s.insulin);
  const profile = useAppStore((s) => s.insulinProfile);
  return useMemo(
    () =>
      activeInsulin(insulin, now, {
        durationHours: profile.insulinDurationHours,
        peakMinutes: profile.insulinPeakMinutes,
      }),
    [insulin, now, profile.insulinDurationHours, profile.insulinPeakMinutes],
  );
}

export function useDayNutrition(day: Date) {
  const meals = useAppStore((s) => s.meals);
  const goals = useAppStore((s) => s.nutritionGoals);
  return useMemo(() => {
    const start = startOfDay(day).getTime();
    const end = start + DAY;
    const todays = meals.filter((m) => {
      const t = new Date(m.timestamp).getTime();
      return t >= start && t < end;
    });
    return { meals: todays, totals: dayTotals(todays), byType: caloriesByMealType(todays), goals };
  }, [meals, goals, day]);
}

export function useBolusEvents() {
  const meals = useAppStore((s) => s.meals);
  const insulin = useAppStore((s) => s.insulin);
  const glucose = useGlucose();
  const activities = useAppStore((s) => s.activities);
  const durationHours = useAppStore((s) => s.insulinProfile.insulinDurationHours);
  return useMemo(
    () => buildBolusEvents(meals, insulin, glucose, activities, durationHours * 60),
    [meals, insulin, glucose, activities, durationHours],
  );
}

export function useActiveCorrectionSetpoint(): CorrectionSetpoint | undefined {
  const setpoints = useAppStore((s) => s.correctionSetpoints);
  return useMemo(() => activeCorrectionSetpoint(setpoints), [setpoints]);
}

/**
 * Corrections in the last `days`, but never from before the correction
 * factor last changed (or the active correction setpoint).
 */
export function useCorrectionAnalysis(days: number, now: Date) {
  const setpoint = useActiveCorrectionSetpoint();
  const insulin = useAppStore((s) => s.insulin);
  const meals = useAppStore((s) => s.meals);
  const activities = useAppStore((s) => s.activities);
  const glucose = useGlucose();
  const low = useAppStore((s) => s.range.low);
  const profile = useAppStore((s) => s.insulinProfile);
  return useMemo(() => {
    const since = Math.max(
      now.getTime() - days * DAY,
      setpoint ? new Date(setpoint.createdAt).getTime() : 0,
      profile.correctionFactorChangedAt ? new Date(profile.correctionFactorChangedAt).getTime() : 0,
    );
    return analyzeCorrections(insulin, meals, glucose, low, {
      since,
      activities,
      model: { durationHours: profile.insulinDurationHours, peakMinutes: profile.insulinPeakMinutes },
    });
  }, [insulin, meals, activities, glucose, low, days, now, setpoint, profile]);
}

/** One-tap setting suggestions (carb ratios for main meals, correction factor). */
export function useSuggestions(now: Date): SettingSuggestion[] {
  const events = useBolusEvents();
  const corrections = useCorrectionAnalysis(90, now);
  const profile = useAppStore((s) => s.insulinProfile);
  const range = useAppStore((s) => s.range);
  const dismissed = useAppStore((s) => s.dismissedSuggestions);
  return useMemo(() => {
    const ctx = { now, dismissed };
    const out: SettingSuggestion[] = [];
    for (const w of profile.carbRatios) {
      if (w.mealType === 'snack') continue;
      const s = suggestRatio(w, events, range, ctx);
      if (s) out.push(s);
    }
    const c = suggestCorrectionFactor(corrections, profile.correctionFactor, profile.correctionFactorChangedAt, ctx);
    if (c) out.push(c);
    return out;
  }, [events, corrections, profile, range, dismissed, now]);
}

export function useInsights(days: number, now: Date): Insight[] {
  const setpoints = useAppStore((s) => s.setpoints);
  const correctionFactor = useAppStore((s) => s.insulinProfile.correctionFactor);
  // Corrections need a longer look-back to collect enough clean samples.
  const corrections = useCorrectionAnalysis(Math.max(days, 90), now);
  const correctionSetpoint = useActiveCorrectionSetpoint();
  const glucose = useGlucose();
  const activities = useAppStore((s) => s.activities);
  const range = useAppStore((s) => s.range);
  const events = useBolusEvents();
  // Setpoint cards must not be limited by the period filter.
  const setpointById = useMemo(
    () =>
      new Map(
        detectSetpointOutcomes({ events, readings: [], activities: [], range, now, setpoints }).map((i) => [i.id, i]),
      ),
    [events, range, now, setpoints],
  );
  return useMemo(() => {
    const from = now.getTime() - days * DAY;
    const inWindow = <T extends { timestamp: string }>(xs: T[]) =>
      xs.filter((x) => new Date(x.timestamp).getTime() >= from);
    return detectPatterns({
      events: inWindow(events),
      readings: inWindow(glucose),
      activities: inWindow(activities),
      range,
      now,
      minSamples: days <= 7 ? 5 : 6,
      // Setpoint outcomes always look at every meal since the setpoint.
      setpoints,
      corrections,
      correctionFactor,
      correctionSetpoint,
    }).map((i) => (i.type === 'setpoint' ? (setpointById.get(i.id) ?? i) : i));
  }, [events, glucose, activities, range, days, now, setpoints, setpointById, corrections, correctionFactor, correctionSetpoint]);
}

export function useTimeline(day: Date): TimelineEvent[] {
  const glucose = useAppStore((s) => s.glucose);
  const meals = useAppStore((s) => s.meals);
  const insulin = useAppStore((s) => s.insulin);
  const activities = useAppStore((s) => s.activities);
  const weights = useAppStore((s) => s.weights);
  const notes = useAppStore((s) => s.notes);
  return useMemo(() => {
    const start = startOfDay(day).getTime();
    const end = start + DAY;
    const inDay = (ts: string) => {
      const t = new Date(ts).getTime();
      return t >= start && t < end;
    };
    const events: TimelineEvent[] = [];
    // Glucose: manual readings always; sensor readings thinned to hourly + meaningful moments.
    const dayGlucose = glucose.filter((g) => inDay(g.timestamp));
    dayGlucose.forEach((g) => {
      const d = new Date(g.timestamp);
      if (g.source === 'manual' || d.getMinutes() === 0) {
        events.push({ kind: 'glucose', id: g.id, timestamp: g.timestamp, data: g });
      }
    });
    meals.filter((m) => inDay(m.timestamp)).forEach((m) => events.push({ kind: 'meal', id: m.id, timestamp: m.timestamp, data: m }));
    insulin.filter((d) => inDay(d.timestamp)).forEach((d) => events.push({ kind: 'insulin', id: d.id, timestamp: d.timestamp, data: d }));
    activities
      .filter((a) => inDay(a.timestamp))
      .forEach((a) => events.push({ kind: 'activity', id: a.id, timestamp: a.timestamp, data: a }));
    weights.filter((w) => inDay(w.timestamp)).forEach((w) => events.push({ kind: 'weight', id: w.id, timestamp: w.timestamp, data: w }));
    notes.filter((n) => inDay(n.timestamp)).forEach((n) => events.push({ kind: 'note', id: n.id, timestamp: n.timestamp, data: n }));
    return events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [glucose, meals, insulin, activities, weights, notes, day]);
}

export function useRecentMeals(limit = 3): Meal[] {
  const meals = useAppStore((s) => s.meals);
  return useMemo(() => meals.slice(-limit).reverse(), [meals, limit]);
}

export function useActiveSetpoint(mealType: MealType): RatioSetpoint | undefined {
  const setpoints = useAppStore((s) => s.setpoints);
  return useMemo(() => activeSetpoint(setpoints, mealType), [setpoints, mealType]);
}
