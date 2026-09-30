import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Card } from '@/components/cards/Card';
import { InsightCard } from '@/components/cards/InsightCard';
import { MetricCard } from '@/components/cards/MetricCard';
import { TimelineRow } from '@/components/cards/TimelineRow';
import { Text } from '@/components/typography/Text';
import { MacroRow } from '@/components/ui/ProgressBar';
import { PressableScale } from '@/components/ui/PressableScale';
import { Screen, Section } from '@/components/ui/Screen';
import { colors, radius, spacing } from '@/constants/theme';
import { GlucoseHero } from '@/features/glucose/GlucoseHero';
import { useActiveInsulin, useDayNutrition, useGlucoseStats, useInsights, useNow, useTimeline } from '@/hooks/useDerived';
import { useAppStore } from '@/store/useAppStore';
import { formatNumber, greeting } from '@/utils/format';

const enter = (i: number) => FadeInDown.duration(450).delay(60 * i).springify().damping(18);

export default function HomeScreen() {
  const now = useNow();
  const user = useAppStore((s) => s.user);
  const iob = useActiveInsulin(now);
  const { stats, previousStats } = useGlucoseStats(1, now);
  const nutrition = useDayNutrition(now);
  const insights = useInsights(14, now);
  const timeline = useTimeline(now);

  const featured = useMemo(
    () => insights.find((i) => i.type === 'trend') ?? insights.find((i) => i.tone === 'positive') ?? insights[0],
    [insights],
  );
  const recent = useMemo(() => timeline.filter((e) => e.kind !== 'glucose').slice(0, 4), [timeline]);
  const tirDelta = stats.timeInRange - previousStats.timeInRange;

  return (
    <Screen tabBar>
      <View style={styles.header}>
        <View>
          <Text variant="label" color="secondary">
            {now.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
          </Text>
          <Text variant="headline" style={styles.greeting}>
            {greeting(now)}, {user.name}
          </Text>
        </View>
        <PressableScale onPress={() => router.navigate('/profile')} accessibilityRole="button" accessibilityLabel="Profile" style={styles.avatar}>
          <Text variant="bodyStrong">{user.name.charAt(0)}</Text>
        </PressableScale>
      </View>

      <Animated.View entering={enter(0)}>
        <GlucoseHero now={now} />
      </Animated.View>

      <Animated.View entering={enter(1)} style={styles.stats}>
        <MetricCard label="Active insulin" value={iob.toFixed(1)} unit="U" footnote="On board now" onPress={() => router.navigate('/bolus')} />
        <MetricCard
          label="Time in range"
          value={String(stats.timeInRange)}
          unit="%"
          footnote={
            previousStats.count
              ? `${tirDelta >= 0 ? '+' : ''}${tirDelta} vs yesterday`
              : 'Last 24 hours'
          }
          footnoteColor={tirDelta >= 0 ? 'green' : 'muted'}
          onPress={() => router.navigate('/insights')}
        />
      </Animated.View>

      <Animated.View entering={enter(2)}>
        <Section title="Today" action={<SeeAll label="Food" onPress={() => router.navigate('/food')} />}>
          <Card onPress={() => router.navigate('/food')}>
            <View style={styles.kcalRow}>
              <Text variant="metricM">{formatNumber(nutrition.totals.calories)}</Text>
              <Text variant="callout" color="secondary">
                {' '}
                / {formatNumber(nutrition.goals.calories)} kcal
              </Text>
            </View>
            <View style={styles.macros}>
              <MacroRow label="Protein" current={nutrition.totals.protein} target={nutrition.goals.protein} />
              <MacroRow label="Carbs" current={nutrition.totals.carbs} target={nutrition.goals.carbs} />
              <MacroRow label="Fat" current={nutrition.totals.fat} target={nutrition.goals.fat} />
            </View>
          </Card>
        </Section>
      </Animated.View>

      <Animated.View entering={enter(3)} style={styles.actions}>
        <QuickAction label="Glucose" onPress={() => router.push('/log/glucose')} />
        <QuickAction label="Meal" onPress={() => router.push('/food/add')} />
        <QuickAction label="Insulin" onPress={() => router.push('/log/insulin')} />
        <QuickAction label="Weight" onPress={() => router.push('/log/weight')} />
      </Animated.View>

      {featured ? (
        <Animated.View entering={enter(4)}>
          <Section title="Insight" action={<SeeAll label="All" onPress={() => router.navigate('/insights')} />}>
            <InsightCard insight={featured} onPress={() => router.navigate('/insights')} />
          </Section>
        </Animated.View>
      ) : null}

      <Animated.View entering={enter(5)}>
        <Section title="Recent" action={<SeeAll label="Timeline" onPress={() => router.push('/timeline')} />}>
          {recent.length ? (
            <View>
              {recent.map((e, i) => (
                <TimelineRow key={e.id} event={e} unit={user.glucoseUnit} last={i === recent.length - 1} />
              ))}
            </View>
          ) : (
            <Text variant="callout" color="secondary">
              Nothing logged yet today.
            </Text>
          )}
        </Section>
      </Animated.View>
    </Screen>
  );
}

function QuickAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} style={styles.action} accessibilityRole="button" accessibilityLabel={`Add ${label}`}>
      <Text variant="headline" style={styles.plus}>
        +
      </Text>
      <Text variant="label" color="secondary">
        {label}
      </Text>
    </PressableScale>
  );
}

function SeeAll({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <PressableScale onPress={onPress} haptic="selection" style={styles.seeAll} accessibilityRole="link">
      <Text variant="label" color="secondary">
        {label}
      </Text>
      <ChevronRight size={14} color={colors.textSecondary} />
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xxl },
  greeting: { marginTop: 2 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.elevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stats: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.xxl },
  kcalRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: spacing.xl },
  macros: { gap: spacing.lg },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xxl },
  action: {
    flex: 1,
    height: 76,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  plus: { fontWeight: '300', fontSize: 22 },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 4, paddingLeft: 8 },
});
