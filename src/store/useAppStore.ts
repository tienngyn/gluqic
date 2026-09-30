/**
 * Local app state. Local-first: this store is the source of truth on
 * device. Persistence (SQLite) and cloud sync (Supabase) attach behind
 * `services/` without changing the actions below.
 */
import { create } from 'zustand';

import { generateSeedData, USER_ID } from '@/data/mock';
import { DEFAULT_RANGE } from '@/domain/glucose/stats';
import { mealTotals } from '@/domain/nutrition/totals';
import type {
  ActivityEntry,
  BolusCalculation,
  CarbRatioWindow,
  FoodItem,
  GlucoseRange,
  GlucoseReading,
  InsulinDose,
  InsulinProfile,
  Meal,
  MealItem,
  MealType,
  NoteEntry,
  NutritionGoals,
  RatioSetpoint,
  SavedMeal,
  UserProfile,
  WeightEntry,
  WeightGoal,
} from '@/types/models';
import { uid } from '@/utils/format';

export type BolusDraft = { carbs: number; mealType?: MealType; source: string } | null;

/** A calculation awaiting explicit user confirmation before it is saved. */
export type PendingBolus = Omit<BolusCalculation, 'id' | 'confirmedUnits'> | null;

type State = {
  user: UserProfile;
  insulinProfile: InsulinProfile;
  nutritionGoals: NutritionGoals;
  weightGoal: WeightGoal;
  range: GlucoseRange;
  glucose: GlucoseReading[];
  insulin: InsulinDose[];
  meals: Meal[];
  activities: ActivityEntry[];
  weights: WeightEntry[];
  notes: NoteEntry[];
  savedMeals: SavedMeal[];
  customFoods: FoodItem[];
  bolusHistory: BolusCalculation[];
  setpoints: RatioSetpoint[];
  bolusDraft: BolusDraft;
  pendingBolus: PendingBolus;
  /** Set when the user confirms a calculation in this session. */
  lastSavedBolusId: string | null;
};

type Actions = {
  addGlucose: (r: Omit<GlucoseReading, 'id' | 'userId'>) => void;
  addInsulin: (d: Omit<InsulinDose, 'id' | 'userId'>) => void;
  addWeight: (w: Omit<WeightEntry, 'id' | 'userId'>) => void;
  addNote: (text: string, timestamp?: string) => void;
  logMealItems: (mealType: MealType, items: Omit<MealItem, 'id'>[], opts?: { name?: string; timestamp?: string }) => Meal;
  addCustomFood: (food: Omit<FoodItem, 'id' | 'source'>) => FoodItem;
  saveMealTemplate: (name: string, mealType: MealType, items: MealItem[]) => void;
  saveBolus: (calc: Omit<BolusCalculation, 'id'>) => BolusCalculation;
  setBolusDraft: (d: BolusDraft) => void;
  setPendingBolus: (p: PendingBolus) => void;
  /** Explicit user action: make this ratio the setpoint for its meal type. */
  setRatioSetpoint: (sp: Omit<RatioSetpoint, 'id' | 'createdAt' | 'previousGramsPerUnit'>) => RatioSetpoint | null;
  /** Ends the setpoint and restores the ratio that was in place before it. */
  resetSetpoint: (id: string) => void;
  updateProfile: (p: Partial<UserProfile>) => void;
  updateInsulinProfile: (p: Partial<Omit<InsulinProfile, 'carbRatios'>>) => void;
  updateCarbRatio: (id: string, patch: Partial<CarbRatioWindow>) => void;
  updateNutritionGoals: (g: Partial<NutritionGoals>) => void;
  updateWeightGoal: (g: Partial<WeightGoal>) => void;
  resetDemoData: () => void;
};

function seedState(): State {
  const seed = generateSeedData(new Date());
  return {
    user: seed.user,
    insulinProfile: seed.insulinProfile,
    nutritionGoals: seed.nutritionGoals,
    weightGoal: seed.weightGoal,
    range: DEFAULT_RANGE,
    glucose: seed.glucose,
    insulin: seed.insulin,
    meals: seed.meals,
    activities: seed.activities,
    weights: seed.weights,
    notes: [],
    savedMeals: seed.savedMeals,
    customFoods: [],
    bolusHistory: seed.bolusHistory,
    setpoints: seed.setpoints,
    bolusDraft: null,
    pendingBolus: null,
    lastSavedBolusId: null,
  };
}

const byTimestamp = <T extends { timestamp: string }>(a: T, b: T) => a.timestamp.localeCompare(b.timestamp);
const insertSorted = <T extends { timestamp: string }>(list: T[], item: T) => [...list, item].sort(byTimestamp);

