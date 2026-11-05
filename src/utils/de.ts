/** German formatting for the reduced app. */

/** 7.5 → "7,5"; whole numbers stay whole unless `digits` is given. */
export function num(n: number, digits?: number): string {
  const d = digits ?? (Number.isInteger(n) ? 0 : 1);
  return n.toFixed(d).replace('.', ',');
}

/** 1 IE : 9,5 g */
export const ratioText = (gramsPerUnit: number) => `1 IE : ${num(Math.round(gramsPerUnit * 2) / 2)} g`;

const DAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONTHS = ['Jan', 'Feb', 'März', 'Apr', 'Mai', 'Juni', 'Juli', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

export function dayText(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(now) - start(d)) / 86400000);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Gestern';
  return `${DAYS[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
}

export function timeText(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
