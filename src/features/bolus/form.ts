import { z } from 'zod';

import type { BolusFieldError, PlannedActivity } from '@/domain/bolus/engine';
import type { GlucoseTrend, MealType } from '@/types/models';

const numeric = (required: string) =>
  z
    .string()
    .trim()
    .min(1, required)
    .refine((v) => Number.isFinite(Number(v)), 'Enter a number');

/** Form-level shape. Range checks live in the engine so there is one source of truth. */
export const bolusFormSchema = z.object({
  glucose: numeric('Enter your current glucose'),
  carbs: numeric('Enter carbs (0 if none)'),
  activeInsulin: numeric('Enter active insulin (0 if none)'),
  target: numeric('Enter a target'),
  mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']),
  activity: z.enum(['none', 'light', 'moderate', 'hard']),
  trend: z.enum(['rising-fast', 'rising', 'stable', 'falling', 'falling-fast']).optional(),
});

export type BolusFormValues = {
  glucose: string;
  carbs: string;
  activeInsulin: string;
  target: string;
  mealType: MealType;
  activity: PlannedActivity;
  trend?: GlucoseTrend;
};

export type BolusFormField = 'glucose' | 'carbs' | 'activeInsulin' | 'target';

const ENGINE_TO_FORM: Record<string, BolusFormField> = {
  currentGlucose: 'glucose',
  carbsGrams: 'carbs',
  activeInsulin: 'activeInsulin',
  targetGlucose: 'target',
};

export function mapEngineErrors(errors: BolusFieldError[]): Partial<Record<BolusFormField, string>> {
  const out: Partial<Record<BolusFormField, string>> = {};
  for (const e of errors) {
    const field = ENGINE_TO_FORM[e.field];
    if (field && !out[field]) out[field] = e.message;
  }
  return out;
}
