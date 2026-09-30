import { router } from 'expo-router';
import { Check, ChevronLeft, ChevronRight, Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/cards/Card';
import { Ring } from '@/components/charts/Ring';
import { Text } from '@/components/typography/Text';
import { MacroRow, ProgressBar } from '@/components/ui/ProgressBar';
import { PressableScale } from '@/components/ui/PressableScale';
import { Screen, Section } from '@/components/ui/Screen';
import { IconButton } from '@/components/ui/SheetHeader';
import { colors, radius, spacing } from '@/constants/theme';
import { mealTotals } from '@/domain/nutrition/totals';
import { startOfDay, useDayNutrition, useNow } from '@/hooks/useDerived';
import { useAppStore } from '@/store/useAppStore';
import type { SavedMeal } from '@/types/models';
import { formatDay, formatNumber, MEAL_LABEL, MEAL_TYPES } from '@/utils/format';
import { haptics } from '@/utils/haptics';

const DAY = 86400000;

export default function FoodScreen() {
  const now = useNow();
  const insets = useSafeAreaInsets();
  const [offset, setOffset] = useState(0);
  const day = useMemo(() => new Date(startOfDay(now).getTime() - offset * DAY + 12 * 3600000), [now, offset]);
  const { meals, totals, goals } = useDayNutrition(day);
  const savedMeals = useAppStore((s) => s.savedMeals);
  const logMealItems = useAppStore((s) => s.logMealItems);
  const [added, setAdded] = useState<string | null>(null);

  const remaining = goals.calories - totals.calories;

  const addSaved = (m: SavedMeal) => {
    logMealItems(m.mealType, m.items, { name: m.name });
    haptics.success();
    setAdded(m.id);
    setTimeout(() => setAdded((cur) => (cur === m.id ? null : cur)), 1800);
  };

  return (
    <View style={styles.root}>
      <Screen tabBar title="Nutrition">
        <View style={styles.dayRow}>
          <IconButton label="Previous day" size={32} icon={<ChevronLeft size={16} color={colors.text} />} onPress={() => setOffset((o) => o + 1)} />
          <Text variant="bodyStrong">{formatDay(day, now)}</Text>
          <IconButton
            label="Next day"
            size={32}
            icon={<ChevronRight size={16} color={offset === 0 ? colors.textMuted : colors.text} />}
            onPress={() => setOffset((o) => Math.max(0, o - 1))}
          />
        </View>

        <Animated.View entering={FadeInDown.duration(400)}>
          <Card padding={spacing.xxl}>
            <View style={styles.energy}>
              <Ring size={148} stroke={11} progress={totals.calories / goals.calories} color={remaining < 0 ? colors.orange : colors.text}>
                <Text variant="metricM">{formatNumber(totals.calories)}</Text>
                <Text variant="caption" color="secondary">
                  of {formatNumber(goals.calories)} kcal
                </Text>
              </Ring>
              <View style={styles.energySide}>
                <Stat label={remaining >= 0 ? 'Remaining' : 'Over'} value={formatNumber(Math.abs(remaining))} unit="kcal" />
                <Stat label="Fiber" value={String(Math.round(totals.fiber ?? 0))} unit={`/ ${goals.fiber} g`} />
                <Stat label="Sugar" value={String(Math.round(totals.sugar ?? 0))} unit="g" />
              </View>
            </View>
            <View style={styles.macros}>
              <MacroRow label="Protein" current={totals.protein} target={goals.protein} />
              <MacroRow label="Carbs" current={totals.carbs} target={goals.carbs} />
              <MacroRow label="Fat" current={totals.fat} target={goals.fat} />
            </View>
          </Card>
        </Animated.View>

        <Section title="Meals">
          <Card padding={0}>
            {MEAL_TYPES.map((type, i) => {
              const ofType = meals.filter((m) => m.mealType === type);
              const n = mealTotals(ofType.flatMap((m) => m.items));
              const names = ofType.map((m) => m.name ?? m.items.map((it) => it.name).join(', ')).join(' · ');
              return (
                <PressableScale
                  key={type}
                  scaleTo={0.985}
                  haptic="selection"
                  onPress={() => router.push({ pathname: '/food/add', params: { meal: type } })}
                  style={[styles.mealRow, i < MEAL_TYPES.length - 1 && styles.divider]}>
                  <View style={styles.mealText}>
                    <Text variant="bodyStrong">{type === 'snack' ? 'Snacks' : MEAL_LABEL[type]}</Text>
                    <Text variant="label" color="muted" numberOfLines={1}>
                      {ofType.length ? `${names} · ${Math.round(n.carbs)} g carbs` : 'Add food'}
                    </Text>
                  </View>
                  <Text variant="bodyStrong" color={ofType.length ? 'primary' : 'muted'} tabular>
                    {ofType.length ? `${formatNumber(n.calories)} kcal` : '—'}
                  </Text>
                  <View style={styles.addDot}>
                    <Plus size={14} color={colors.text} strokeWidth={2} />
                  </View>
                </PressableScale>
              );
            })}
          </Card>
        </Section>

        <Section title="Saved meals">
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.savedList} style={styles.savedScroll}>
            {savedMeals.map((m) => {
              const n = mealTotals(m.items);
              const isAdded = added === m.id;
              return (
                <Card key={m.id} style={styles.savedCard} padding={spacing.lg + 2} onPress={() => addSaved(m)} accessibilityLabel={`Add ${m.name}`}>
                  <View style={styles.savedHead}>
                    <Text variant="overline" color="secondary">
                      {MEAL_LABEL[m.mealType]}
                    </Text>
                    <View style={[styles.savedAdd, isAdded && styles.savedAdded]}>
                      {isAdded ? <Check size={13} color="#000" strokeWidth={2.5} /> : <Plus size={13} color={colors.text} strokeWidth={2} />}
                    </View>
                  </View>
                  <Text variant="bodyStrong" style={styles.savedName} numberOfLines={1}>
                    {m.name}
                  </Text>
                  <Text variant="label" color="muted" numberOfLines={2}>
                    {m.items.map((i) => i.name).join(', ')}
                  </Text>
                  <View style={styles.savedStats}>
                    <Text variant="callout" tabular>
                      {n.calories} kcal
                    </Text>
                    <Text variant="callout" color="secondary" tabular>
                      {Math.round(n.carbs)} g carbs
                    </Text>
                  </View>
                  <ProgressBar progress={n.carbs / 100} height={3} color={colors.textSecondary} />
                </Card>
              );
            })}
          </ScrollView>
        </Section>
      </Screen>

      <PressableScale
        haptic="medium"
        accessibilityRole="button"
        accessibilityLabel="Add food"
        onPress={() => router.push('/food/add')}
        style={[styles.fab, { bottom: insets.bottom + 100 }]}>
        <Plus size={24} color="#000" strokeWidth={2.25} />
      </PressableScale>
    </View>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View>
      <Text variant="label" color="secondary">
        {label}
      </Text>
      <Text variant="headline" tabular>
        {value}
        <Text variant="label" color="muted">
          {' '}
          {unit}
        </Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  dayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: -spacing.sm, marginBottom: spacing.lg },
  energy: { flexDirection: 'row', alignItems: 'center', gap: spacing.xxl },
  energySide: { flex: 1, gap: spacing.md },
  macros: { gap: spacing.lg, marginTop: spacing.xxl },
  mealRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.lg + 2 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSubtle },
  mealText: { flex: 1, gap: 2 },
  addDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedScroll: { marginHorizontal: -spacing.xl },
  savedList: { gap: spacing.md, paddingHorizontal: spacing.xl },
  savedCard: { width: 210, gap: spacing.xs },
  savedHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  savedName: { marginBottom: 2 },
  savedAdd: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.elevatedHigh, alignItems: 'center', justifyContent: 'center' },
  savedAdded: { backgroundColor: colors.green },
  savedStats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md, marginBottom: spacing.sm },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.text,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
});
