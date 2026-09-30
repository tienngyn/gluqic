import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Card } from '@/components/cards/Card';
import { InsightCard } from '@/components/cards/InsightCard';
import { MetricCard } from '@/components/cards/MetricCard';
import { BarChart } from '@/components/charts/BarChart';
import { LineChart } from '@/components/charts/LineChart';
import type { Point } from '@/components/charts/path';
import { Text } from '@/components/typography/Text';
import { Screen, Section } from '@/components/ui/Screen';
import { ChipGroup, SegmentedControl } from '@/components/ui/SegmentedControl';
import { colors, radius, spacing } from '@/constants/theme';
import { hourlyProfile } from '@/domain/glucose/stats';
import { correctionNote, findSimilarMeals, signatureOf, summarizeOutcomes } from '@/domain/insights/similarMeals';
import { SuggestionCard } from '@/features/insights/SuggestionCard';
import { useActiveSetpoint, useBolusEvents, useGlucoseStats, useInsights, useNow, useSuggestions } from '@/hooks/useDerived';
import { useAppStore } from '@/store/useAppStore';
import type { GlucoseReading, GlucoseUnit } from '@/types/models';
import { formatGlucose, formatShortDate, MEAL_LABEL, toDisplayGlucose } from '@/utils/format';

type Period = '7' | '30' | '90' | 'custom';
const HOUR = 3600000;

/** Average readings into fixed buckets, optionally shifting x (for comparison series). */
function bucketize(readings: GlucoseReading[], bucketMs: number, shiftMs = 0): Point[] {
  const map = new Map<number, { s: number; n: number }>();
  for (const r of readings) {
    const t = new Date(r.timestamp).getTime() + shiftMs;
    const k = Math.floor(t / bucketMs) * bucketMs;
    const cur = map.get(k) ?? { s: 0, n: 0 };
    cur.s += r.value;
    cur.n += 1;
    map.set(k, cur);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => ({ x: k + bucketMs / 2, y: v.s / v.n }));
}

const inUnit = (pts: Point[], unit: GlucoseUnit) => pts.map((p) => ({ x: p.x, y: toDisplayGlucose(p.y, unit) }));

