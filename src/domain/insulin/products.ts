import type { RapidInsulin } from '@/types/models';

/**
 * Action-curve defaults per rapid insulin, used by the IOB model. Peaks follow
 * the OpenAPS presets ("rapid-acting" 75 min, "ultra-rapid" 55 min). Duration
 * is only a starting suggestion — the user's care team value always wins.
 */
export const RAPID_INSULINS: Record<
  RapidInsulin,
  { label: string; generic: string; peakMinutes: number; suggestedDurationHours: number }
> = {
  novorapid: { label: 'NovoRapid', generic: 'insulin aspart', peakMinutes: 75, suggestedDurationHours: 5 },
  humalog: { label: 'Humalog', generic: 'insulin lispro', peakMinutes: 75, suggestedDurationHours: 5 },
  apidra: { label: 'Apidra', generic: 'insulin glulisine', peakMinutes: 75, suggestedDurationHours: 5 },
  fiasp: { label: 'Fiasp', generic: 'faster insulin aspart', peakMinutes: 55, suggestedDurationHours: 5 },
  lyumjev: { label: 'Lyumjev', generic: 'insulin lispro-aabc', peakMinutes: 55, suggestedDurationHours: 5 },
  other: { label: 'Other', generic: 'rapid-acting insulin', peakMinutes: 75, suggestedDurationHours: 5 },
};

export const RAPID_INSULIN_OPTIONS = (Object.keys(RAPID_INSULINS) as RapidInsulin[]).map((value) => ({
  value,
  label: RAPID_INSULINS[value].label,
}));
