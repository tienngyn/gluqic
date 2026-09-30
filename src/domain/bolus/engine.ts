/**
 * gluciq bolus calculation engine — DEVELOPMENT PROTOTYPE.
 *
 * This module is intentionally small, pure and deterministic:
 *  - no I/O, no clock, no randomness, no AI/LLM involvement
 *  - every number in the result is traceable through `steps`
 *  - it never adapts ratios or factors on its own
 *
 * It has NOT been clinically validated and must not be used for real
 * dosing decisions.
 *
 *   mealBolus       = carbs / carbRatio
 *   correctionBolus = (currentGlucose − targetGlucose) / correctionFactor
 *   suggested       = mealBolus + correctionBolus − activeInsulin
 *
 * Then, in order: low-glucose block → floor at 0 → round down to the dose
 * increment → cap at max bolus.
 */
import { z } from 'zod';

import type { GlucoseTrend } from '@/types/models';

export const BOLUS_CALCULATION_VERSION = 'gluciq-bolus/1.0.0-prototype';

export const bolusInputSchema = z.object({
  currentGlucose: z
    .number({ error: 'Enter your current glucose' })
    .finite()
    .min(20, 'Glucose must be at least 20 mg/dL')
    .max(600, 'Glucose must be at most 600 mg/dL'),
  targetGlucose: z
    .number({ error: 'Enter a target glucose' })
    .finite()
    .min(70, 'Target must be at least 70 mg/dL')
    .max(200, 'Target must be at most 200 mg/dL'),
  carbsGrams: z
    .number({ error: 'Enter carbs (0 if none)' })
    .finite()
    .min(0, 'Carbs cannot be negative')
    .max(400, 'Carbs must be at most 400 g'),
  carbRatio: z
    .number({ error: 'Carb ratio is required' })
    .finite()
    .min(1, 'Carb ratio must be at least 1 g/U')
    .max(150, 'Carb ratio must be at most 150 g/U'),
  correctionFactor: z
    .number({ error: 'Correction factor is required' })
    .finite()
    .min(5, 'Correction factor must be at least 5 mg/dL/U')
    .max(400, 'Correction factor must be at most 400 mg/dL/U'),
  activeInsulin: z
    .number({ error: 'Enter active insulin (0 if none)' })
    .finite()
    .min(0, 'Active insulin cannot be negative')
    .max(50, 'Active insulin must be at most 50 U'),
});

export type BolusInput = z.infer<typeof bolusInputSchema>;

export const bolusSafetySchema = z.object({
  maxBolus: z.number().finite().positive().max(50),
  /** At or below this glucose, no insulin is suggested. */
  minGlucoseForBolus: z.number().finite().min(40).max(120),
  doseIncrement: z.number().finite().positive().max(1),
  /** Above this glucose, show a high-glucose caution. */
  highGlucoseCaution: z.number().finite().min(180).max(400).default(250),
});

export type BolusSafetySettings = z.input<typeof bolusSafetySchema>;

export type PlannedActivity = 'none' | 'light' | 'moderate' | 'hard';

/** Context is informational only: it produces warnings, never dose changes. */
export type BolusContext = {
  trend?: GlucoseTrend;
  plannedActivity?: PlannedActivity;
};

export type BolusWarningCode =
  | 'low-glucose-blocked'
  | 'below-target'
  | 'high-glucose'
  | 'floored-at-zero'
  | 'capped-at-max'
  | 'rounded-down'
  | 'trend-falling'
  | 'trend-rising'
  | 'planned-activity';

export type BolusWarning = {
  code: BolusWarningCode;
  severity: 'info' | 'caution' | 'critical';
  message: string;
};

export type BolusStep = {
  label: string;
  formula: string;
  /** Units of insulin, signed. */
  value: number;
};

export type BolusBreakdown = {
  mealBolus: number;
  correctionBolus: number;
  activeInsulinAdjustment: number;
  /** meal + correction − IOB, before any safety step. */
  rawTotal: number;
  suggestedBolus: number;
};

export type BolusFieldError = { field: string; message: string };

export type BolusResult =
  | { ok: false; errors: BolusFieldError[]; version: string }
  | {
      ok: true;
      input: BolusInput;
      breakdown: BolusBreakdown;
      steps: BolusStep[];
      warnings: BolusWarning[];
      /** True when a safety rule forced the suggestion to 0. */
      blocked: boolean;
      version: string;
    };

const EPSILON = 1e-9;

/** Round to `digits` decimals, stable against float noise. */
export function roundTo(value: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round((value + Number.EPSILON) * f) / f;
}

/** Round DOWN to the nearest dose increment (conservative). */
export function roundDownToIncrement(value: number, increment: number): number {
  if (value <= 0) return 0;
  const steps = Math.floor(value / increment + EPSILON);
  return roundTo(steps * increment, 3);
}

function fmt(n: number, digits = 1): string {
  return roundTo(n, digits).toString();
}

function signed(n: number): string {
  const r = roundTo(n, 2);
  return r > 0 ? `+${r}` : `${r}`;
}