export default function InsightsScreen() {
  const now = useNow();
  const unit = useAppStore((s) => s.user.glucoseUnit);
  const range = useAppStore((s) => s.range);
  const [period, setPeriod] = useState<Period>('7');
  const [customDays, setCustomDays] = useState('14');
  const days = period === 'custom' ? Number(customDays) : Number(period);

  const { readings, previousReadings, stats, previousStats } = useGlucoseStats(days, now);
  const insights = useInsights(Math.max(days, 14), now);
  const suggestions = useSuggestions(now);
  const events = useBolusEvents();
  const breakfastSetpoint = useActiveSetpoint('breakfast');

  // Wide buckets smooth meal spikes so the line reads as stability, not noise.
  const bucket = days <= 7 ? 8 * HOUR : days <= 30 ? 24 * HOUR : 72 * HOUR;
  const series = useMemo(() => inUnit(bucketize(readings, bucket), unit), [readings, bucket, unit]);
  const compare = useMemo(
    () => inUnit(bucketize(previousReadings, bucket, days * 24 * HOUR), unit),
    [previousReadings, bucket, days, unit],
  );
  const xDomain = useMemo<[number, number]>(() => [now.getTime() - days * 24 * HOUR, now.getTime()], [now, days]);
  const xLabels = useMemo(
    () => [1, 0.5, 0].map((f) => ({ x: now.getTime() - days * 24 * HOUR * f, label: formatShortDate(new Date(now.getTime() - days * 24 * HOUR * f)) })),
    [now, days],
  );

  const profile = useMemo(() => hourlyProfile(readings), [readings]);
  const bars = profile.map((v, h) => ({
    label: h % 6 === 0 ? String(h).padStart(2, '0') : '',
    value: v == null ? null : toDisplayGlucose(v, unit),
  }));

  // Similar-meal analysis for the most recent breakfast.
  const similarBreakfast = useMemo(() => {
    const lastBreakfast = [...events].reverse().find((e) => e.mealType === 'breakfast');
    if (!lastBreakfast) return null;
    // With a setpoint, only meals since it reflect the ratio in use now.
    const pool = breakfastSetpoint ? events.filter((e) => e.timestamp >= breakfastSetpoint.createdAt) : events;
    const matches = findSimilarMeals(signatureOf(lastBreakfast), pool, { threshold: 0.72, limit: 12, excludeId: lastBreakfast.id });
    const summary = summarizeOutcomes(
      matches.map((m) => m.event),
      range,
    );
    return summary.withOutcome >= 4 ? { summary, meal: lastBreakfast } : null;
  }, [events, range, breakfastSetpoint]);

  const tirDelta = stats.timeInRange - previousStats.timeInRange;
  const trendLabel = stats.cv <= 36 ? 'Stable' : 'Variable';

  return (
    <Screen tabBar title="Insights">
      <SegmentedControl<Period>
        value={period}
        onChange={setPeriod}
        segments={[
          { value: '7', label: '7 Days' },
          { value: '30', label: '30 Days' },
          { value: '90', label: '90 Days' },
          { value: 'custom', label: 'Custom' },
        ]}
      />
      {period === 'custom' ? (
        <View style={styles.custom}>
          <ChipGroup<string>
            value={customDays}
            onChange={setCustomDays}
            options={['3', '14', '21', '60'].map((d) => ({ value: d, label: `${d} days` }))}
          />
        </View>
      ) : null}

      {stats.count === 0 ? (
        <Card style={styles.chartCard} padding={spacing.xl}>
          <Text variant="headline">No glucose data for this period</Text>
          <Text variant="callout" color="secondary" style={styles.emptyBody}>
            Connect Apple Health or log readings. Charts appear with the first readings, patterns after about a week.
          </Text>
        </Card>
      ) : null}

      <Animated.View key={days} entering={FadeIn.duration(350)} style={stats.count === 0 && styles.hidden}>
        <Card style={styles.chartCard} padding={spacing.xl}>
          <View style={styles.chartHead}>
            <View>
              <Text variant="label" color="secondary">
                Glucose stability
              </Text>
              <Text variant="metricM" style={styles.chartValue}>
                {trendLabel}
              </Text>
            </View>
            <View style={styles.legend}>
              <LegendDot color={colors.text} label="This period" />
              <LegendDot color={colors.chartSecondary} label="Previous" dashed />
            </View>
          </View>
          <Text variant="label" color="muted" style={styles.chartSub}>
            Variability {stats.cv}% · target ≤ 36%
          </Text>
          <LineChart
            data={series}
            secondary={compare}
            height={190}
            band={{ low: toDisplayGlucose(range.low, unit), high: toDisplayGlucose(range.high, unit) }}
            xDomain={xDomain}
            xLabels={xLabels}
            fill
            showEndPoint={false}
            formatX={(x) => formatShortDate(new Date(x))}
            formatY={(y) => (unit === 'mmol/L' ? y.toFixed(1) : String(Math.round(y)))}
          />
        </Card>

        <View style={styles.grid}>
          <MetricCard
            size="l"
            label="Time in range"
            value={String(stats.timeInRange)}
            unit="%"
            footnote={previousStats.count ? `${tirDelta >= 0 ? '+' : ''}${tirDelta} vs previous` : undefined}
            footnoteColor={tirDelta >= 0 ? 'green' : 'orange'}
          />
          <MetricCard size="l" label="Average glucose" value={formatGlucose(stats.average, unit)} unit={unit} footnote={`GMI ${stats.gmi}%`} />
        </View>
        <View style={styles.grid}>
          <MetricCard label="High events" value={String(stats.highEvents)} footnote={`${stats.timeAbove}% of time above`} valueColor={stats.highEvents ? 'orange' : 'primary'} />
          <MetricCard label="Low events" value={String(stats.lowEvents)} footnote={`${stats.timeBelow}% of time below`} valueColor={stats.lowEvents ? 'red' : 'primary'} />
        </View>

        <Card style={styles.rangeCard} padding={spacing.xl}>
          <Text variant="label" color="secondary">
            Time in ranges
          </Text>
          <View style={styles.rangeBar}>
            <View style={{ flex: Math.max(stats.timeBelow, 0.001), backgroundColor: colors.red }} />
            <View style={{ flex: Math.max(stats.timeInRange, 0.001), backgroundColor: colors.text }} />
            <View style={{ flex: Math.max(stats.timeAbove, 0.001), backgroundColor: colors.orange }} />
          </View>
          <View style={styles.rangeLegend}>
            <RangeLabel label={`Below ${formatGlucose(range.low, unit)}`} value={stats.timeBelow} />
            <RangeLabel label="In range" value={stats.timeInRange} />
            <RangeLabel label={`Above ${formatGlucose(range.high, unit)}`} value={stats.timeAbove} />
          </View>
        </Card>

        <Section title="Average day">
          <Card padding={spacing.xl}>
            <BarChart
              bars={bars}
              height={110}
              band={{ low: toDisplayGlucose(range.low, unit), high: toDisplayGlucose(range.high, unit) }}
              maxValue={toDisplayGlucose(260, unit)}
            />
          </Card>
        </Section>

        {similarBreakfast ? (
          <Section title="Similar meals">
            <Card padding={spacing.xl}>
              <Text variant="overline" color="secondary">
                {MEAL_LABEL[similarBreakfast.meal.mealType]} pattern
              </Text>
              <Text variant="headline" style={styles.simTitle}>
                {similarBreakfast.summary.count} similar meals found
              </Text>
              <Text variant="label" color="muted">
                Like {similarBreakfast.meal.mealName ?? 'your last breakfast'} · ~{Math.round(similarBreakfast.meal.carbs)} g carbs
                {breakfastSetpoint ? ' · since your setpoint' : ''}
              </Text>
              <View style={styles.simStats}>
                <View style={styles.simStat}>
                  <Text variant="label" color="secondary">
                    Avg. before
                  </Text>
                  <Text variant="metricM">{formatGlucose(similarBreakfast.summary.avgBefore ?? 0, unit)}</Text>
                </View>
                <View style={styles.simStat}>
                  <Text variant="label" color="secondary">
                    Avg. 2 h after
                  </Text>
                  <Text variant="metricM" color={(similarBreakfast.summary.avg2h ?? 0) > range.high ? 'orange' : 'primary'}>
                    {formatGlucose(similarBreakfast.summary.avg2h ?? 0, unit)}
                  </Text>
                </View>
              </View>
              <Text variant="callout" style={styles.simBody}>
                Glucose ran high after {similarBreakfast.summary.aboveAt2h} of {similarBreakfast.summary.withOutcome} similar
                breakfasts{correctionNote(similarBreakfast.summary)}.
              </Text>
              {similarBreakfast.summary.aboveAt2h / similarBreakfast.summary.withOutcome >= 0.5 ? (
                <Text variant="label" color="secondary" style={styles.simHint}>
                  Your breakfast settings may be worth reviewing with your care team. gluciq never changes them automatically.
                </Text>
              ) : null}
            </Card>
          </Section>
        ) : null}

        {suggestions.length ? (
          <Section title="Suggestions">
            <View style={styles.patterns}>
              {suggestions.map((s) => (
                <SuggestionCard key={s.key} suggestion={s} />
              ))}
            </View>
          </Section>
        ) : null}

        <Section title="Patterns">
          <View style={styles.patterns}>
            {insights.length ? (
              insights.map((i) => <InsightCard key={i.id} insight={i} compact />)
            ) : (
              <Text variant="callout" color="secondary">
                Not enough data yet. Patterns appear after about a week of logging.
              </Text>
            )}
          </View>
        </Section>
      </Animated.View>
    </Screen>
  );
}

