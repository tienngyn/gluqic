/**
 * Core domain models for gluciq.
 *
 * All glucose values are stored in mg/dL internally. Conversion to mmol/L
 * happens only at the presentation layer (see `utils/units.ts`).
 */

export type GlucoseUnit = 'mg/dL' | 'mmol/L';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type GlucoseTrend = 'rising-fast' | 'rising' | 'stable' | 'falling' | 'falling-fast';

export type GlucoseContext =
  | 'fasting'
  | 'before-meal'
  | 'after-meal'
  | 'before-exercise'
  | 'after-exercise'
  | 'bedtime'
  | 'other';

export type DataSource = 'manual' | 'healthkit' | 'cgm';

export type UserProfile = {
  id: string;
  name: string;
  glucoseUnit: GlucoseUnit;
  createdAt: string;
};

export type GlucoseReading = {
  id: string;
  userId: string;
  /** mg/dL */
  value: number;
  timestamp: string;
  trend?: GlucoseTrend;
  context?: GlucoseContext;
  note?: string;
  source: DataSource;
};

export type InsulinDose = {
  id: string;
  userId: string;
  units: number;
  insulinType?: 'rapid' | 'long' | 'other';
  timestamp: string;
  source: 'manual' | 'bolus-calculator';
  /**
   * Why rapid insulin was taken. Older entries may lack it; see
   * `classifyDose`, which infers it from timing.
   */
  purpose?: 'meal' | 'correction';
  /** Links a dose to the calculation that produced the suggestion. */
  calculationId?: string;
  note?: string;
};

export type Nutrients = {
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
  fiber?: number;
  sugar?: number;
};

export type FoodItem = {
  id: string;
  name: string;
  brand?: string;
  barcode?: string;
  /** Nutrients per `servingSize` of `servingUnit`. */
  servingSize: number;
  servingUnit: 'g' | 'ml' | 'piece';
  servingLabel?: string;
  nutrients: Nutrients;
  source: 'custom' | 'open-food-facts' | 'usda' | 'mock';
};

export type MealItem = {
  id: string;
  foodId?: string;
  name: string;
  /** Multiplier applied to the food's serving nutrients. */
  servings: number;
  nutrients: Nutrients;
};

export type Meal = {
  id: string;
  userId: string;
  name?: string;
  mealType: MealType;
  items: MealItem[];
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  timestamp: string;
};

export type SavedMeal = {
  id: string;
  name: string;
  mealType: MealType;
  items: MealItem[];
};

export type WeightEntry = {
  id: string;
  userId: string;
  weightKg: number;
  bodyFatPct?: number;
  timestamp: string;
  source: DataSource;
};

export type ActivityEntry = {
  id: string;
  userId: string;
  kind: 'walk' | 'run' | 'cycle' | 'strength' | 'other';
  durationMin: number;
  intensity: 'light' | 'moderate' | 'hard';
  activeEnergyKcal?: number;
  timestamp: string;
  source: DataSource;
};

export type NoteEntry = {
  id: string;
  userId: string;
  text: string;
  timestamp: string;
};

/** A carb ratio that applies inside a daily time window (minutes from midnight). */
export type CarbRatioWindow = {
  id: string;
  label: string;
  mealType: MealType;
  startMinute: number;
  endMinute: number;
  /** grams of carbohydrate covered by 1 U */
  gramsPerUnit: number;
};

export type InsulinProfile = {
  id: string;
  userId: string;
  /** mg/dL */
  targetGlucose: number;
  /** mg/dL drop per 1 U */
  correctionFactor: number;
  insulinDurationHours: number;
  /** Peak activity of the rapid insulin, minutes. Used by the IOB model. */
  insulinPeakMinutes: number;
  maxBolus: number;
  /** Below this glucose (mg/dL) the calculator will not suggest insulin. */
  minGlucoseForBolus: number;
  /** Rounding step for suggested doses, e.g. 0.5 for half-unit pens. */
  doseIncrement: number;
  carbRatios: CarbRatioWindow[];
};

/**
 * A carb ratio the user set explicitly by taking a different amount than
 * suggested. It becomes the ratio for that meal type and the baseline that
 * outcome tracking ("learning") compares against. Only the user creates,
 * ends or resets a setpoint — gluciq never changes one on its own.
 */
export type RatioSetpoint = {
  id: string;
  mealType: MealType;
  windowId: string;
  /** grams per 1 U from now on */
  gramsPerUnit: number;
  /** the ratio before this setpoint, restored on reset */
  previousGramsPerUnit: number;
  createdAt: string;
  /** How the ratio was derived, kept for audit. */
  origin: {
    calculationId?: string;
    unitsTaken: number;
    suggestedBolus: number;
    carbs: number;
    correctionBolus: number;
    activeInsulin: number;
  };
  endedAt?: string;
  endReason?: 'reset' | 'new-setpoint' | 'manual-edit';
};

export type NutritionGoals = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
};

export type WeightGoal = {
  targetKg: number;
  heightCm?: number;
};

export type GlucoseRange = {
  /** mg/dL */
  low: number;
  high: number;
  veryLow: number;
  veryHigh: number;
};

export type BolusCalculation = {
  id: string;
  currentGlucose: number;
  targetGlucose: number;
  carbs: number;
  carbRatio: number;
  correctionFactor: number;
  activeInsulin: number;
  mealType: MealType;
  mealBolus: number;
  correctionBolus: number;
  activeInsulinAdjustment: number;
  suggestedBolus: number;
  /** What the user actually confirmed/saved. */
  confirmedUnits?: number;
  warnings: string[];
  calculationVersion: string;
  timestamp: string;
};

/**
 * One meal + bolus outcome, the unit the pattern engine learns from.
 */
export type BolusEvent = {
  id: string;
  timestamp: string;
  glucoseBefore: number;
  glucoseTrend?: GlucoseTrend;
  carbs: number;
  protein?: number;
  fat?: number;
  mealType: MealType;
  insulinGiven: number;
  calculatedInsulin?: number;
  activeInsulin?: number;
  activityBefore?: number;
  activityAfter?: number;
  glucose1h?: number;
  glucose2h?: number;
  glucose3h?: number;
  glucose4h?: number;
  mealId?: string;
  mealName?: string;
  /** Correction insulin taken 20 min – 3 h after the meal. */
  correctionAfter?: number;
};

export type InsightKind =
  | 'meal-pattern'
  | 'time-of-day'
  | 'exercise'
  | 'high-fat'
  | 'overnight'
  | 'trend'
  | 'setpoint'
  | 'correction'
  | 'positive';

export type Insight = {
  id: string;
  type: InsightKind;
  title: string;
  body: string;
  /** Optional nudge. Never a dose instruction. */
  suggestion?: string;
  /** 0–1 */
  confidence?: number;
  tone: 'neutral' | 'positive' | 'attention';
  createdAt: string;
};

export type TimelineEvent =
  | { kind: 'glucose'; id: string; timestamp: string; data: GlucoseReading }
  | { kind: 'meal'; id: string; timestamp: string; data: Meal }
  | { kind: 'insulin'; id: string; timestamp: string; data: InsulinDose }
  | { kind: 'activity'; id: string; timestamp: string; data: ActivityEntry }
  | { kind: 'weight'; id: string; timestamp: string; data: WeightEntry }
  | { kind: 'note'; id: string; timestamp: string; data: NoteEntry };
