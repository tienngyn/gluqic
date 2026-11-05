import { colors } from '@/constants/theme';
import type { MealOutcome } from '@/domain/system/analyze';

export const OUTCOME: Record<MealOutcome, { label: string; color: string; detail?: string }> = {
  good: { label: 'Passt', color: colors.green },
  'too-little': { label: 'Zu wenig Insulin', color: colors.orange },
  'too-much': { label: 'Zu viel Insulin', color: colors.red },
  pending: { label: 'Wartet auf Werte', color: colors.textMuted },
  'no-data': { label: 'Kein Wert nach 3 h', color: colors.textMuted, detail: 'Zählt nicht' },
  'off-start': { label: 'Start außerhalb 70–180', color: colors.textMuted, detail: 'Zählt nicht für den Faktor' },
  mixed: { label: 'Zweite Mahlzeit', color: colors.textMuted, detail: 'Innerhalb von 3 h nochmal gegessen' },
};
