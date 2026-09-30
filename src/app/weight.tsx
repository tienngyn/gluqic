import { router } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/cards/Card';
import { MetricCard } from '@/components/cards/MetricCard';
import { LineChart } from '@/components/charts/LineChart';
import { Text } from '@/components/typography/Text';
import { BackHeader } from '@/components/ui/BackHeader';
import { ListRow } from '@/components/ui/ListRow';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Screen, Section } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { IconButton } from '@/components/ui/SheetHeader';
import { colors, spacing } from '@/constants/theme';
import { useNow } from '@/hooks/useDerived';
import { useAppStore } from '@/store/useAppStore';
import { formatDay, formatShortDate } from '@/utils/format';

type Span = '7' | '30' | '90' | '365' | 'all';

export default function WeightScreen() {
  const now = useNow();
  const weights = useAppStore((s) => s.weights);
  const goal = useAppStore((s) => s.weightGoal);
  const [span, setSpan] = useState<Span>('90');

  const inSpan = useMemo(() => {
    if (span === 'all') return weights;
    const from = now.getTime() - Number(span) * 86400000;
    return weights.filter((w) => new Date(w.timestamp).getTime() >= from);
  }, [weights, span, now]);
  const data = useMemo(() => inSpan.map((w) => ({ x: new Date(w.timestamp).getTime(), y: w.weightKg })), [inSpan]);
  const xLabels = useMemo(
    () => (data.length > 1 ? [data[0], data[Math.floor(data.length / 2)], data[data.length - 1]].map((p) => ({ x: p.x, label: formatShortDate(new Date(p.x)) })) : []),
    [data],
  );

  const latest = weights[weights.length - 1];
  const first = inSpan[0];
  if (!latest) {
    return (
      <Screen>
        <BackHeader />
        <Text variant="title">Weight</Text>
        <Text color="secondary">No entries yet.</Text>
      </Screen>
    );
  }
  const change = first ? latest.weightKg - first.weightKg : 0;
  const bmi = goal.heightCm ? latest.weightKg / (goal.heightCm / 100) ** 2 : undefined;
  const lean = latest.bodyFatPct != null ? latest.weightKg * (1 - latest.bodyFatPct / 100) : undefined;
  const start = weights[0].weightKg;
  const toGo = latest.weightKg - goal.targetKg;
  const progress = start === goal.targetKg ? 1 : (start - latest.weightKg) / (start - goal.targetKg);
  const yMin = Math.min(goal.targetKg, ...data.map((d) => d.y)) - 0.8;
  const yMax = Math.max(...data.map((d) => d.y)) + 0.8;

  return (
    <Screen>
      <BackHeader right={<IconButton label="Log weight" icon={<Plus size={18} color={colors.text} />} onPress={() => router.push('/log/weight')} />} />
      <Text variant="title">Weight</Text>

      <View style={styles.hero}>
        <Text variant="metricXL">{latest.weightKg.toFixed(1)}</Text>
        <Text variant="headline" color="secondary" style={styles.kg}>
          kg
        </Text>
      </View>
      <Text variant="callout" color={change <= 0 ? 'green' : 'secondary'}>
        {change <= 0 ? '↓' : '↑'} {Math.abs(change).toFixed(1)} kg {span === 'all' ? 'overall' : `in ${span === '365' ? '1 year' : `${span} days`}`}
      </Text>

      <Card style={styles.chart} padding={spacing.xl}>
        <LineChart
          data={data}
          height={180}
          yDomain={[yMin, yMax]}
          band={{ low: goal.targetKg - 0.05, high: goal.targetKg + 0.05 }}
          xLabels={xLabels}
          formatX={(x) => formatShortDate(new Date(x))}
          formatY={(y) => `${y.toFixed(1)} kg`}
        />
      </Card>
      <SegmentedControl<Span>
        size="s"
        value={span}
        onChange={setSpan}
        segments={[
          { value: '7', label: '7D' },
          { value: '30', label: '30D' },
          { value: '90', label: '3M' },
          { value: '365', label: '1Y' },
          { value: 'all', label: 'All' },
        ]}
      />

      <Card style={styles.goal} padding={spacing.xl}>
        <View style={styles.goalHead}>
          <Text variant="label" color="secondary">
            Goal {goal.targetKg} kg
          </Text>
          <Text variant="label" color="secondary">
            {toGo > 0 ? `${toGo.toFixed(1)} kg to go` : 'Reached'}
          </Text>
        </View>
        <ProgressBar progress={progress} height={6} />
      </Card>

      <View style={styles.grid}>
        <MetricCard label="BMI" value={bmi ? bmi.toFixed(1) : '—'} footnote={goal.heightCm ? `${goal.heightCm} cm` : 'Add height in goals'} />
        <MetricCard label="Body fat" value={latest.bodyFatPct != null ? latest.bodyFatPct.toFixed(1) : '—'} unit="%" footnote={lean ? `Lean ${lean.toFixed(1)} kg` : undefined} />
      </View>

      <Section title="Entries">
        <Card padding={0}>
          <View style={styles.inset}>
            {[...weights]
              .slice(-6)
              .reverse()
              .map((w, i) => (
                <ListRow key={w.id} label={`${w.weightKg.toFixed(1)} kg`} detail={w.source === 'healthkit' ? 'Apple Health' : 'Manual'} value={formatDay(w.timestamp, now)} last={i === 5} />
              ))}
          </View>
        </Card>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'flex-end', marginTop: spacing.lg },
  kg: { marginLeft: spacing.xs, marginBottom: spacing.sm },
  chart: { marginTop: spacing.xl, marginBottom: spacing.md },
  goal: { marginTop: spacing.xl, gap: spacing.md },
  goalHead: { flexDirection: 'row', justifyContent: 'space-between' },
  grid: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  inset: { paddingHorizontal: spacing.lg + 2 },
});
