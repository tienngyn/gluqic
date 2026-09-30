/**
 * Turning a user-chosen dose into a carb-ratio setpoint.
 *
 * The engine computes  suggested = meal + correction − IOB.
 * If the user takes a different amount, only the meal part is assumed to
 * change (correction and IOB stay as calculated), so:
 *
 *   mealUnits = unitsTaken − correction + IOB
 *   ratio     = carbs ÷ mealUnits
 *
 * Deterministic and pure. It only proposes a ratio; the user decides whether
 * it becomes the setpoint.
 */
import type { RatioSetpoint } from '@/types/models';

import { roundTo } from './engine';

/** A setpoint may change the ratio by at most this factor either way. */
export const MAX_SETPOINT_FACTOR = 2;
/** Above this relative change, show a caution. */
export const CAUTION_CHANGE = 0.25;

export type SetpointInput = {
  unitsTaken: number;
  carbs: number;
  correctionBolus: number;
  activeInsulin: number;
  currentGramsPerUnit: number;
};

export type SetpointProposal =
  | {
      ok: true;
      gramsPerUnit: number;
      mealUnits: number;
      /** Relative change in insulin per gram, e.g. +0.087 = 8.7 % more insulin. */
      insulinChange: number;
      caution?: string;
      steps: { label: string; formula: string; value: string }[];
    }
  | { ok: false; reason: string };

export function proposeSetpoint(i: SetpointInput): SetpointProposal {
  if (!(i.carbs > 0)) return { ok: false, reason: 'A setpoint needs a meal with carbs.' };
  if (!(i.unitsTaken > 0)) return { ok: false, reason: 'A setpoint needs a dose above 0 U.' };

  const mealUnits = i.unitsTaken - i.correctionBolus + i.activeInsulin;
  if (mealUnits <= 0) {
    return { ok: false, reason: 'After correction and active insulin, no insulin is left for the meal.' };
  }
  const gramsPerUnit = roundTo(i.carbs / mealUnits, 1);
  if (gramsPerUnit < 1 || gramsPerUnit > 150) {
    return { ok: false, reason: 'That would mean a carb ratio outside 1–150 g per unit.' };
  }
  const factor = i.currentGramsPerUnit / gramsPerUnit;
  if (factor > MAX_SETPOINT_FACTOR || factor < 1 / MAX_SETPOINT_FACTOR) {
    return {
      ok: false,
      reason: 'That is more than double or less than half your current ratio. Change it in Diabetes settings with your care team instead.',
    };
  }
  const insulinChange = roundTo(factor - 1, 3);
  const steps = [
    {
      label: 'Insulin for the meal',
      formula: `${roundTo(i.unitsTaken, 2)} U taken − ${roundTo(i.correctionBolus, 2)} correction + ${roundTo(i.activeInsulin, 2)} active`,
      value: `${roundTo(mealUnits, 2)} U`,
    },
    {
      label: 'New ratio',
      formula: `${roundTo(i.carbs, 1)} g ÷ ${roundTo(mealUnits, 2)} U`,
      value: `1 U : ${gramsPerUnit} g`,
    },
  ];
  return {
    ok: true,
    gramsPerUnit,
    mealUnits: roundTo(mealUnits, 2),
    insulinChange,
    steps,
    caution:
      Math.abs(insulinChange) > CAUTION_CHANGE
        ? `This is ${Math.round(Math.abs(insulinChange) * 100)}% ${insulinChange > 0 ? 'more' : 'less'} insulin per gram than before. Make sure that is intended.`
        : undefined,
  };
}

/** The setpoint currently in force for a meal type, if any. */
export function activeSetpoint(setpoints: RatioSetpoint[], mealType: string): RatioSetpoint | undefined {
  let latest: RatioSetpoint | undefined;
  for (const s of setpoints) {
    if (s.mealType !== mealType || s.endedAt) continue;
    if (!latest || s.createdAt > latest.createdAt) latest = s;
  }
  return latest;
}