export const useAppStore = create<State & Actions>()((set, get) => ({
  ...seedState(),

  addGlucose: (r) => set((s) => ({ glucose: insertSorted(s.glucose, { ...r, id: uid('g'), userId: USER_ID }) })),

  addInsulin: (d) => set((s) => ({ insulin: insertSorted(s.insulin, { ...d, id: uid('dose'), userId: USER_ID }) })),

  addWeight: (w) => set((s) => ({ weights: insertSorted(s.weights, { ...w, id: uid('w'), userId: USER_ID }) })),

  addNote: (text, timestamp = new Date().toISOString()) =>
    set((s) => ({ notes: insertSorted(s.notes, { id: uid('note'), userId: USER_ID, text, timestamp }) })),

  logMealItems: (mealType, rawItems, opts = {}) => {
    const items = rawItems.map((i) => ({ ...i, id: uid('mi') }));
    const n = mealTotals(items);
    const meal: Meal = {
      id: uid('meal'),
      userId: USER_ID,
      name: opts.name,
      mealType,
      items,
      calories: n.calories,
      carbs: n.carbs,
      protein: n.protein,
      fat: n.fat,
      fiber: n.fiber,
      sugar: n.sugar,
      timestamp: opts.timestamp ?? new Date().toISOString(),
    };
    set((s) => ({ meals: insertSorted(s.meals, meal) }));
    return meal;
  },

  addCustomFood: (food) => {
    const item: FoodItem = { ...food, id: uid('food'), source: 'custom' };
    set((s) => ({ customFoods: [item, ...s.customFoods] }));
    return item;
  },

  saveMealTemplate: (name, mealType, items) =>
    set((s) => ({ savedMeals: [{ id: uid('saved'), name, mealType, items }, ...s.savedMeals] })),

  saveBolus: (calc) => {
    const saved: BolusCalculation = { ...calc, id: uid('calc') };
    const units = calc.confirmedUnits ?? calc.suggestedBolus;
    set((s) => ({
      bolusHistory: [saved, ...s.bolusHistory],
      bolusDraft: null,
      pendingBolus: null,
      lastSavedBolusId: saved.id,
      insulin:
        units > 0
          ? insertSorted(s.insulin, {
              id: uid('dose'),
              userId: USER_ID,
              units,
              insulinType: 'rapid',
              source: 'bolus-calculator',
              calculationId: saved.id,
              timestamp: calc.timestamp,
            })
          : s.insulin,
    }));
    return saved;
  },

  setBolusDraft: (bolusDraft) => set({ bolusDraft }),

  setPendingBolus: (pendingBolus) => set({ pendingBolus }),

  setRatioSetpoint: (input) => {
    const window = get().insulinProfile.carbRatios.find((c) => c.id === input.windowId);
    if (!window) return null;
    const now = new Date().toISOString();
    const setpoint: RatioSetpoint = {
      ...input,
      id: uid('setpoint'),
      createdAt: now,
      previousGramsPerUnit: window.gramsPerUnit,
    };
    set((s) => ({
      setpoints: [
        ...s.setpoints.map((x) =>
          x.windowId === input.windowId && !x.endedAt ? { ...x, endedAt: now, endReason: 'new-setpoint' as const } : x,
        ),
        setpoint,
      ],
      insulinProfile: {
        ...s.insulinProfile,
        carbRatios: s.insulinProfile.carbRatios.map((c) =>
          c.id === input.windowId ? { ...c, gramsPerUnit: input.gramsPerUnit } : c,
        ),
      },
    }));
    return setpoint;
  },

  resetSetpoint: (id) =>
    set((s) => {
      const sp = s.setpoints.find((x) => x.id === id);
      if (!sp || sp.endedAt) return {};
      const now = new Date().toISOString();
      return {
        setpoints: s.setpoints.map((x) => (x.id === id ? { ...x, endedAt: now, endReason: 'reset' as const } : x)),
        insulinProfile: {
          ...s.insulinProfile,
          carbRatios: s.insulinProfile.carbRatios.map((c) =>
            c.id === sp.windowId ? { ...c, gramsPerUnit: sp.previousGramsPerUnit } : c,
          ),
        },
      };
    }),

  updateProfile: (p) => set((s) => ({ user: { ...s.user, ...p } })),

  // Settings change only through explicit user edits — never automatically.
  updateInsulinProfile: (p) => set((s) => ({ insulinProfile: { ...s.insulinProfile, ...p } })),

  updateCarbRatio: (id, patch) =>
    set((s) => ({
      // Editing a ratio by hand ends any setpoint on it: the new value is the baseline now.
      setpoints:
        patch.gramsPerUnit != null &&
        patch.gramsPerUnit !== s.insulinProfile.carbRatios.find((c) => c.id === id)?.gramsPerUnit
          ? s.setpoints.map((x) =>
              x.windowId === id && !x.endedAt
                ? { ...x, endedAt: new Date().toISOString(), endReason: 'manual-edit' as const }
                : x,
            )
          : s.setpoints,
      insulinProfile: {
        ...s.insulinProfile,
        carbRatios: s.insulinProfile.carbRatios.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      },
    })),

  updateNutritionGoals: (g) => set((s) => ({ nutritionGoals: { ...s.nutritionGoals, ...g } })),

  updateWeightGoal: (g) => set((s) => ({ weightGoal: { ...s.weightGoal, ...g } })),

  resetDemoData: () => set(seedState()),
}));

export const getState = () => useAppStore.getState();
