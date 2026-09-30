import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/cards/Card';
import { LineChart } from '@/components/charts/LineChart';
import { Text } from '@/components/typography/Text';
import { spacing } from '@/constants/theme';
import { useAppStore } from '@/store/useAppStore';
import { relativeTime } from '@/utils/format';

const DAY = 86400000;

/** Compact weight summary for Home; opens the full weight tracker. */
export function WeightCard({ now }: { now: Date }) {
  const weights = useAppStore((s) => s.weights);
  const goal = useAppStore((s) => s.weightGoal);

  const recent = useMemo(() => {
    const from = now.getTime() - 30 * DAY;
    return weights.filter((w) => new Date(w.timestamp).getTime() >= from);
  }, [weights, now]);
  const data = useMemo(() => recent.map((w) => ({ x: new Date(w.timestamp).getTime(), y: w.weightKg })), [recent]);

  const latest = weights[weights.length - 1];
  if (!latest) {
    return (
      <Card onPress={() => router.push('/log/weight')} accessibilityLabel="Log your weight">
        <Text variant="label" color="secondary">
          Weight
        </Text>
        <Text variant="callout" color="secondary" style={styles.empty}>
          No entries yet. Tap to log your weight.
        </Text>
      </Card>
    );
  }

  const change = recent.length > 1 ? latest.weightKg - recent[0].weightKg : 0;
  const toGo = latest.weightKg - goal.targetKg;

  return (
    <Card onPress={() => router.push('/weight')} accessibilityLabel="Weight history">
      <View style={styles.row}>
        <View style={styles.text}>
          <Text variant="label" color="secondary">
            Weight
          </Text>
          <View style={styles.valueRow}>
            <Text variant="metricM">{latest.weightKg.toFixed(1)}</Text>
            <Text variant="label" color="secondary">
              {' '}
              kg
            </Text>
          </View>
          <Text variant="caption" color={change <= 0 ? 'green' : 'secondary'}>
            {change <= 0 ? '↓' : '↑'} {Math.abs(change).toFixed(1)} kg in 30 days
          </Text>
          <Text variant="caption" color="muted">
            {toGo > 0 ? `${toGo.toFixed(1)} kg to goal` : 'Goal reached'} · {relativeTime(latest.timestamp, now)}
          </Text>
        </View>
        <View style={styles.chart} pointerEvents="none">
          {data.length > 1 ? <LineChart data={data} height={64} interactive={false} fill={false} /> : null}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  text: { gap: 2 },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: spacing.xs },
  chart: { flex: 1 },
  empty: { marginTop: spacing.xs },
});
