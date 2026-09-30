import type { GlucoseTrend, GlucoseUnit, MealType } from '@/types/models';

export const MGDL_PER_MMOL = 18.0182;

export function toDisplayGlucose(mgdl: number, unit: GlucoseUnit): number {
  return unit === 'mmol/L' ? Math.round((mgdl / MGDL_PER_MMOL) * 10) / 10 : Math.round(mgdl);
}

export function fromDisplayGlucose(value: number, unit: GlucoseUnit): number {
  return unit === 'mmol/L' ? Math.round(value * MGDL_PER_MMOL) : value;
}

export function formatGlucose(mgdl: number, unit: GlucoseUnit): string {
  const v = toDisplayGlucose(mgdl, unit);
  return unit === 'mmol/L' ? v.toFixed(1) : String(v);
}

export function formatUnits(u: number, digits = 1): string {
  return `${u.toFixed(digits)}`;
}

export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function formatTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function formatMinuteOfDay(m: number): string {
  const h = Math.floor(m / 60) % 24;
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDay(iso: string | Date, now = new Date()): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function formatShortDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function relativeTime(iso: string, now = new Date()): string {
  const mins = Math.round((now.getTime() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} h ago`;
  return formatDay(iso, now);
}

export function greeting(now = new Date()): string {
  const h = now.getHours();
  if (h < 5) return 'Good night';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export const TREND_META: Record<GlucoseTrend, { arrow: string; label: string }> = {
  'rising-fast': { arrow: '↑', label: 'Rising fast' },
  rising: { arrow: '↗', label: 'Rising' },
  stable: { arrow: '→', label: 'Stable' },
  falling: { arrow: '↘', label: 'Falling' },
  'falling-fast': { arrow: '↓', label: 'Falling fast' },
};

export const MEAL_LABEL: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

let counter = 0;
export function uid(prefix = 'id'): string {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
