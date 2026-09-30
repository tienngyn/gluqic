import type { GlucoseReading } from '@/types/models';

import { DexcomShareClient, mergeSensorReadings, parseDexcomDate, parseTrend, ShareError, SHARE_REGIONS } from './client';

type Call = { url: string; body?: unknown };

function fakeFetch(responses: { status?: number; body: unknown }[]) {
  const calls: Call[] = [];
  const impl = async (url: string, init: { body?: string }) => {
    calls.push({ url, body: init.body ? JSON.parse(init.body) : undefined });
    const r = responses.shift() ?? { status: 500, body: { Code: 'Unexpected' } };
    const status = r.status ?? 200;
    return { ok: status < 400, status, text: async () => JSON.stringify(r.body) };
  };
  return { impl, calls };
}

const entries = [
  { WT: 'Date(1790760000000)', ST: 'Date(1790760000000)', DT: 'Date(1790760000000+0200)', Value: 156, Trend: 'Flat' },
  { WT: 'Date(1790759700000)', Value: 150, Trend: 'FortyFiveUp' },
];

describe('parsing', () => {
  it('parses Dexcom dates with and without offsets', () => {
    expect(parseDexcomDate('Date(1790760000000)')).toBe(1790760000000);
    expect(parseDexcomDate('Date(1790760000000-0400)')).toBe(1790760000000);
    expect(parseDexcomDate('nope')).toBeUndefined();
  });

  it('maps trend names and numbers', () => {
    expect(parseTrend('Flat')).toBe('stable');
    expect(parseTrend('SingleDown')).toBe('falling-fast');
    expect(parseTrend(3)).toBe('rising');
    expect(parseTrend('NotComputable')).toBeUndefined();
  });
});

describe('DexcomShareClient', () => {
  it('logs in with account id then session id, and reads readings oldest first', async () => {
    const { impl, calls } = fakeFetch([{ body: 'acc-123' }, { body: 'sess-456' }, { body: entries }]);
    const client = new DexcomShareClient('ous', 'tien@example.com', 'secret', impl);
    const readings = await client.readLatest('u');

    expect(calls[0].url).toBe(`${SHARE_REGIONS.ous.baseUrl}/General/AuthenticatePublisherAccount`);
    expect(calls[0].body).toEqual({ accountName: 'tien@example.com', password: 'secret', applicationId: SHARE_REGIONS.ous.applicationId });
    expect(calls[1].body).toMatchObject({ accountId: 'acc-123' });
    expect(calls[2].url).toContain('ReadPublisherLatestGlucoseValues?sessionId=sess-456&minutes=1440&maxCount=288');
    expect(readings.map((r) => [r.value, r.trend, r.source])).toEqual([
      [150, 'rising', 'cgm'],
      [156, 'stable', 'cgm'],
    ]);
  });

  it('reports wrong credentials clearly', async () => {
    const { impl } = fakeFetch([{ status: 500, body: { Code: 'AccountPasswordInvalid' } }]);
    await expect(new DexcomShareClient('ous', 'x', 'y', impl).login()).rejects.toMatchObject({ code: 'auth' });
    const zero = fakeFetch([{ body: '00000000-0000-0000-0000-000000000000' }]);
    await expect(new DexcomShareClient('ous', 'x', 'y', zero.impl).login()).rejects.toBeInstanceOf(ShareError);
  });

  it('logs in again once when the session expired', async () => {
    const { impl, calls } = fakeFetch([
      { body: 'acc' },
      { body: 'sess1' },
      { status: 500, body: { Code: 'SessionIdNotFound' } },
      { body: 'acc' },
      { body: 'sess2' },
      { body: entries },
    ]);
    const readings = await new DexcomShareClient('us', 'x', 'y', impl).readLatest('u', 30, 6);
    expect(readings).toHaveLength(2);
    expect(calls[5].url).toContain('sessionId=sess2&minutes=30&maxCount=6');
  });
});

describe('mergeSensorReadings', () => {
  const r = (min: number, source: GlucoseReading['source'] = 'cgm', value = 120): GlucoseReading => ({
    id: `${source}${min}`,
    userId: 'u',
    value,
    source,
    timestamp: new Date(Date.UTC(2026, 8, 30, 12, min)).toISOString(),
  });

  it('skips readings that duplicate an existing sensor reading within 2.5 min', () => {
    const existing = [r(0, 'healthkit'), r(5, 'manual')];
    const merged = mergeSensorReadings(existing, [r(1), r(5), r(10)]);
    // cgm1 duplicates healthkit0; the typed value at :05 does not block the sensor value.
    expect(merged.map((x) => x.id).sort()).toEqual(['cgm10', 'cgm5', 'healthkit0', 'manual5']);
  });
});
