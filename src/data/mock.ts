/**
 * Deterministic, realistic seed data.
 *
 * Each day is generated from its own seeded PRNG, so a given calendar day
 * always looks the same regardless of when the app starts. The simulation
 * deliberately contains a few patterns for the insight engine to find:
 *  - breakfast often runs high (carb ratio a little weak in the morning)
 *  - an early-morning rise (dawn phenomenon)
 *  - dips/lows after evening workouts
 *  - delayed rises after high-fat dinners
 */
import { roundDownToIncrement } from '@/domain/bolus/engine';
import { mealTotals, scaleNutrients } from '@/domain/nutrition/totals';
import type {
  ActivityEntry,
  BolusCalculation,
  GlucoseReading,
  GlucoseTrend,
  InsulinDose,
  InsulinProfile,
  Meal,
  MealItem,
  MealType,
  NutritionGoals,
  RatioSetpoint,
  SavedMeal,
  UserProfile,
  WeightEntry,
  WeightGoal,
} from '@/types/models';

import { FOOD_BY_ID } from './foods';

export const USER_ID = 'user_alex';
const HISTORY_DAYS = 90;
const WEIGHT_DAYS = 400;
const MIN = 60000;
const DAY = 86400000;

// ---------------------------------------------------------------------------
// PRNG
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rng = ReturnType<typeof mulberry32>;
const between = (rng: Rng, lo: number, hi: number) => lo + (hi - lo) * rng();
const pick = <T,>(rng: Rng, xs: T[]) => xs[Math.floor(rng() * xs.length)];
const gauss = (rng: Rng) => {
  const u = Math.max(rng(), 1e-9);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const dayKey = (d: Date) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const atMinute = (day: Date, minute: number) => new Date(day.getTime() + minute * MIN);

// ---------------------------------------------------------------------------
// Profile & settings
// ---------------------------------------------------------------------------

export const mockUser: UserProfile = {
  id: USER_ID,
  name: 'Alex',
  glucoseUnit: 'mg/dL',
  createdAt: '2025-11-02T09:00:00.000Z',
};

export const mockInsulinProfile: InsulinProfile = {
  id: 'profile_default',
  userId: USER_ID,
  targetGlucose: 110,
  correctionFactor: 35,
  insulinDurationHours: 4.5,
  insulinPeakMinutes: 75,
  maxBolus: 20,
  minGlucoseForBolus: 70,
  doseIncrement: 0.5,
  carbRatios: [
    // 4.6 comes from the seeded setpoint below (was 5 before it).
    { id: 'cr_breakfast', label: 'Breakfast', mealType: 'breakfast', startMinute: 5 * 60, endMinute: 11 * 60, gramsPerUnit: 4.6 },
    { id: 'cr_lunch', label: 'Lunch', mealType: 'lunch', startMinute: 11 * 60, endMinute: 16 * 60, gramsPerUnit: 7 },
    { id: 'cr_dinner', label: 'Dinner', mealType: 'dinner', startMinute: 16 * 60, endMinute: 22 * 60, gramsPerUnit: 6 },
    { id: 'cr_late', label: 'Late / snacks', mealType: 'snack', startMinute: 22 * 60, endMinute: 5 * 60, gramsPerUnit: 8 },
  ],
};

export const mockNutritionGoals: NutritionGoals = {
  calories: 2200,
  protein: 160,
  carbs: 220,
  fat: 70,
  fiber: 30,
};

export const mockWeightGoal: WeightGoal = { targetKg: 76, heightCm: 180 };

// ---------------------------------------------------------------------------
// Meal templates
// ---------------------------------------------------------------------------

type Template = { name: string; items: [foodId: string, amount: number][] };

const item = (foodId: string, amount: number, idx: number, mealId: string): MealItem => {
  const food = FOOD_BY_ID[foodId];
  const servings = amount / food.servingSize;
  return {
    id: `${mealId}_i${idx}`,
    foodId,
    name: food.name,
    servings,
    nutrients: scaleNutrients(food.nutrients, servings),
  };
};

const BREAKFASTS: Template[] = [
  { name: 'My Breakfast', items: [['bread-roll', 2], ['butter', 10], ['coffee-milk', 250], ['greek-yogurt', 150]] },
  { name: 'Oats & berries', items: [['oats', 70], ['blueberries', 100], ['milk', 200], ['coffee-milk', 250]] },
  { name: 'Eggs on sourdough', items: [['sourdough', 2], ['egg', 2], ['avocado', 50], ['coffee-milk', 250]] },
  { name: 'Granola & skyr', items: [['granola', 60], ['skyr', 150], ['banana', 1]] },
];
const LUNCHES: Template[] = [
  { name: 'Burrito bowl', items: [['burrito-bowl', 1]] },
  { name: 'Chicken & rice', items: [['chicken-breast', 150], ['basmati', 200], ['broccoli', 150]] },
  { name: 'Lentil soup', items: [['lentil-soup', 300], ['sourdough', 1]] },
  { name: 'Sushi', items: [['sushi', 1], ['mixed-salad', 100]] },
  { name: 'Hummus wrap', items: [['whole-wheat-wrap', 1], ['hummus', 50], ['chicken-breast', 100], ['mixed-salad', 50]] },
];
const DINNERS: Template[] = [
  { name: 'Pasta bolognese', items: [['pasta', 220], ['bolognese', 150]] },
  { name: 'Salmon & sweet potato', items: [['salmon', 150], ['sweet-potato', 250], ['broccoli', 150], ['olive-oil', 10]] },
  { name: 'Pizza night', items: [['pizza-margherita', 1]] },
  { name: 'Chicken salad', items: [['chicken-breast', 180], ['mixed-salad', 200], ['olive-oil', 15], ['sourdough', 1]] },
];
const SNACKS: Template[] = [
  { name: 'Apple & almonds', items: [['apple', 1], ['almonds', 30]] },
  { name: 'Protein bar', items: [['protein-bar', 1]] },
  { name: 'Banana', items: [['banana', 1]] },
  { name: 'Dark chocolate', items: [['dark-chocolate', 20]] },
];

function buildMeal(id: string, mealType: MealType, t: Template, at: Date): Meal {
  const items = t.items.map(([foodId, amount], i) => item(foodId, amount, i, id));
  const n = mealTotals(items);
  return {
    id,
    userId: USER_ID,
    name: t.name,
    mealType,
    items,
    calories: n.calories,
    carbs: n.carbs,
    protein: n.protein,
    fat: n.fat,
    fiber: n.fiber,
    sugar: n.sugar,
    timestamp: at.toISOString(),
  };
}

export const mockSavedMeals: SavedMeal[] = [BREAKFASTS[0], BREAKFASTS[1], LUNCHES[1], SNACKS[0]].map((t, i) => {
  const id = `saved_${i}`;
  const mealType: MealType = i < 2 ? 'breakfast' : i === 2 ? 'lunch' : 'snack';
  return { id, name: t.name, mealType, items: t.items.map(([f, a], j) => item(f, a, j, id)) };
});

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

/** Unimodal response curve peaking at `peak` minutes with height `amp`. */
const bump = (dtMin: number, peak: number, amp: number) => {
  if (dtMin <= 0) return 0;
  const x = dtMin / peak;
  return amp * x * Math.exp(1 - x);
};
const bell = (dtMin: number, sigma: number, amp: number) => amp * Math.exp(-(dtMin * dtMin) / (2 * sigma * sigma));

type Effect = (minuteOfDay: number) => number;

export type SeedData = {
  user: UserProfile;
  insulinProfile: InsulinProfile;
  nutritionGoals: NutritionGoals;
  weightGoal: WeightGoal;
  glucose: GlucoseReading[];
  insulin: InsulinDose[];
  meals: Meal[];
  activities: ActivityEntry[];
  weights: WeightEntry[];
  savedMeals: SavedMeal[];
  bolusHistory: BolusCalculation[];
  setpoints: RatioSetpoint[];
};

/** The demo user set a breakfast setpoint this many days ago. */
const SETPOINT_DAYS_AGO = 14;
const BREAKFAST_RATIO_BEFORE = 5;

function seedSetpoint(today: Date): RatioSetpoint {
  const createdAt = atMinute(new Date(today.getTime() - SETPOINT_DAYS_AGO * DAY), 7 * 60).toISOString();
  return {
    id: 'setpoint_breakfast_demo',
    mealType: 'breakfast',
    windowId: 'cr_breakfast',
    gramsPerUnit: 4.6,
    previousGramsPerUnit: BREAKFAST_RATIO_BEFORE,
    createdAt,
    // 72 g, glucose 124: suggested 14.5 U, took 16 U → (16 − 0.4) = 15.6 U → 72 ÷ 15.6 = 4.6 g/U
    origin: { unitsTaken: 16, suggestedBolus: 14.5, carbs: 72, correctionBolus: 0.4, activeInsulin: 0 },
  };
}

export function generateSeedData(now: Date = new Date()): SeedData {
  const glucose: GlucoseReading[] = [];
  const insulin: InsulinDose[] = [];
  const meals: Meal[] = [];
  const activities: ActivityEntry[] = [];
  const today = startOfDay(now);
  const nowMs = now.getTime();
  const setpoint = seedSetpoint(today);
  const setpointMs = new Date(setpoint.createdAt).getTime();
  let noise = 0;
  let carryOver = 0; // glucose effects spilling past midnight

  for (let d = HISTORY_DAYS - 1; d >= 0; d--) {
    const day = new Date(today.getTime() - d * DAY);
    const rng = mulberry32(dayKey(day));
    const effects: Effect[] = [];
    const weekday = day.getDay();
    const workoutDay = weekday === 2 || weekday === 4 || weekday === 6;
    const base = 108 + between(rng, -8, 10);

    // Dawn phenomenon + yesterday's carry-over fading overnight.
    const dawnAmp = between(rng, 12, 30);
    effects.push((m) => bell(m - 390, 80, dawnAmp));
    const carry = carryOver;
    effects.push((m) => carry * Math.exp(-m / 90));

    const addMeal = (mealType: MealType, t: Template, minute: number, k: number, peak: number, ratioOverride?: number) => {
      const at = atMinute(day, minute);
      if (at.getTime() > nowMs) return;
      const id = `meal_${dayKey(day)}_${mealType}`;
      const meal = buildMeal(id, mealType, t, at);
      meals.push(meal);

      // Bolus a few minutes before eating, using the profile's ratios.
      const ratio = ratioOverride ?? mockInsulinProfile.carbRatios.find((c) => c.mealType === mealType)!.gramsPerUnit;
      const units = roundDownToIncrement(meal.carbs / ratio + between(rng, -0.6, 0.6), 0.5);
      insulin.push({
        id: `dose_${id}`,
        userId: USER_ID,
        units,
        insulinType: 'rapid',
        source: rng() < 0.5 ? 'bolus-calculator' : 'manual',
        timestamp: atMinute(day, minute - Math.round(between(rng, 5, 15))).toISOString(),
      });

      const amp = meal.carbs * k * between(rng, 0.75, 1.25);
      if (meal.fat >= 30) {
        effects.push((m) => bump(m - minute, peak, amp * 0.45) + bump(m - minute, 170, amp * 0.75));
      } else {
        effects.push((m) => bump(m - minute, peak, amp));
      }
    };

    // Breakfast runs high: the simulated body needs ~4 g/U, profile says 5.
    // Before the setpoint breakfast was dosed at 1:5 and often ran high. The
    // extra insulin at 1:4.6 lowers the excursion by (1/4.6 − 1/5) × CF per gram.
    const afterSetpoint = day.getTime() + 7 * 60 * MIN >= setpointMs;
    const breakfastRatio = afterSetpoint ? setpoint.gramsPerUnit : BREAKFAST_RATIO_BEFORE;
    const breakfastK = 1.75 - (1 / breakfastRatio - 1 / BREAKFAST_RATIO_BEFORE) * mockInsulinProfile.correctionFactor;
    addMeal('breakfast', pick(rng, BREAKFASTS), Math.round(between(rng, 450, 500)), breakfastK, 70, breakfastRatio);
    addMeal('lunch', pick(rng, LUNCHES), Math.round(between(rng, 735, 795)), 0.55, 65);
    if (rng() < 0.55) addMeal('snack', pick(rng, SNACKS), Math.round(between(rng, 915, 960)), 0.7, 45);

    if (workoutDay) {
      const start = Math.round(between(rng, 1060, 1100));
      const at = atMinute(day, start);
      if (at.getTime() <= nowMs) {
        const kind = rng() < 0.6 ? 'run' : 'strength';
        const durationMin = Math.round(between(rng, 40, 60));
        activities.push({
          id: `act_${dayKey(day)}_workout`,
          userId: USER_ID,
          kind,
          durationMin,
          intensity: kind === 'run' ? 'hard' : 'moderate',
          activeEnergyKcal: Math.round(durationMin * (kind === 'run' ? 11 : 7)),
          timestamp: at.toISOString(),
          source: 'healthkit',
        });
        const dip = between(rng, 25, 62);
        effects.push((m) => -bell(m - (start + 80), 50, dip) - (m > start ? 8 : 0));
      }
      addMeal('dinner', pick(rng, DINNERS), Math.round(between(rng, 1215, 1245)), 0.45, 70);
    } else {
      addMeal('dinner', pick(rng, DINNERS), Math.round(between(rng, 1125, 1185)), 0.6, 70);
    }

    if (rng() < 0.7) {
      const start = Math.round(between(rng, 760, 800));
      if (atMinute(day, start).getTime() <= nowMs) {
        activities.push({
          id: `act_${dayKey(day)}_walk`,
          userId: USER_ID,
          kind: 'walk',
          durationMin: Math.round(between(rng, 15, 35)),
          intensity: 'light',
          activeEnergyKcal: Math.round(between(rng, 60, 140)),
          timestamp: atMinute(day, start).toISOString(),
          source: 'healthkit',
        });
      }
    }

    // Long-acting basal each evening.
    if (atMinute(day, 22 * 60).getTime() <= nowMs) {
      insulin.push({
        id: `basal_${dayKey(day)}`,
        userId: USER_ID,
        units: 18,
        insulinType: 'long',
        source: 'manual',
        timestamp: atMinute(day, 22 * 60).toISOString(),
      });
    }

    // Sample: every 5 min for the last 2 days, every 15 min before that.
    const step = d <= 1 ? 5 : 15;
    const dayReadings: GlucoseReading[] = [];
    for (let m = 0; m < 1440; m += step) {
      const at = atMinute(day, m);
      if (at.getTime() > nowMs) break;
      noise = 0.92 * noise + gauss(rng) * (step === 5 ? 1.6 : 2.8);
      const value = base + noise + effects.reduce((s, f) => s + f(m), 0);
      dayReadings.push({
        id: `g_${dayKey(day)}_${m}`,
        userId: USER_ID,
        value: Math.round(Math.min(360, Math.max(48, value))),
        timestamp: at.toISOString(),
        source: 'healthkit',
      });
    }
    const lookback = 15 / step;
    dayReadings.forEach((r, i) => {
      const prev = dayReadings[i - lookback];
      if (!prev) return;
      r.trend = trendFromRate((r.value - prev.value) / 15);
    });
    glucose.push(...dayReadings);
    const last = dayReadings[dayReadings.length - 1];
    carryOver = last ? Math.max(-20, Math.min(40, last.value - base)) * 0.6 : 0;
  }

  const bolusHistory = buildBolusHistory(meals, insulin, glucose);

  return {
    user: mockUser,
    insulinProfile: mockInsulinProfile,
    nutritionGoals: mockNutritionGoals,
    weightGoal: mockWeightGoal,
    glucose,
    insulin,
    meals,
    activities,
    weights: generateWeights(now),
    savedMeals: mockSavedMeals,
    bolusHistory,
    setpoints: [setpoint],
  };
}

function trendFromRate(rate: number): GlucoseTrend {
  if (rate >= 2) return 'rising-fast';
  if (rate >= 1) return 'rising';
  if (rate <= -2) return 'falling-fast';
  if (rate <= -1) return 'falling';
  return 'stable';
}

function generateWeights(now: Date): WeightEntry[] {
  const today = startOfDay(now);
  const out: WeightEntry[] = [];
  for (let d = WEIGHT_DAYS - 1; d >= 0; d--) {
    const day = new Date(today.getTime() - d * DAY);
    const rng = mulberry32(dayKey(day) * 7 + 3);
    if (d > 0 && rng() < 0.3) continue;
    const progress = 1 - d / WEIGHT_DAYS;
    const trend = 84.8 - 6.2 * (1 - Math.pow(1 - progress, 1.6));
    const weekly = Math.sin((day.getDay() / 7) * Math.PI * 2) * 0.25;
    const at = atMinute(day, 7 * 60 + Math.round(between(rng, 0, 30)));
    if (at.getTime() > now.getTime()) continue;
    out.push({
      id: `w_${dayKey(day)}`,
      userId: USER_ID,
      weightKg: Math.round((trend + weekly + gauss(rng) * 0.25) * 10) / 10,
      bodyFatPct: Math.round((22.5 - 3 * progress + gauss(rng) * 0.3) * 10) / 10,
      timestamp: at.toISOString(),
      source: rng() < 0.8 ? 'healthkit' : 'manual',
    });
  }
  return out;
}

function buildBolusHistory(meals: Meal[], doses: InsulinDose[], readings: GlucoseReading[]): BolusCalculation[] {
  const byId = new Map(doses.map((d) => [d.id, d]));
  return meals
    .slice(-8)
    .reverse()
    .map((meal) => {
      const dose = byId.get(`dose_${meal.id}`);
      const t = new Date(meal.timestamp).getTime();
      const g =
        readings.find((r) => Math.abs(new Date(r.timestamp).getTime() - t) <= 10 * MIN)?.value ??
        mockInsulinProfile.targetGlucose;
      const ratio = mockInsulinProfile.carbRatios.find((c) => c.mealType === meal.mealType)!.gramsPerUnit;
      const mealBolus = Math.round((meal.carbs / ratio) * 100) / 100;
      const correctionBolus =
        Math.round(((g - mockInsulinProfile.targetGlucose) / mockInsulinProfile.correctionFactor) * 100) / 100;
      const suggested = Math.min(
        mockInsulinProfile.maxBolus,
        roundDownToIncrement(Math.max(0, mealBolus + correctionBolus), mockInsulinProfile.doseIncrement),
      );
      return {
        id: `calc_${meal.id}`,
        currentGlucose: g,
        targetGlucose: mockInsulinProfile.targetGlucose,
        carbs: meal.carbs,
        carbRatio: ratio,
        correctionFactor: mockInsulinProfile.correctionFactor,
        activeInsulin: 0,
        mealType: meal.mealType,
        mealBolus,
        correctionBolus,
        activeInsulinAdjustment: 0,
        suggestedBolus: suggested,
        confirmedUnits: dose?.units ?? suggested,
        warnings: [],
        calculationVersion: 'gluciq-bolus/1.0.0-prototype',
        timestamp: new Date(t - 12 * MIN).toISOString(),
      };
    });
}
