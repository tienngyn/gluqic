/**
 * Dexcom Share client — real-time CGM values (every 5 min).
 *
 * Unofficial: this is the same web service the Dexcom follow app uses and
 * that open-source tools (pydexcom, Nightscout's share2nightscout-bridge,
 * xDrip) have used for years. Dexcom can change it without notice.
 * Requirements: Share is turned on in the Dexcom app (with at least one
 * follower). Credentials go only to Dexcom's own server.
 *
 * Browsers block these requests (no CORS), so it works in the iOS/Android
 * app, not in the web preview.
 */
import type { GlucoseReading, GlucoseTrend } from '@/types/models';

export type ShareRegion = 'ous' | 'us' | 'jp';

export const SHARE_REGIONS: Record<ShareRegion, { label: string; baseUrl: string; applicationId: string }> = {
  ous: {
    label: 'Outside the US',
    baseUrl: 'https://shareous1.dexcom.com/ShareWebServices/Services',
    applicationId: 'd89443d2-327c-4a6f-89e5-496bbb0317db',
  },
  us: {
    label: 'United States',
    baseUrl: 'https://share2.dexcom.com/ShareWebServices/Services',
    applicationId: 'd89443d2-327c-4a6f-89e5-496bbb0317db',
  },
  jp: {
    label: 'Japan',
    baseUrl: 'https://share.dexcom.jp/ShareWebServices/Services',
    applicationId: 'd8665ade-9673-4e27-9ff6-92db4ce13d13',
  },
};

const DEFAULT_ACCOUNT_ID = '00000000-0000-0000-0000-000000000000';

/** Dexcom trend names → gluciq trends. */
const TREND_MAP: Record<string, GlucoseTrend | undefined> = {
  DoubleUp: 'rising-fast',
  SingleUp: 'rising-fast',
  FortyFiveUp: 'rising',
  Flat: 'stable',
  FortyFiveDown: 'falling',
  SingleDown: 'falling-fast',
  DoubleDown: 'falling-fast',
  None: undefined,
  NotComputable: undefined,
  RateOutOfRange: undefined,
};
const TREND_BY_NUMBER = ['None', 'DoubleUp', 'SingleUp', 'FortyFiveUp', 'Flat', 'FortyFiveDown', 'SingleDown', 'DoubleDown', 'NotComputable', 'RateOutOfRange'];

export function parseTrend(t: string | number | undefined): GlucoseTrend | undefined {
  if (t == null) return undefined;
  const name = typeof t === 'number' ? TREND_BY_NUMBER[t] : t;
  return name ? TREND_MAP[name] : undefined;
}

/** "Date(1691455258000)" or "Date(1691455258000-0400)" → epoch ms (the number is already UTC). */
export function parseDexcomDate(s: string): number | undefined {
  const m = /Date\((-?\d+)(?:[+-]\d{4})?\)/.exec(s);
  return m ? Number(m[1]) : undefined;
}

export type ShareEntry = { WT: string; ST?: string; DT?: string; Value: number; Trend?: string | number };

export function toReading(e: ShareEntry, userId: string): GlucoseReading | undefined {
  const t = parseDexcomDate(e.WT);
  if (t == null || !Number.isFinite(e.Value) || e.Value < 20 || e.Value > 600) return undefined;
  const timestamp = new Date(t).toISOString();
  return {
    id: `dxs_${t}`,
    userId,
    value: Math.round(e.Value),
    timestamp,
    trend: parseTrend(e.Trend),
    source: 'cgm',
  };
}

export class ShareError extends Error {
  constructor(
    message: string,
    readonly code: 'auth' | 'session' | 'network' | 'blocked' | 'unknown',
  ) {
    super(message);
  }
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export class DexcomShareClient {
  private sessionId: string | null = null;

  constructor(
    private readonly region: ShareRegion,
    private readonly username: string,
    private readonly password: string,
    private readonly fetchImpl: FetchLike = fetch as unknown as FetchLike,
  ) {}

  private get cfg() {
    return SHARE_REGIONS[this.region];
  }

  private async post(path: string, body?: unknown): Promise<unknown> {
    let res;
    try {
      res = await this.fetchImpl(`${this.cfg.baseUrl}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': 'gluciq' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ShareError('Could not reach Dexcom. Check your connection.', 'network');
    }
    const text = await res.text();
    const data = text ? (JSON.parse(text) as unknown) : null;
    if (!res.ok) {
      const code = (data as { Code?: string } | null)?.Code ?? '';
      if (/SessionNotValid|SessionIdNotFound/.test(code)) throw new ShareError('Session expired.', 'session');
      if (/AccountPasswordInvalid|SSO_Authenticate|AccountNotFound|InvalidArgument/.test(code)) {
        throw new ShareError('Dexcom did not accept the username or password.', 'auth');
      }
      throw new ShareError(`Dexcom returned an error (${res.status}${code ? `, ${code}` : ''}).`, 'unknown');
    }
    return data;
  }

  /** Two-step login: account id, then session id. */
  async login(): Promise<void> {
    const accountId = (await this.post('General/AuthenticatePublisherAccount', {
      accountName: this.username,
      password: this.password,
      applicationId: this.cfg.applicationId,
    })) as string;
    if (!accountId || accountId === DEFAULT_ACCOUNT_ID) throw new ShareError('Dexcom did not accept the username or password.', 'auth');
    const sessionId = (await this.post('General/LoginPublisherAccountById', {
      accountId,
      password: this.password,
      applicationId: this.cfg.applicationId,
    })) as string;
    if (!sessionId || sessionId === DEFAULT_ACCOUNT_ID) throw new ShareError('Dexcom did not start a session.', 'auth');
    this.sessionId = sessionId;
  }

  /** Readings from the last `minutes` (max 1440), newest first from Dexcom; returned oldest first. */
  async readLatest(userId: string, minutes = 1440, maxCount = 288): Promise<GlucoseReading[]> {
    if (!this.sessionId) await this.login();
    const read = () =>
      this.post(
        `Publisher/ReadPublisherLatestGlucoseValues?sessionId=${encodeURIComponent(this.sessionId!)}&minutes=${minutes}&maxCount=${maxCount}`,
      ) as Promise<ShareEntry[]>;
    let entries: ShareEntry[];
    try {
      entries = await read();
    } catch (e) {
      if (!(e instanceof ShareError) || e.code !== 'session') throw e;
      await this.login();
      entries = await read();
    }
    return (entries ?? [])
      .map((e) => toReading(e, userId))
      .filter((r): r is GlucoseReading => !!r)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }
}

/**
 * Adds new readings, skipping any within ±2.5 min of an existing sensor
 * reading (e.g. the same Dexcom value arriving later via Apple Health).
 */
export function mergeSensorReadings(existing: GlucoseReading[], incoming: GlucoseReading[]): GlucoseReading[] {
  const sensorTimes = existing.filter((r) => r.source !== 'manual').map((r) => new Date(r.timestamp).getTime()).sort((a, b) => a - b);
  const near = (t: number) => {
    let lo = 0;
    let hi = sensorTimes.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sensorTimes[mid] < t - 150000) lo = mid + 1;
      else hi = mid;
    }
    return lo < sensorTimes.length && sensorTimes[lo] <= t + 150000;
  };
  const fresh = incoming.filter((r) => !near(new Date(r.timestamp).getTime()));
  if (!fresh.length) return existing;
  return [...existing, ...fresh].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
