import { downsample, monotonePath, nearestIndex } from './path';

describe('chart path helpers', () => {
  it('builds a path through every point', () => {
    const d = monotonePath([
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: 20, y: 5 },
      { x: 30, y: 0 },
    ]);
    expect(d.startsWith('M0,0')).toBe(true);
    expect(d.endsWith('30,0')).toBe(true);
    expect(d.match(/C/g)).toHaveLength(3);
  });

  it('keeps flat segments flat (no overshoot)', () => {
    const d = monotonePath([
      { x: 0, y: 5 },
      { x: 10, y: 5 },
      { x: 20, y: 5 },
    ]);
    const ys = [...d.matchAll(/-?[\d.]+,(-?[\d.]+)/g)].map((m) => Number(m[1]));
    expect(ys.length).toBeGreaterThan(0);
    expect(ys.every((y) => y === 5)).toBe(true);
  });

  it('downsamples and keeps the last point exact', () => {
    const pts = Array.from({ length: 1000 }, (_, i) => ({ x: i, y: i % 7 }));
    const out = downsample(pts, 100);
    expect(out).toHaveLength(100);
    expect(out[out.length - 1]).toEqual({ x: 999, y: 999 % 7 });
  });

  it('finds the nearest index', () => {
    expect(nearestIndex([0, 10, 20, 30], 14)).toBe(1);
    expect(nearestIndex([0, 10, 20, 30], 16)).toBe(2);
    expect(nearestIndex([0, 10, 20, 30], 99)).toBe(3);
  });
});
