import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { NumberField, parseNumber } from '@/components/forms/NumberField';
import { Text } from '@/components/typography/Text';
import { BackHeader } from '@/components/ui/BackHeader';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Screen, Section } from '@/components/ui/Screen';
import { spacing } from '@/constants/theme';
import { caloriesFromMacros } from '@/domain/nutrition/totals';
import { useAppStore } from '@/store/useAppStore';
import { haptics } from '@/utils/haptics';

export default function Goals() {
  const goals = useAppStore((s) => s.nutritionGoals);
  const weightGoal = useAppStore((s) => s.weightGoal);
  const updateNutritionGoals = useAppStore((s) => s.updateNutritionGoals);
  const updateWeightGoal = useAppStore((s) => s.updateWeightGoal);
  const [f, setF] = useState({
    calories: String(goals.calories),
    protein: String(goals.protein),
    carbs: String(goals.carbs),
    fat: String(goals.fat),
    fiber: String(goals.fiber),
    weight: String(weightGoal.targetKg),
    height: String(weightGoal.heightCm ?? ''),
  });
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));
  const n = (k: keyof typeof f) => parseNumber(f[k]);

  const fromMacros = caloriesFromMacros({ carbs: n('carbs') ?? 0, protein: n('protein') ?? 0, fat: n('fat') ?? 0 });
  const cal = n('calories') ?? 0;
  const valid = cal >= 800 && cal <= 6000 && [n('protein'), n('carbs'), n('fat'), n('fiber')].every((x) => x != null && x >= 0) && (n('weight') ?? 0) > 30;

  const save = () => {
    if (!valid) return;
    updateNutritionGoals({ calories: cal, protein: n('protein')!, carbs: n('carbs')!, fat: n('fat')!, fiber: n('fiber')! });
    updateWeightGoal({ targetKg: n('weight')!, heightCm: n('height') });
    haptics.success();
    router.back();
  };

  return (
    <Screen footer={<Button label="Save goals" onPress={save} disabled={!valid} />}>
      <BackHeader />
      <Text variant="title">Goals</Text>

      <Section title="Nutrition">
        <View style={styles.stack}>
          <NumberField label="Calories" unit="kcal" value={f.calories} onChangeText={set('calories')} decimal={false} error={cal && (cal < 800 || cal > 6000) ? 'Between 800 and 6000 kcal' : undefined} />
          <View style={styles.row}>
            <NumberField style={styles.flex} label="Protein" unit="g" value={f.protein} onChangeText={set('protein')} />
            <NumberField style={styles.flex} label="Carbs" unit="g" value={f.carbs} onChangeText={set('carbs')} />
          </View>
          <View style={styles.row}>
            <NumberField style={styles.flex} label="Fat" unit="g" value={f.fat} onChangeText={set('fat')} />
            <NumberField style={styles.flex} label="Fiber" unit="g" value={f.fiber} onChangeText={set('fiber')} />
          </View>
          {Math.abs(fromMacros - cal) > 150 ? (
            <Banner tone="info" message={`Your macros add up to about ${fromMacros} kcal.`} />
          ) : null}
        </View>
      </Section>

      <Section title="Weight">
        <View style={styles.row}>
          <NumberField style={styles.flex} label="Target weight" unit="kg" value={f.weight} onChangeText={set('weight')} />
          <NumberField style={styles.flex} label="Height" unit="cm" value={f.height} onChangeText={set('height')} hint="For BMI" />
        </View>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
});
