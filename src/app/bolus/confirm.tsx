import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { Card } from '@/components/cards/Card';
import { NumberField, parseNumber } from '@/components/forms/NumberField';
import { Text } from '@/components/typography/Text';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ListRow } from '@/components/ui/ListRow';
import { Screen } from '@/components/ui/Screen';
import { SheetHeader } from '@/components/ui/SheetHeader';
import { colors, spacing } from '@/constants/theme';
import { useAppStore } from '@/store/useAppStore';
import { formatGlucose, MEAL_LABEL } from '@/utils/format';
import { haptics } from '@/utils/haptics';

export default function ConfirmBolus() {
  const pending = useAppStore((s) => s.pendingBolus);
  const unit = useAppStore((s) => s.user.glucoseUnit);
  const maxBolus = useAppStore((s) => s.insulinProfile.maxBolus);
  const saveBolus = useAppStore((s) => s.saveBolus);
  const [units, setUnits] = useState(pending ? pending.suggestedBolus.toFixed(1) : '');
  const [ack, setAck] = useState(false);

  if (!pending) {
    return (
      <Screen modal>
        <SheetHeader title="Nothing to confirm" />
        <Text color="secondary">Run a calculation on the Bolus tab first.</Text>
      </Screen>
    );
  }

  const taken = parseNumber(units);
  const invalid = taken == null || taken < 0;
  const overMax = taken != null && taken > maxBolus;
  const differs = taken != null && Math.abs(taken - pending.suggestedBolus) >= 0.05;

  const save = () => {
    if (invalid || overMax || !ack || taken == null) return;
    saveBolus({ ...pending, confirmedUnits: taken, timestamp: new Date().toISOString() });
    haptics.success();
    router.back();
  };

  return (
    <Screen
      modal
      footer={<Button label={taken ? `Save ${taken.toFixed(1)} U` : 'Save without insulin'} onPress={save} disabled={invalid || overMax || !ack} />}>
      <SheetHeader title="Confirm bolus" subtitle={`${MEAL_LABEL[pending.mealType]} · ${Math.round(pending.carbs)} g carbs`} />

      <NumberField size="l" label="Units taken" unit="U" value={units} onChangeText={setUnits} error={invalid ? 'Enter the amount you took' : undefined} />

      <View style={styles.banners}>
        {overMax ? <Banner tone="critical" message={`This is above your max bolus of ${maxBolus} U and can't be saved.`} /> : null}
        {differs && !overMax ? (
          <Banner tone="info" message={`Different from the suggested ${pending.suggestedBolus.toFixed(1)} U. Both values are recorded.`} />
        ) : null}
        {pending.warnings.map((w) => (
          <Banner key={w} tone="info" message={w} />
        ))}
      </View>

      <Card padding={spacing.lg} style={styles.card}>
        <ListRow label="Glucose" value={`${formatGlucose(pending.currentGlucose, unit)} ${unit}`} />
        <ListRow label="Meal insulin" detail={`${Math.round(pending.carbs)} g ÷ ${pending.carbRatio}`} value={`${pending.mealBolus.toFixed(2)} U`} />
        <ListRow label="Correction" value={`${pending.correctionBolus.toFixed(2)} U`} />
        <ListRow label="Active insulin" value={`${pending.activeInsulinAdjustment.toFixed(2)} U`} />
        <ListRow label="Suggested" value={`${pending.suggestedBolus.toFixed(1)} U`} last />
      </Card>

      <View style={styles.ack}>
        <Text variant="callout" color="secondary" style={styles.ackText}>
          I understand this is a prototype calculation, not medical advice, and I have checked the amount.
        </Text>
        <Switch
          value={ack}
          onValueChange={(v) => {
            haptics.selection();
            setAck(v);
          }}
          trackColor={{ false: colors.elevatedHigh, true: colors.green }}
          thumbColor="#fff"
          accessibilityLabel="Acknowledge prototype calculation"
        />
      </View>
      <Text variant="caption" color="muted">
        Version {pending.calculationVersion}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  banners: { gap: spacing.sm, marginTop: spacing.md },
  card: { marginTop: spacing.xl },
  ack: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: spacing.xxl, marginBottom: spacing.md },
  ackText: { flex: 1 },
});
