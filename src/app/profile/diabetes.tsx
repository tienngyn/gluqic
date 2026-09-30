import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/cards/Card';
import { NumberField, parseNumber } from '@/components/forms/NumberField';
import { Text } from '@/components/typography/Text';
import { BackHeader } from '@/components/ui/BackHeader';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Screen, Section } from '@/components/ui/Screen';
import { ChipGroup } from '@/components/ui/SegmentedControl';
import { spacing } from '@/constants/theme';
import { useAppStore } from '@/store/useAppStore';
import { formatMinuteOfDay, fromDisplayGlucose, toDisplayGlucose } from '@/utils/format';
import { haptics } from '@/utils/haptics';

const parseTime = (v: string): number | undefined => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : undefined;
};

/** Every change here is an explicit user edit — gluciq never adjusts these itself. */
export default function DiabetesSettings() {
  const profile = useAppStore((s) => s.insulinProfile);
  const unit = useAppStore((s) => s.user.glucoseUnit);
  const updateInsulinProfile = useAppStore((s) => s.updateInsulinProfile);
  const updateCarbRatio = useAppStore((s) => s.updateCarbRatio);

  const [f, setF] = useState({
    target: String(toDisplayGlucose(profile.targetGlucose, unit)),
    cf: String(toDisplayGlucose(profile.correctionFactor, unit)),
    dia: String(profile.insulinDurationHours),
    max: String(profile.maxBolus),
    minG: String(toDisplayGlucose(profile.minGlucoseForBolus, unit)),
    increment: String(profile.doseIncrement),
  });
  const [ratios, setRatios] = useState(
    profile.carbRatios.map((c) => ({
      id: c.id,
      label: c.label,
      g: String(c.gramsPerUnit),
      start: formatMinuteOfDay(c.startMinute),
      end: formatMinuteOfDay(c.endMinute),
    })),
  );
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  const target = fromDisplayGlucose(parseNumber(f.target) ?? NaN, unit);
  const cf = fromDisplayGlucose(parseNumber(f.cf) ?? NaN, unit);
  const dia = parseNumber(f.dia);
  const max = parseNumber(f.max);
  const minG = fromDisplayGlucose(parseNumber(f.minG) ?? NaN, unit);
  const errors = {
    target: target >= 70 && target <= 200 ? undefined : 'Between 70 and 200 mg/dL',
    cf: cf >= 5 && cf <= 400 ? undefined : 'Between 5 and 400 mg/dL per unit',
    dia: dia != null && dia >= 2 && dia <= 8 ? undefined : 'Between 2 and 8 hours',
    max: max != null && max > 0 && max <= 50 ? undefined : 'Between 0.5 and 50 U',
    minG: minG >= 40 && minG <= 120 ? undefined : 'Between 40 and 120 mg/dL',
  };
  const ratioErrors = ratios.map((r) => {
    const g = parseNumber(r.g);
    if (g == null || g < 1 || g > 150) return 'Ratio between 1 and 150 g';
    if (parseTime(r.start) == null || parseTime(r.end) == null) return 'Times as HH:MM';
    return undefined;
  });
  const valid = Object.values(errors).every((e) => !e) && ratioErrors.every((e) => !e);

  const save = () => {
    if (!valid) return;
    updateInsulinProfile({
      targetGlucose: target,
      correctionFactor: cf,
      insulinDurationHours: dia!,
      maxBolus: max!,
      minGlucoseForBolus: minG,
      doseIncrement: Number(f.increment),
    });
    ratios.forEach((r) =>
      updateCarbRatio(r.id, { gramsPerUnit: parseNumber(r.g)!, startMinute: parseTime(r.start)!, endMinute: parseTime(r.end)! }),
    );
    haptics.success();
    router.back();
  };

  return (
    <Screen footer={<Button label="Save settings" onPress={save} disabled={!valid} />}>
      <BackHeader />
      <Text variant="title">Diabetes settings</Text>
      <View style={styles.banner}>
        <Banner tone="info" message="Use the values agreed with your care team. gluciq only changes these when you do." />
      </View>

      <View style={styles.row}>
        <NumberField style={styles.flex} label="Target" unit={unit} value={f.target} onChangeText={set('target')} error={errors.target} decimal={unit === 'mmol/L'} />
        <NumberField style={styles.flex} label="Correction factor" unit={`${unit}/U`} value={f.cf} onChangeText={set('cf')} error={errors.cf} decimal={unit === 'mmol/L'} />
      </View>
      <View style={styles.row}>
        <NumberField style={styles.flex} label="Insulin duration" unit="h" value={f.dia} onChangeText={set('dia')} error={errors.dia} />
        <NumberField style={styles.flex} label="Max bolus" unit="U" value={f.max} onChangeText={set('max')} error={errors.max} />
      </View>
      <View style={styles.row}>
        <NumberField
          style={styles.flex}
          label="No bolus at or below"
          unit={unit}
          value={f.minG}
          onChangeText={set('minG')}
          error={errors.minG}
          decimal={unit === 'mmol/L'}
          hint="The calculator suggests 0 U below this"
        />
      </View>
      <Text variant="label" color="secondary" style={styles.label}>
        Dose increment
      </Text>
      <ChipGroup<string>
        value={f.increment}
        onChange={set('increment')}
        options={[
          { value: '0.05', label: '0.05 U' },
          { value: '0.1', label: '0.1 U' },
          { value: '0.5', label: '0.5 U' },
          { value: '1', label: '1 U' },
        ]}
      />

      <Section title="Carb ratios by time of day">
        <View style={styles.ratios}>
          {ratios.map((r, i) => (
            <Card key={r.id} padding={spacing.lg}>
              <Text variant="bodyStrong">{r.label}</Text>
              <View style={[styles.row, styles.ratioRow]}>
                <NumberField
                  style={styles.flex}
                  label="g per 1 U"
                  value={r.g}
                  onChangeText={(v) => setRatios((rs) => rs.map((x) => (x.id === r.id ? { ...x, g: v } : x)))}
                />
                <TimeField label="From" value={r.start} onChange={(v) => setRatios((rs) => rs.map((x) => (x.id === r.id ? { ...x, start: v } : x)))} />
                <TimeField label="To" value={r.end} onChange={(v) => setRatios((rs) => rs.map((x) => (x.id === r.id ? { ...x, end: v } : x)))} />
              </View>
              {ratioErrors[i] ? (
                <Text variant="caption" color="red" style={styles.ratioError}>
                  {ratioErrors[i]}
                </Text>
              ) : null}
            </Card>
          ))}
        </View>
      </Section>
    </Screen>
  );
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <NumberField
      style={styles.flex}
      label={label}
      value={value}
      decimal={false}
      onChangeText={(raw) => {
        const digits = raw.replace(/\D/g, '').slice(0, 4);
        onChange(digits.length > 2 ? `${digits.slice(0, digits.length - 2)}:${digits.slice(-2)}` : digits);
      }}
      placeholder="00:00"
    />
  );
}

const styles = StyleSheet.create({
  banner: { marginTop: spacing.md, marginBottom: spacing.xl },
  row: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  flex: { flex: 1 },
  label: { marginTop: spacing.sm, marginBottom: spacing.sm },
  ratios: { gap: spacing.md },
  ratioRow: { marginTop: spacing.md, marginBottom: 0 },
  ratioError: { marginTop: spacing.sm },
});
