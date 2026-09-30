import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Card } from '@/components/cards/Card';
import { NumberField, parseNumber, TextField } from '@/components/forms/NumberField';
import { Text } from '@/components/typography/Text';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ListRow } from '@/components/ui/ListRow';
import { Screen, Section } from '@/components/ui/Screen';
import { ChipGroup, SegmentedControl } from '@/components/ui/SegmentedControl';
import { colors, radius, spacing } from '@/constants/theme';
import { useAppStore, type OnboardingResult } from '@/store/useAppStore';
import type { GlucoseSource, GlucoseUnit, MealType } from '@/types/models';
import { formatGlucose, fromDisplayGlucose, MEAL_LABEL, MEAL_TYPES, toDisplayGlucose } from '@/utils/format';
import { haptics } from '@/utils/haptics';

const STEPS = ['Welcome', 'Glucose', 'Insulin', 'Safety', 'Goals', 'Start'] as const;

const SOURCES: { value: GlucoseSource; label: string }[] = [
  { value: 'dexcom', label: 'Dexcom' },
  { value: 'libre', label: 'FreeStyle Libre' },
  { value: 'other-cgm', label: 'Other CGM' },
  { value: 'meter', label: 'Finger-prick meter' },
];

const SOURCE_NOTE: Record<GlucoseSource, string> = {
  dexcom:
    'Dexcom shares readings with Apple Health about 3 hours late. That is fine for learning, but when you eat, type in the current value from the Dexcom app — gluciq never uses an old value as current.',
  libre:
    'Libre readings usually reach Apple Health only through third-party apps and can be delayed. When you eat, type in the current value from your Libre app.',
  'other-cgm':
    'If your CGM writes to Apple Health, gluciq reads it for learning. When you eat, type in the current value from your CGM app if the latest one here is older than 15 minutes.',
  meter: 'Log each finger-prick reading. The bolus calculator asks for your current value every time.',
};

type Form = {
  name: string;
  unit: GlucoseUnit;
  source: GlucoseSource;
  target: string;
  cf: string;
  dia: string;
  ratios: Record<MealType, string>;
  max: string;
  minG: string;
  increment: string;
  ack: boolean;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  keepSample: boolean;
};

