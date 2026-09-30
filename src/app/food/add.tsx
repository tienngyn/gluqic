import { router, useLocalSearchParams } from 'expo-router';
import { Camera, PencilLine, ScanBarcode, Search } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Card } from '@/components/cards/Card';
import { Text } from '@/components/typography/Text';
import { ListRow } from '@/components/ui/ListRow';
import { PressableScale } from '@/components/ui/PressableScale';
import { Screen, Section } from '@/components/ui/Screen';
import { ChipGroup } from '@/components/ui/SegmentedControl';
import { SheetHeader } from '@/components/ui/SheetHeader';
import { colors, radius, spacing } from '@/constants/theme';
import { suggestMealType } from '@/domain/bolus/carbRatio';
import { mealTotals } from '@/domain/nutrition/totals';
import { foodDatabase } from '@/services/foodDatabase';
import { useAppStore } from '@/store/useAppStore';
import type { FoodItem, MealType } from '@/types/models';
import { MEAL_LABEL, MEAL_TYPES } from '@/utils/format';
import { haptics } from '@/utils/haptics';

export default function AddFood() {
  const params = useLocalSearchParams<{ meal?: MealType }>();
  const ratios = useAppStore((s) => s.insulinProfile.carbRatios);
  const customFoods = useAppStore((s) => s.customFoods);
  const savedMeals = useAppStore((s) => s.savedMeals);
  const logMealItems = useAppStore((s) => s.logMealItems);
  const [meal, setMeal] = useState<MealType>(params.meal ?? suggestMealType(ratios, new Date()));
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FoodItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      void foodDatabase.search(query).then((r) => {
        if (!cancelled) setResults(r);
      });
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  const custom = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customFoods.filter((f) => !q || f.name.toLowerCase().includes(q));
  }, [customFoods, query]);

  const open = (food: FoodItem) => router.push({ pathname: '/food/[id]', params: { id: food.id, meal } });

  return (
    <Screen modal>
      <SheetHeader title="Add food" subtitle={`To ${MEAL_LABEL[meal].toLowerCase()}`} />
      <ChipGroup<MealType> value={meal} onChange={setMeal} options={MEAL_TYPES.map((m) => ({ value: m, label: MEAL_LABEL[m] }))} />

      <View style={styles.search}>
        <Search size={18} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search food"
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.text}
          style={styles.searchInput}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search food"
        />
      </View>

      <View style={styles.options}>
        <Option icon={<ScanBarcode size={20} color={colors.text} strokeWidth={1.6} />} label="Scan" onPress={() => router.push({ pathname: '/food/scan', params: { meal } })} />
        <Option icon={<Camera size={20} color={colors.textMuted} strokeWidth={1.6} />} label="Photo" hint="Soon" />
        <Option icon={<PencilLine size={20} color={colors.text} strokeWidth={1.6} />} label="Custom" onPress={() => router.push({ pathname: '/food/custom', params: { meal } })} />
      </View>

      {!query && savedMeals.length ? (
        <Section title="Saved meals" style={styles.section}>
          <Card padding={0} style={styles.listCard}>
            {savedMeals.map((m, i) => {
              const n = mealTotals(m.items);
              return (
                <View key={m.id} style={styles.inset}>
                  <ListRow
                    label={m.name}
                    detail={`${n.calories} kcal · ${Math.round(n.carbs)} g carbs`}
                    value="Add"
                    last={i === savedMeals.length - 1}
                    onPress={() => {
                      logMealItems(meal, m.items, { name: m.name });
                      haptics.success();
                      router.back();
                    }}
                  />
                </View>
              );
            })}
          </Card>
        </Section>
      ) : null}

      {custom.length ? (
        <Section title="Your foods" style={styles.section}>
          <FoodList foods={custom} onPick={open} />
        </Section>
      ) : null}

      <Section title={query ? 'Results' : 'Suggestions'} style={styles.section}>
        {results.length ? (
          <FoodList foods={results} onPick={open} />
        ) : (
          <Text variant="callout" color="secondary">
            No matches. Try another word or create a custom food.
          </Text>
        )}
      </Section>
    </Screen>
  );
}

function FoodList({ foods, onPick }: { foods: FoodItem[]; onPick: (f: FoodItem) => void }) {
  return (
    <Card padding={0} style={styles.listCard}>
      {foods.map((f, i) => (
        <View key={f.id} style={styles.inset}>
          <ListRow
            label={f.name}
            detail={`${f.brand ? `${f.brand} · ` : ''}${f.servingLabel ?? `${f.servingSize} ${f.servingUnit}`} · ${f.nutrients.carbs} g carbs`}
            value={`${f.nutrients.calories} kcal`}
            last={i === foods.length - 1}
            onPress={() => onPick(f)}
          />
        </View>
      ))}
    </Card>
  );
}

function Option({ icon, label, hint, onPress }: { icon: React.ReactNode; label: string; hint?: string; onPress?: () => void }) {
  return (
    <PressableScale onPress={onPress} disabled={!onPress} style={[styles.option, !onPress && styles.optionDisabled]} accessibilityRole="button" accessibilityLabel={label}>
      {icon}
      <Text variant="label" color={onPress ? 'primary' : 'muted'}>
        {label}
      </Text>
      {hint ? (
        <Text variant="caption" color="muted">
          {hint}
        </Text>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 48,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 16, height: '100%' },
  options: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  option: {
    flex: 1,
    height: 84,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  optionDisabled: { opacity: 0.6 },
  section: { marginTop: spacing.xxl },
  listCard: { paddingVertical: spacing.xs },
  inset: { paddingHorizontal: spacing.lg + 2 },
});
