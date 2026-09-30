import type { TextColor } from '@/components/typography/Text';
import type { ManualMatch } from '@/domain/glucose/matching';
import type { GlucoseSource, GlucoseUnit } from '@/types/models';
import { formatGlucose } from '@/utils/format';

const SOURCE_NAME: Record<GlucoseSource, string> = {
  dexcom: 'Dexcom',
  libre: 'Libre',
  'other-cgm': 'Sensor',
  meter: 'Sensor',
};

/** One line describing how a typed value compares with the sensor. */
export function describeMatch(
  match: ManualMatch | undefined,
  unit: GlucoseUnit,
  source: GlucoseSource | undefined,
): { text: string; color: TextColor } | undefined {
  if (!match) return undefined;
  const name = SOURCE_NAME[source ?? 'other-cgm'];
  if (match.status === 'waiting') return { text: `Waiting for ${name} data`, color: 'muted' };
  if (match.status === 'no-sensor-data') return { text: `No ${name} reading around this time`, color: 'muted' };
  const sensor = `${name} ${formatGlucose(match.sensorValue, unit)}`;
  if (match.difference === 0) return { text: `${sensor} · same value`, color: 'green' };
  const diff = `${match.difference > 0 ? '+' : '−'}${formatGlucose(Math.abs(match.difference), unit)}`;
  return match.agrees
    ? { text: `${sensor} (${diff}) · matches`, color: 'green' }
    : { text: `${sensor} (${diff}) · differs — check the value`, color: 'orange' };
}