export default function Onboarding() {
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const exploreSampleData = useAppStore((s) => s.exploreSampleData);
  const [step, setStep] = useState(0);
  const current = useAppStore.getState();
  // Running setup again starts from the current values.
  const again = current.onboarded;
  const u = current.user.glucoseUnit;
  const ratioFor = (m: MealType) => String(current.insulinProfile.carbRatios.find((c) => c.mealType === m)?.gramsPerUnit ?? '');
  const [f, setF] = useState<Form>(() => again ? {
    name: current.user.name,
    unit: u,
    source: current.user.glucoseSource ?? 'dexcom',
    target: String(toDisplayGlucose(current.insulinProfile.targetGlucose, u)),
    cf: String(toDisplayGlucose(current.insulinProfile.correctionFactor, u)),
    dia: String(current.insulinProfile.insulinDurationHours),
    ratios: { breakfast: ratioFor('breakfast'), lunch: ratioFor('lunch'), dinner: ratioFor('dinner'), snack: ratioFor('snack') },
    max: String(current.insulinProfile.maxBolus),
    minG: String(toDisplayGlucose(current.insulinProfile.minGlucoseForBolus, u)),
    increment: String(current.insulinProfile.doseIncrement),
    ack: false,
    calories: String(current.nutritionGoals.calories),
    protein: String(current.nutritionGoals.protein),
    carbs: String(current.nutritionGoals.carbs),
    fat: String(current.nutritionGoals.fat),
    keepSample: true,
  } : {
    name: '',
    unit: 'mg/dL',
    source: 'dexcom',
    target: '110',
    cf: '40',
    dia: '4',
    ratios: { breakfast: '', lunch: '', dinner: '', snack: '' },
    max: '15',
    minG: '70',
    increment: '0.5',
    ack: false,
    calories: '2200',
    protein: '130',
    carbs: '220',
    fat: '70',
    keepSample: true,
  });
  const set = <K extends keyof Form>(k: K) => (v: Form[K]) => setF((s) => ({ ...s, [k]: v }));

  // Glucose fields are shown in the chosen unit; validation runs in mg/dL.
  const mg = (v: string) => {
    const n = parseNumber(v);
    return n == null ? NaN : fromDisplayGlucose(n, f.unit);
  };
  const switchUnit = (unit: GlucoseUnit) => {
    if (unit === f.unit) return;
    const conv = (v: string) => {
      const n = mg(v);
      return Number.isFinite(n) ? String(toDisplayGlucose(n, unit)) : v;
    };
    setF((s) => ({ ...s, unit, target: conv(s.target), cf: conv(s.cf), minG: conv(s.minG) }));
  };

  const num = (v: string) => parseNumber(v) ?? NaN;
  const errors = {
    target: mg(f.target) >= 70 && mg(f.target) <= 200 ? undefined : `Between ${formatGlucose(70, f.unit)} and ${formatGlucose(200, f.unit)}`,
    cf: mg(f.cf) >= 5 && mg(f.cf) <= 400 ? undefined : 'Enter your correction factor',
    dia: num(f.dia) >= 2 && num(f.dia) <= 8 ? undefined : 'Between 2 and 8 hours',
    ratios: MEAL_TYPES.every((m) => num(f.ratios[m]) >= 1 && num(f.ratios[m]) <= 150)
      ? undefined
      : 'Enter a ratio between 1 and 150 g for each meal',
    max: num(f.max) > 0 && num(f.max) <= 50 ? undefined : 'Between 0.5 and 50 U',
    minG: mg(f.minG) >= 40 && mg(f.minG) <= 120 ? undefined : `Between ${formatGlucose(40, f.unit)} and ${formatGlucose(120, f.unit)}`,
    goals: num(f.calories) >= 800 && num(f.calories) <= 6000 ? undefined : 'Calories between 800 and 6000',
  };

  const canContinue = [
    f.name.trim().length > 0,
    !errors.target,
    !errors.cf && !errors.dia && !errors.ratios,
    !errors.max && !errors.minG && f.ack,
    !errors.goals,
    true,
  ][step];

  const finish = () => {
    const result: OnboardingResult = {
      name: f.name.trim(),
      glucoseUnit: f.unit,
      glucoseSource: f.source,
      insulin: {
        targetGlucose: mg(f.target),
        correctionFactor: mg(f.cf),
        insulinDurationHours: num(f.dia),
        maxBolus: num(f.max),
        minGlucoseForBolus: mg(f.minG),
        doseIncrement: Number(f.increment),
        gramsPerUnit: Object.fromEntries(MEAL_TYPES.map((m) => [m, num(f.ratios[m])])) as Record<MealType, number>,
      },
      goals: {
        calories: num(f.calories),
        protein: num(f.protein) || 0,
        carbs: num(f.carbs) || 0,
        fat: num(f.fat) || 0,
        fiber: 30,
      },
      keepSampleData: f.keepSample,
    };
    completeOnboarding(result);
    haptics.success();
    router.replace('/');
  };

  const next = () => {
    if (!canContinue) return;
    haptics.light();
    if (step === STEPS.length - 1) finish();
    else setStep(step + 1);
  };

  const footer = (
    <View style={styles.footer}>
      {step > 0 ? <Button label="Back" variant="secondary" onPress={() => setStep(step - 1)} style={styles.back} /> : null}
      <Button
        label={step === STEPS.length - 1 ? (again ? 'Save setup' : 'Start using gluciq') : step === 0 && !again ? 'Set up gluciq' : 'Continue'}
        onPress={next}
        disabled={!canContinue}
        style={styles.flex}
      />
    </View>
  );

  return (
    <Screen footer={footer}>
      <View style={styles.progress} accessibilityLabel={`Step ${step + 1} of ${STEPS.length}`}>
        {STEPS.map((s, i) => (
          <View key={s} style={[styles.dot, i <= step && styles.dotOn]} />
        ))}
      </View>

      <Animated.View key={step} entering={FadeIn.duration(250)} exiting={FadeOut.duration(120)}>
        {step === 0 ? (
          <View>
            <Text variant="display" style={styles.wordmark}>
              gluciq
            </Text>
            <Text variant="headline" style={styles.lead}>
              See how glucose, insulin, food and activity work together — and learn from your own days.
            </Text>
            <View style={styles.stack}>
              <TextField label="What should we call you?" value={f.name} onChangeText={set('name')} placeholder="First name" />
            </View>
            <Text
              variant="label"
              color="secondary"
              accessibilityRole="button"
              style={styles.explore}
              onPress={() => {
                exploreSampleData();
                router.replace('/');
              }}>
              Just look around with sample data →
            </Text>
          </View>
        ) : null}

        {step === 1 ? (
          <View>
            <StepTitle title="Glucose" body="How you measure, and where you want to be." />
            <SegmentedControl<GlucoseUnit>
              value={f.unit}
              onChange={switchUnit}
              segments={[
                { value: 'mg/dL', label: 'mg/dL' },
                { value: 'mmol/L', label: 'mmol/L' },
              ]}
            />
            <View style={styles.stack}>
              <NumberField
                label="Target glucose"
                unit={f.unit}
                value={f.target}
                onChangeText={set('target')}
                decimal={f.unit === 'mmol/L'}
                error={errors.target}
                hint="The value corrections aim for"
              />
            </View>
            <Section title="How do you measure?" style={styles.section}>
              <ChipGroup<GlucoseSource> value={f.source} onChange={set('source')} options={SOURCES} />
              <View style={styles.note}>
                <Banner tone="info" message={SOURCE_NOTE[f.source]} />
              </View>
            </Section>
          </View>
        ) : null}

        {step === 2 ? (
          <View>
            <StepTitle title="Insulin settings" body="Use the values agreed with your care team. You can change them any time." />
            <View style={styles.row}>
              <NumberField
                style={styles.flex}
                label="Correction factor"
                unit={`${f.unit}/U`}
                value={f.cf}
                onChangeText={set('cf')}
                decimal={f.unit === 'mmol/L'}
                error={errors.cf}
                hint="How far 1 U lowers glucose"
              />
              <NumberField style={styles.flex} label="Insulin duration" unit="h" value={f.dia} onChangeText={set('dia')} error={errors.dia} />
            </View>
            <Section title="Carb ratios" style={styles.section}>
              <Text variant="label" color="muted" style={styles.sub}>
                Grams of carbs covered by 1 U. Time windows can be adjusted later in Diabetes settings.
              </Text>
              <View style={styles.grid}>
                {MEAL_TYPES.map((m) => (
                  <NumberField
                    key={m}
                    style={styles.half}
                    label={m === 'snack' ? 'Late / snacks' : MEAL_LABEL[m]}
                    unit="g per U"
                    value={f.ratios[m]}
                    onChangeText={(v) => setF((s) => ({ ...s, ratios: { ...s.ratios, [m]: v } }))}
                    placeholder="—"
                  />
                ))}
              </View>
              {errors.ratios && MEAL_TYPES.some((m) => f.ratios[m]) ? (
                <Text variant="caption" color="red" style={styles.sub}>
                  {errors.ratios}
                </Text>
              ) : null}
            </Section>
          </View>
        ) : null}

        {step === 3 ? (
          <View>
            <StepTitle title="Safety" body="Limits the calculator always respects, whatever you enter." />
            <View style={styles.row}>
              <NumberField style={styles.flex} label="Max bolus" unit="U" value={f.max} onChangeText={set('max')} error={errors.max} />
              <NumberField
                style={styles.flex}
                label="No insulin at or below"
                unit={f.unit}
                value={f.minG}
                onChangeText={set('minG')}
                decimal={f.unit === 'mmol/L'}
                error={errors.minG}
              />
            </View>
            <Text variant="label" color="secondary" style={styles.sub}>
              Your pen or pump doses in steps of
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
            <Card style={styles.ackCard} padding={spacing.lg + 2}>
              <View style={styles.ackRow}>
                <Text variant="callout" color="secondary" style={styles.flex}>
                  gluciq is a prototype. Its calculations are shown step by step but are not medically validated. I will
                  check every amount and follow my care plan.
                </Text>
                <Switch
                  value={f.ack}
                  onValueChange={(v) => {
                    haptics.selection();
                    set('ack')(v);
                  }}
                  trackColor={{ false: colors.elevatedHigh, true: colors.green }}
                  thumbColor="#fff"
                  accessibilityLabel="I understand gluciq is a prototype"
                />
              </View>
            </Card>
          </View>
        ) : null}

        {step === 4 ? (
          <View>
            <StepTitle title="Nutrition goals" body="Daily targets for the Food tab. Keep the defaults if you're not sure." />
            <View style={styles.stack}>
              <NumberField label="Calories" unit="kcal" value={f.calories} onChangeText={set('calories')} decimal={false} error={errors.goals} />
              <View style={styles.row}>
                <NumberField style={styles.flex} label="Protein" unit="g" value={f.protein} onChangeText={set('protein')} />
                <NumberField style={styles.flex} label="Carbs" unit="g" value={f.carbs} onChangeText={set('carbs')} />
                <NumberField style={styles.flex} label="Fat" unit="g" value={f.fat} onChangeText={set('fat')} />
              </View>
            </View>
          </View>
        ) : null}

        {step === 5 ? (
          <View>
            <StepTitle title={`Ready, ${f.name.trim()}`} body="Here is what gluciq will use. Everything can be changed in Profile." />
            <Card padding={0}>
              <View style={styles.inset}>
                <ListRow label="Target" value={`${f.target} ${f.unit}`} />
                <ListRow label="Correction factor" value={`1 U : ${f.cf}`} />
                <ListRow
                  label="Carb ratios"
                  value={MEAL_TYPES.map((m) => f.ratios[m]).join(' · ')}
                  detail="Breakfast · lunch · dinner · late"
                />
                <ListRow label="Max bolus" value={`${f.max} U`} />
                <ListRow label="Measuring with" value={SOURCES.find((s) => s.value === f.source)?.label} last />
              </View>
            </Card>
            <Card style={styles.ackCard} padding={spacing.lg + 2}>
              <View style={styles.ackRow}>
                <View style={styles.flex}>
                  <Text variant="bodyStrong">Keep {again ? 'my history' : 'sample history'}</Text>
                  <Text variant="label" color="secondary">
                    {again
                      ? 'Keep everything logged so far. Turn off to start empty.'
                      : '90 days of example data so charts and insights have something to show. Turn off to start empty.'}
                  </Text>
                </View>
                <Switch
                  value={f.keepSample}
                  onValueChange={(v) => {
                    haptics.selection();
                    set('keepSample')(v);
                  }}
                  trackColor={{ false: colors.elevatedHigh, true: colors.green }}
                  thumbColor="#fff"
                  accessibilityLabel="Keep sample history"
                />
              </View>
            </Card>
          </View>
        ) : null}
      </Animated.View>
    </Screen>
  );
}