function LegendDot({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendLine, { backgroundColor: dashed ? 'transparent' : color, borderColor: color, borderStyle: dashed ? 'dashed' : 'solid' }]} />
      <Text variant="caption" color="muted">
        {label}
      </Text>
    </View>
  );
}

function RangeLabel({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.rangeLabel}>
      <Text variant="bodyStrong" tabular>
        {value}%
      </Text>
      <Text variant="caption" color="muted">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  custom: { marginTop: spacing.md },
  emptyBody: { marginTop: spacing.sm },
  hidden: { display: 'none' },
  chartCard: { marginTop: spacing.xl },
  chartHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  chartValue: { marginTop: 2 },
  chartSub: { marginTop: spacing.xs, marginBottom: spacing.lg },
  legend: { gap: spacing.xs, alignItems: 'flex-end' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2 },
  legendLine: { width: 14, height: 0, borderTopWidth: 2 },
  grid: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
  rangeCard: { marginTop: spacing.md },
  rangeBar: { flexDirection: 'row', height: 10, borderRadius: radius.pill, overflow: 'hidden', gap: 2, marginVertical: spacing.lg },
  rangeLegend: { flexDirection: 'row', justifyContent: 'space-between' },
  rangeLabel: { gap: 2 },
  simTitle: { marginTop: spacing.sm },
  simStats: { flexDirection: 'row', marginTop: spacing.xl, marginBottom: spacing.lg },
  simStat: { flex: 1, gap: 2 },
  simBody: { marginTop: spacing.xs },
  simHint: { marginTop: spacing.md },
  patterns: { gap: spacing.md },
});
