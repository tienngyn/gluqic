/**
 * Insulin-on-board using the exponential activity curve popularised by
 * OpenAPS (oref0). Deterministic and pure: pass `now` explicitly.
 */
import type { InsulinDose } from '@/types/models';

export type IobModel = {
  durationHours: number;
  peakMinutes: number;
};

/** Fraction (0–1) of a bolus still active `minutesAgo` after injection. */
export function iobFraction(minutesAgo: number, model: IobModel): number {
  const end = model.durationHours * 60;
  const peak = model.peakMinutes;
  if (minutesAgo <= 0) return 1;
  if (minutesAgo >= end) return 0;

  const tau = (peak * (1 - peak / end)) / (1 - (2 * peak) / end);
  const a = (2 * tau) / end;
  const S = 1 / (1 - a + (1 + a) * Math.exp(-end / tau));
  const t = minutesAgo;
  const fraction =
    1 - S * (1 - a) * ((t ** 2 / (tau * end * (1 - a)) - t / tau - 1) * Math.exp(-t / tau) + 1);
  return Math.min(1, Math.max(0, fraction));
}

/** Total rapid insulin still active at `now`, in units. */
export function activeInsulin(doses: InsulinDose[], now: Date, model: IobModel): number {
  const nowMs = now.getTime();
  let total = 0;
  for (const d of doses) {
    if (d.insulinType === 'long') continue;
    const minutesAgo = (nowMs - new Date(d.timestamp).getTime()) / 60000;
    if (minutesAgo < 0) continue;
    total += d.units * iobFraction(minutesAgo, model);
  }
  return Math.round(total * 100) / 100;
}
