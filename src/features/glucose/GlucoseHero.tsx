import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { LineChart } from '@/components/charts/LineChart';
import type { Point } from '@/components/charts/path';
import { Text, type TextColor } from '@/components/typography/Text';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { spacing } from '@/constants/theme';
import { classify } from '@/domain/glucose/stats';
import { useCurrentGlucose, useGlucoseWindow } from '@/hooks/useDerived';
import { useAppStore } from '@/store/useAppStore';
import { formatGlucose, formatTime, relativeTime, toDisplayGlucose, TREND_META } from '@/utils/format';

type Span = '3' | '6' | '12' | '24';

/** The dominant number on Home: current glucose, trend and recent curve. */
export function GlucoseHero({ now }: { now: Date }) {
  const unit = useAppStore((s) => s.user.glucoseUnit);
  const range = useAppStore((s) => s.range);
  const [span, setSpan] = useState<Span>('6');
  const [scrub, setScrub] = useState<Point | null>(null);
  const { latest, trend, stale } = useCurrentGlucose(now);
  const readings = useGlucoseWindow(Number(span), now);

  const data = useMemo(
    () => readings.map((r) => ({ x: new Date(r.timestamp).getTime(), y: toDisplayGlucose(r.value, unit) })),
    [readings, unit],
  );
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
          <Text variant="display">{unit === 'mmol/L' ? shown.toFixed(1) : Math.round(shown)}</Text>
        </Animated.View>
        <View style={styles.meta}>
          <Text variant="callout" color="secondary">
            {unit}
          </Text>
          {scrub ? (
            <Text variant="bodyStrong">{formatTime(new Date(scrub.x))}</Text>
          ) : (
            <Text variant="bodyStrong">
              {meta.arrow} {meta.label}
            </Text>
          )}
        </View>
      </View>
      <View style={styles.statusRow}>
        <View style={[styles.dot, { backgroundColor: stateColor === 'green' ? '#34C759' : stateColor === 'orange' ? '#FF9F0A' : '#FF453A' }]} />
        <Text variant="label" color="secondary">
          {state === 'in-range' ? 'In range' : state === 'high' ? 'Above range' : 'Below range'}
          {scrub ? '' : ` · ${relativeTime(latest.timestamp, now)}`}
          {stale && !scrub ? ' · no recent data' : ''}
        </Text>
      </View>

      <View style={styles.chart}>
        <LineChart
          data={data}
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
  chart: { marginTop: spacing.xxl, marginBottom: spacing.lg },
});
