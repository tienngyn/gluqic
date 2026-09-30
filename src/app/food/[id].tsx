import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/cards/Card';
import { NumberField, parseNumber } from '@/components/forms/NumberField';
import { Text } from '@/components/typography/Text';
import { Button } from '@/components/ui/Button';
import { Screen, Section } from '@/components/ui/Screen';
import { ChipGroup } from '@/components/ui/SegmentedControl';
import { SheetHeader } from '@/components/ui/SheetHeader';
import { colors, spacing } from '@/constants/theme';
import { FOOD_BY_ID } from '@/data/foods';
import { portionNutrients } from '@/domain/nutrition/totals';
import { useAppStore } from '@/store/useAppStore';
import type { MealType } from '@/types/models';
import { MEAL_LABEL, MEAL_TYPES } from '@/utils/format';
import { haptics } from '@/utils/haptics';

export default function FoodDetail() {
  const { id, meal: mealParam } = useLocalSearchParams<{ id: string; meal?: MealType }>();
  const customFoods = useAppStore((s) => s.customFoods);
  const logMealItems = useAppStore((s) => s.logMealItems);
  const setBolusDraft = useAppStore((s) => s.setBolusDraft);
  const food = FOOD_BY_ID[id] ?? customFoods.find((f) => f.id === id);
  const [meal, setMeal] = useState<MealType>(mealParam ?? 'snack');
  const [amount, setAmount] = useState(food ? String(food.servingSize) : '');

  const qty = parseNumber(amount) ?? 0;
  const n = useMemo(() => (food ? portionNutrients(food, qty) : null), [food, qty]);

  if (!food || !n) {
    return (
      <Screen modal>
        <SheetHeader title="Food not found" />
        <Text color="secondary">This item is no longer available.</Text>
      </Screen>
    );
  }

  const unitLabel = food.servingUnit === 'piece' ? (qty === 1 ? 'serving' : 'servings') : food.servingUnit;
  const presets = food.servingUnit === 'piece' ? [0.5, 1, 1.5, 2] : [0.5, 1, 1.5, 2].map((f) => f * food.servingSize);

  const add = (toBolus: boolean) => {
    if (qty <= 0) return;
    logMealItems(meal, [{ foodId: food.id, name: food.name, servings: qty / food.servingSize, nutrients: n }]);
    haptics.success();
    if (toBolus) {
      setBolusDraft({ carbs: n.carbs, mealType: meal, source: food.name });
      router.dismissAll();
      router.navigate('/bolus');
    } else {
      router.dismissAll();
    }
  };

  return (
    <Screen
      modal
      footer={
        <View style={styles.footer}>
          <Button label={`Add to ${MEAL_LABEL[meal].toLowerCase()}`} onPress={() => add(false)} disabled={qty <= 0} />
          <Button label={`Add & send ${Math.round(n.carbs)} g to Bolus`} variant="secondary" onPress={() => add(true)} disabled={qty <= 0} />
        </View>
      }>
      <SheetHeader title={food.name} subtitle={[food.brand, food.servingLabel].filter(Boolean).join(' · ') || undefined} />

      <Card variant="elevated" padding={spacing.xxl}>
        <View style={styles.hero}>
          <View>
            <Text variant="label" color="secondary">
              Carbs
            </Text>
            <Text variant="metricL">
              {n.carbs}
              <Text variant="headline" color="secondary">
                {' '}
                g
              </Text>
            </Text>
          </View>
          <View style={styles.kcal}>
            <Text variant="label" color="secondary">
              Energy
            </Text>
            <Text variant="metricM">
              {n.calories}
              <Text variant="label" color="secondary">
                {' '}
                kcal
              </Text>
            </Text>
          </View>
        </View>
        <View style={styles.macroGrid}>
          <Macro label="Protein" value={n.protein} />
          <Macro label="Fat" value={n.fat} />
          <Macro label="Fiber" value={n.fiber ?? 0} />
          <Macro label="Sugar" value={n.sugar ?? 0} />
        </View>
      </Card>

      <Section title="Portion" style={styles.section}>
        <NumberField label="Amount" unit={unitLabel} value={amount} onChangeText={setAmount} />
        <View style={styles.presets}>
          <ChipGroup<string>
            value={String(qty)}
            onChange={(v) => setAmount(v)}
            options={presets.map((p) => ({
              value: String(p),
              label: food.servingUnit === 'piece' ? `${p}×` : `${p} ${food.servingUnit}`,
            }))}
          />
        </View>
      </Section>

      <Section title="Meal" style={styles.section}>
        <ChipGroup<MealType> value={meal} onChange={setMeal} options={MEAL_TYPES.map((m) => ({ value: m, label: MEAL_LABEL[m] }))} />
      </Section>
    </Screen>
  );
}

function Macro({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.macro}>
      <Text variant="caption" color="muted">
        {label}
      </Text>
      <Text variant="bodyStrong" tabular>
        {value} g
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  kcal: { alignItems: 'flex-end' },
  macroGrid: {
    flexDirection: 'row',
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  macro: { flex: 1, gap: 2 },
  section: { marginTop: spacing.xxl },
  presets: { marginTop: spacing.md },
  footer: { gap: spacing.sm },
});
