import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { NumberField, parseNumber, TextField } from '@/components/forms/NumberField';
import { Text } from '@/components/typography/Text';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { ChipGroup } from '@/components/ui/SegmentedControl';
import { SheetHeader } from '@/components/ui/SheetHeader';
import { spacing } from '@/constants/theme';
import { caloriesFromMacros } from '@/domain/nutrition/totals';
import { useAppStore } from '@/store/useAppStore';
import type { FoodItem, MealType } from '@/types/models';

type Unit = FoodItem['servingUnit'];

export default function CustomFood() {
  const { meal } = useLocalSearchParams<{ meal?: MealType }>();
  const addCustomFood = useAppStore((s) => s.addCustomFood);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState<Unit>('g');
  const [f, setF] = useState({ serving: '100', kcal: '', carbs: '', protein: '', fat: '', fiber: '', sugar: '' });
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  const num = (k: keyof typeof f) => parseNumber(f[k]) ?? 0;
  const derived = caloriesFromMacros({ carbs: num('carbs'), protein: num('protein'), fat: num('fat') });
  const kcal = parseNumber(f.kcal) ?? derived;
  const mismatch = parseNumber(f.kcal) != null && derived > 0 && Math.abs(kcal - derived) / derived > 0.25;
  const valid = name.trim().length > 1 && num('serving') > 0 && parseNumber(f.carbs) != null;

  const save = () => {
    if (!valid) return;
    const food = addCustomFood({
      name: name.trim(),
      servingSize: num('serving'),
      servingUnit: unit,
      nutrients: { calories: Math.round(kcal), carbs: num('carbs'), protein: num('protein'), fat: num('fat'), fiber: num('fiber'), sugar: num('sugar') },
    });
    router.replace({ pathname: '/food/[id]', params: { id: food.id, meal: meal ?? 'snack' } });
  };

  return (
    <Screen modal footer={<Button label="Save food" onPress={save} disabled={!valid} />}>
      <SheetHeader title="Custom food" subtitle="Nutrition per serving" />
      <View style={styles.stack}>
        <TextField label="Name" value={name} onChangeText={setName} placeholder="e.g. Grandma's apple cake" />
        <View style={styles.row}>
          <NumberField style={styles.flex} label="Serving size" value={f.serving} onChangeText={set('serving')} />
          <View style={[styles.flex, styles.unit]}>
            <Text variant="label" color="secondary">
              Unit
            </Text>
            <ChipGroup<Unit>
              value={unit}
              onChange={setUnit}
              options={[
                { value: 'g', label: 'g' },
                { value: 'ml', label: 'ml' },
                { value: 'piece', label: 'piece' },
              ]}
            />
          </View>
        </View>
        <View style={styles.row}>
          <NumberField style={styles.flex} label="Carbs" unit="g" value={f.carbs} onChangeText={set('carbs')} />
          <NumberField style={styles.flex} label="Energy" unit="kcal" value={f.kcal} onChangeText={set('kcal')} placeholder={derived ? String(derived) : '0'} hint={f.kcal ? undefined : 'From macros'} />
        </View>
        <View style={styles.row}>
          <NumberField style={styles.flex} label="Protein" unit="g" value={f.protein} onChangeText={set('protein')} />
          <NumberField style={styles.flex} label="Fat" unit="g" value={f.fat} onChangeText={set('fat')} />
        </View>
        <View style={styles.row}>
          <NumberField style={styles.flex} label="Fiber" unit="g" value={f.fiber} onChangeText={set('fiber')} />
          <NumberField style={styles.flex} label="Sugar" unit="g" value={f.sugar} onChangeText={set('sugar')} />
        </View>
        {mismatch ? <Banner tone="caution" message={`Energy doesn't match the macros (about ${derived} kcal). Double-check the label.`} /> : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  flex: { flex: 1 },
  unit: { gap: spacing.sm, justifyContent: 'center' },
});
