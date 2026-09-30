export type Point = { x: number; y: number };

/**
 * Monotone cubic interpolation (Fritsch–Carlson) as an SVG path. Smooth like
 * a spline, but never overshoots the data — important when a curve must
 * not suggest a low or high that didn't happen.
 */
export function monotonePath(pts: Point[]): string {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return `M${pts[0].x},${pts[0].y}`;
  if (n === 2) return `M${pts[0].x},${pts[0].y}L${pts[1].x},${pts[1].y}`;

  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1].x - pts[i].x;
    slope[i] = dx[i] === 0 ? 0 : (pts[i + 1].y - pts[i].y) / dx[i];
  }
  const m: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) {
    m[i] = slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2;
  }
  m[n - 1] = slope[n - 2];
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / slope[i];
    const b = m[i + 1] / slope[i];
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      m[i] = t * a * slope[i];
      m[i + 1] = t * b * slope[i];
    }
  }

  let d = `M${r(pts[0].x)},${r(pts[0].y)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const h = dx[i] / 3;
    d += `C${r(p0.x + h)},${r(p0.y + m[i] * h)} ${r(p1.x - h)},${r(p1.y - m[i + 1] * h)} ${r(p1.x)},${r(p1.y)}`;
  }
  return d;
}

const r = (n: number) => Math.round(n * 100) / 100;

/** Averages points into at most `maxPoints` buckets along x. */
export function downsample(pts: Point[], maxPoints: number): Point[] {
  if (pts.length <= maxPoints || maxPoints < 2) return pts;
  const size = pts.length / maxPoints;
  const out: Point[] = [];
  for (let b = 0; b < maxPoints; b++) {
    const start = Math.floor(b * size);
    const end = Math.min(pts.length, Math.floor((b + 1) * size));
    let sx = 0;
    let sy = 0;
    for (let i = start; i < end; i++) {
      sx += pts[i].x;
      sy += pts[i].y;
    }
    const count = end - start;
    if (count > 0) out.push({ x: sx / count, y: sy / count });
  }
  // Always keep the true last point so "now" is exact.
  out[out.length - 1] = pts[pts.length - 1];
  return out;
}

export function extent(values: number[]): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return [lo, hi];
}

export function nearestIndex(xs: number[], x: number): number {
  let lo = 0;
  let hi = xs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] < x) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(xs[lo - 1] - x) <= Math.abs(xs[lo] - x)) return lo - 1;
  return lo;
}