export function calculateBolus(
  rawInput: unknown,
  rawSafety: BolusSafetySettings,
  context: BolusContext = {},
): BolusResult {
  const parsed = bolusInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      version: BOLUS_CALCULATION_VERSION,
      errors: parsed.error.issues.map((i) => ({
        field: String(i.path[0] ?? 'input'),
        message: i.message,
      })),
    };
  }
  const safetyParsed = bolusSafetySchema.safeParse(rawSafety);
  if (!safetyParsed.success) {
    return {
      ok: false,
      version: BOLUS_CALCULATION_VERSION,
      errors: safetyParsed.error.issues.map((i) => ({
        field: `safety.${String(i.path[0] ?? '')}`,
        message: i.message,
      })),
    };
  }

  const input = parsed.data;
  const safety = safetyParsed.data;
  const warnings: BolusWarning[] = [];

  const mealBolus = input.carbsGrams / input.carbRatio;
  const correctionBolus = (input.currentGlucose - input.targetGlucose) / input.correctionFactor;
  const activeInsulinAdjustment = -input.activeInsulin;
  const rawTotal = mealBolus + correctionBolus + activeInsulinAdjustment;

  const steps: BolusStep[] = [
    {
      label: 'Meal insulin',
      formula: `${fmt(input.carbsGrams, 0)} g ÷ ${fmt(input.carbRatio)} g/U`,
      value: roundTo(mealBolus),
    },
    {
      label: 'Correction',
      formula: `(${fmt(input.currentGlucose, 0)} − ${fmt(input.targetGlucose, 0)}) ÷ ${fmt(input.correctionFactor, 0)}`,
      value: roundTo(correctionBolus),
    },
    {
      label: 'Active insulin',
      formula: `− ${fmt(input.activeInsulin)} U on board`,
      value: roundTo(activeInsulinAdjustment),
    },
  ];

  let suggested = rawTotal;
  let blocked = false;

  if (input.currentGlucose <= safety.minGlucoseForBolus) {
    blocked = true;
    suggested = 0;
    warnings.push({
      code: 'low-glucose-blocked',
      severity: 'critical',
      message: `Glucose is at or below ${safety.minGlucoseForBolus} mg/dL. Treat the low first — no insulin is suggested.`,
    });
  } else {
    if (input.currentGlucose < input.targetGlucose) {
      warnings.push({
        code: 'below-target',
        severity: 'info',
        message: 'Glucose is below target, so the correction reduces the total.',
      });
    }
    if (input.currentGlucose >= safety.highGlucoseCaution) {
      warnings.push({
        code: 'high-glucose',
        severity: 'caution',
        message: 'Glucose is high. Follow your care plan (for example, checking ketones).',
      });
    }

    if (suggested < 0) {
      warnings.push({
        code: 'floored-at-zero',
        severity: 'info',
        message: 'Active insulin already covers this. The result is shown as 0 U, never negative.',
      });
      suggested = 0;
    }

    const rounded = roundDownToIncrement(suggested, safety.doseIncrement);
    if (roundTo(suggested, 3) !== rounded && suggested > 0) {
      warnings.push({
        code: 'rounded-down',
        severity: 'info',
        message: `Rounded down to the nearest ${safety.doseIncrement} U.`,
      });
    }
    suggested = rounded;

    if (suggested > safety.maxBolus) {
      warnings.push({
        code: 'capped-at-max',
        severity: 'caution',
        message: `Capped at your max bolus of ${safety.maxBolus} U. The calculated value was ${fmt(rawTotal)} U.`,
      });
      suggested = safety.maxBolus;
    }
  }

  if (context.trend === 'falling' || context.trend === 'falling-fast') {
    warnings.push({
      code: 'trend-falling',
      severity: 'caution',
      message: 'Glucose is falling. This calculation does not adjust for trend.',
    });
  } else if (context.trend === 'rising' || context.trend === 'rising-fast') {
    warnings.push({
      code: 'trend-rising',
      severity: 'info',
      message: 'Glucose is rising. This calculation does not adjust for trend.',
    });
  }

  if (context.plannedActivity && context.plannedActivity !== 'none') {
    warnings.push({
      code: 'planned-activity',
      severity: 'caution',
      message: 'Planned activity can lower glucose. This calculation does not adjust for activity.',
    });
  }

  return {
    ok: true,
    input,
    version: BOLUS_CALCULATION_VERSION,
    blocked,
    steps,
    warnings,
    breakdown: {
      mealBolus: roundTo(mealBolus),
      correctionBolus: roundTo(correctionBolus),
      activeInsulinAdjustment: roundTo(activeInsulinAdjustment),
      rawTotal: roundTo(rawTotal),
      suggestedBolus: roundTo(suggested, 3),
    },
  };
}

/** Human-readable one-line derivation, suitable for an audit log. */
export function describeCalculation(result: Extract<BolusResult, { ok: true }>): string {
  const b = result.breakdown;
  return `${signed(b.mealBolus)} meal ${signed(b.correctionBolus)} correction ${signed(
    b.activeInsulinAdjustment,
  )} IOB = ${fmt(b.rawTotal, 2)} → ${fmt(b.suggestedBolus, 2)} U (${result.version})`;
}