function StepTitle({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.stepTitle}>
      <Text variant="title">{title}</Text>
      <Text variant="callout" color="secondary">
        {body}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  progress: { flexDirection: 'row', gap: spacing.xs + 2, marginBottom: spacing.xxxl },
  dot: { flex: 1, height: 3, borderRadius: radius.pill, backgroundColor: colors.elevatedHigh },
  dotOn: { backgroundColor: colors.text },
  wordmark: { marginTop: spacing.xxxl },
  lead: { marginTop: spacing.md, marginBottom: spacing.xxxl, fontWeight: '400', color: colors.textSecondary },
  explore: { marginTop: spacing.xxl, paddingVertical: spacing.xs },
  stepTitle: { gap: spacing.sm, marginBottom: spacing.xxl },
  stack: { gap: spacing.md, marginTop: spacing.lg },
  row: { flexDirection: 'row', gap: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  half: { flexBasis: '47%', flexGrow: 1 },
  flex: { flex: 1 },
  section: { marginTop: spacing.xxl },
  note: { marginTop: spacing.md },
  sub: { marginBottom: spacing.md, marginTop: spacing.sm },
  ackCard: { marginTop: spacing.xxl },
  ackRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  inset: { paddingHorizontal: spacing.lg + 2 },
  footer: { flexDirection: 'row', gap: spacing.md },
  back: { paddingHorizontal: spacing.xl },
});
