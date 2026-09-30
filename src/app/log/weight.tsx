import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { NumberField, parseNumber } from '@/components/forms/NumberField';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { SheetHeader } from '@/components/ui/SheetHeader';
import { spacing } from '@/constants/theme';
import { useAppStore } from '@/store/useAppStore';
import { haptics } from '@/utils/haptics';

export default function LogWeight() {
  const last = useAppStore((s) => s.weights[s.weights.length - 1]);
  const addWeight = useAppStore((s) => s.addWeight);
  const [kg, setKg] = useState(last ? last.weightKg.toFixed(1) : '');
  const [fat, setFat] = useState('');

  const w = parseNumber(kg);
  const bf = parseNumber(fat);
  const error = w == null ? undefined : w < 25 || w > 350 ? 'Between 25 and 350 kg' : undefined;
  const fatError = bf == null ? undefined : bf < 2 || bf > 70 ? 'Between 2 and 70%' : undefined;

  const save = () => {
    if (w == null || error || fatError) return;
    addWeight({ weightKg: w, bodyFatPct: bf, timestamp: new Date().toISOString(), source: 'manual' });
    haptics.success();
    router.back();
  };

  return (
    <Screen modal footer={<Button label="Save weight" onPress={save} disabled={w == null || !!error || !!fatError} />}>
      <SheetHeader title="Log weight" subtitle={last ? `Last: ${last.weightKg.toFixed(1)} kg` : undefined} />
      <View style={styles.stack}>
        <NumberField size="l" label="Weight" unit="kg" value={kg} onChangeText={setKg} error={error} autoFocus />
        <NumberField label="Body fat (optional)" unit="%" value={fat} onChangeText={setFat} error={fatError} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ stack: { gap: spacing.md } });
