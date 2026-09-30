import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { LineChart } from '@/components/charts/LineChart';
import type { Point } from '@/components/charts/path';
import { Text, type TextColor } from '@/components/typography/Text';
import { PressableScale } from '@/components/ui/PressableScale';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { colors, radius, spacing } from '@/constants/theme';
import { classify } from '@/domain/glucose/stats';
import { useCurrentGlucose, useGlucoseWindow, useManualMatches } from '@/hooks/useDerived';
import { useAppStore } from '@/store/useAppStore';
import { formatGlucose, formatTime, relativeTime, toDisplayGlucose, TREND_META } from '@/utils/format';

type Span = '3' | '6' | '12' | '24';

const STATE_COLOR: Record<'green' | 'orange' | 'red', string> = {
  green: colors.green,
  orange: colors.orange,
  red: colors.red,
};

/** The dominant number on Home: current glucose, trend and recent curve. */
export function GlucoseHero({ now }: { now: Date }) {
  const unit = useAppStore((s) => s.user.glucoseUnit);
  const range = useAppStore((s) => s.range);
  const [span, setSpan] = useState<Span>('6');
  const [scrub, setScrub] = useState<Point | null>(null);
  const source = useAppStore((s) => s.user.glucoseSource);
  const { latest, trend, fresh } = useCurrentGlucose(now);
  // Same rule as the Bolus calculator: older than 15 min is not "current".
  const stale = !fresh;
  const readings = useGlucoseWindow(Number(span), now);

  const allGlucose = useAppStore((s) => s.glucose);
  const matches = useManualMatches();
  // The line follows the sensor; typed values are drawn as separate points so
  // a value that differs from the sensor stays visible instead of bending the line.
  const data = useMemo(() => {
    const sensor = readings.filter((r) => r.source !== 'manual');
    const line = sensor.length ? sensor : readings;
    return line.map((r) => ({ x: new Date(r.timestamp).getTime(), y: toDisplayGlucose(r.value, unit) }));
  }, [readings, unit]);
  const markers = useMemo(() => {
    const from = now.getTime() - Number(span) * 3600000;
    return allGlucose
      .filter((r) => r.source === 'manual' && new Date(r.timestamp).getTime() >= from)
      .map((r) => {
        const m = matches.get(r.id);
        return {
          x: new Date(r.timestamp).getTime(),
          y: toDisplayGlucose(r.value, unit),
          color: m?.status === 'matched' && !m.agrees ? colors.orange : colors.text,
        };
      });
  }, [allGlucose, matches, now, span, unit]);
  const xDomain = useMemo<[number, number]>(() => [now.getTime() - Number(span) * 3600000, now.getTime()], [now, span]);
  const xLabels = useMemo(() => {
    const h = Number(span);
    return [0, 0.5, 1].map((f) => {
      const x = now.getTime() - h * 3600000 * (1 - f);
      return { x, label: f === 1 ? 'Now' : formatTime(new Date(x)) };
    });
  }, [now, span]);
  const band = useMemo(
    () => ({ low: toDisplayGlucose(range.low, unit), high: toDisplayGlucose(range.high, unit) }),
    [range, unit],
  );
  const yDomain = useMemo<[number, number]>(
    () => (unit === 'mmol/L' ? [2.5, 16] : [45, 290]),
    [unit],
  );

  if (!latest) {
    return (
      <Text variant="body" color="secondary">
        No glucose yet. Log a reading to get started.
      </Text>
    );
  }

  const shown = scrub ? scrub.y : toDisplayGlucose(latest.value, unit);
  const state = classify(scrub ? (unit === 'mmol/L' ? scrub.y * 18.0182 : scrub.y) : latest.value, range);
  const stateColor: TextColor = state === 'low' ? 'red' : state === 'high' ? 'orange' : 'green';
  const meta = TREND_META[trend];

  return (
    <View>
      <View style={styles.valueRow} accessibilityLabel={`Glucose ${formatGlucose(latest.value, unit)} ${unit}, ${meta.label}`}>
        <Animated.View entering={FadeIn.duration(500)}>
          <Text variant="display" color={stale && !scrub ? 'muted' : 'primary'}>
            {unit === 'mmol/L' ? shown.toFixed(1) : Math.round(shown)}
          </Text>
        </Animated.View>
        <View style={styles.meta}>
          <Text variant="callout" color="secondary">
            {unit}
          </Text>
          {scrub ? (
            <Text variant="bodyStrong">{formatTime(new Date(scrub.x))}</Text>
          ) : stale ? (
            <Text variant="bodyStrong" color="secondary">
              Last value
            </Text>
          ) : (
            <Text variant="bodyStrong">
              {meta.arrow} {meta.label}
            </Text>
          )}
        </View>
      </View>
      {stale && !scrub ? (
        <View style={styles.staleRow}>
          <Text variant="label" color="secondary" style={styles.staleText}>
            From {relativeTime(latest.timestamp, now)}
            {source === 'dexcom' ? ' · Dexcom data reaches Apple Health about 3 h late' : ' · no recent data'}
          </Text>
          <PressableScale
            onPress={() => router.push('/log/glucose')}
            accessibilityRole="button"
            style={styles.staleButton}>
            <Text variant="label" style={styles.staleButtonText}>
              + Enter current value
            </Text>
          </PressableScale>
        </View>
      ) : (
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: STATE_COLOR[stateColor] }]} />
          <Text variant="label" color="secondary">
            {state === 'in-range' ? 'In range' : state === 'high' ? 'Above range' : 'Below range'}
            {scrub ? '' : ` · ${relativeTime(latest.timestamp, now)}`}
            {!scrub && latest.source === 'manual' ? ' · typed in' : ''}
          </Text>
        </View>
      )}

      <View style={styles.chart}>
        <LineChart
          data={data}
          markers={markers}
          height={170}
          band={band}
          yDomain={yDomain}
          xDomain={xDomain}
          xLabels={xLabels}
          formatX={(x) => formatTime(new Date(x))}
          formatY={(y) => (unit === 'mmol/L' ? y.toFixed(1) : String(Math.round(y)))}
          onSelect={setScrub}
        />
      </View>
      <SegmentedControl<Span>
        size="s"
        value={span}
        onChange={setSpan}
        segments={[
          { value: '3', label: '3H' },
          { value: '6', label: '6H' },
          { value: '12', label: '12H' },
          { value: '24', label: '24H' },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  valueRow: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.md },
  meta: { paddingBottom: spacing.md, gap: 2 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  dot: { width: 7, height: 7, borderRadius: 4 },
  staleRow: { marginTop: spacing.xs, gap: spacing.md, alignItems: 'flex-start' },
  staleText: { lineHeight: 18 },
  staleButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.text,
  },
  staleButtonText: { color: colors.background, fontWeight: '600' },
  chart: { marginTop: spacing.xxl, marginBottom: spacing.lg },
});
