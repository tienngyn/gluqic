import { zodResolver } from '@hookform/resolvers/zod';
import { router, useFocusEffect } from 'expo-router';
import { History } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';

import { NumberField, parseNumber } from '@/components/forms/NumberField';
import { Text } from '@/components/typography/Text';
import { Banner, PrototypeBadge } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Screen, Section } from '@/components/ui/Screen';
import { ChipGroup } from '@/components/ui/SegmentedControl';
import { IconButton } from '@/components/ui/SheetHeader';
import { colors, spacing } from '@/constants/theme';
import { resolveCarbRatio, suggestMealType } from '@/domain/bolus/carbRatio';
import { calculateBolus, type PlannedActivity } from '@/domain/bolus/engine';
import { proposeCorrectionSetpoint, proposeSetpoint } from '@/domain/bolus/setpoint';
import { findSimilarMeals, summarizeOutcomes } from '@/domain/insights/similarMeals';
import { BolusResultCard } from '@/features/bolus/BolusResultCard';
import { DoseAdjuster } from '@/features/bolus/DoseAdjuster';
import { SetpointCard } from '@/features/bolus/SetpointCard';
import { SuggestionCard } from '@/features/insights/SuggestionCard';
import { bolusFormSchema, mapEngineErrors, type BolusFormValues } from '@/features/bolus/form';
import {
  useActiveCorrectionSetpoint,
  useActiveInsulin,
  useActiveSetpoint,
  useBolusEvents,
  useCurrentGlucose,
  useNow,
  useSuggestions,
} from '@/hooks/useDerived';
import { useAppStore } from '@/store/useAppStore';
import type { GlucoseTrend, MealType } from '@/types/models';
import { formatDay, formatGlucose, formatTime, fromDisplayGlucose, MEAL_LABEL, MEAL_TYPES, relativeTime, toDisplayGlucose, TREND_META } from '@/utils/format';
import { haptics } from '@/utils/haptics';

const ACTIVITY: { value: PlannedActivity; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'light', label: 'Light' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'hard', label: 'Hard' },
];

export default function BolusScreen() {
  const now = useNow();
  const profile = useAppStore((s) => s.insulinProfile);
  const unit = useAppStore((s) => s.user.glucoseUnit);
  const range = useAppStore((s) => s.range);
  const draft = useAppStore((s) => s.bolusDraft);
  const lastSaved = useAppStore((s) => s.bolusHistory.find((b) => b.id === s.lastSavedBolusId));
  const setPendingBolus = useAppStore((s) => s.setPendingBolus);
  const { latest, trend, fresh } = useCurrentGlucose(now);
  const iob = useActiveInsulin(now);
  const events = useBolusEvents();

  const defaults = useMemo<BolusFormValues>(
    () => ({
      // Only a fresh sensor value may stand in for "current" glucose.
      glucose: latest && fresh ? String(toDisplayGlucose(latest.value, unit)) : '',
      carbs: draft ? String(Math.round(draft.carbs)) : '',
      activeInsulin: iob.toFixed(1),
      target: String(toDisplayGlucose(profile.targetGlucose, unit)),
      mealType: draft?.mealType ?? suggestMealType(profile.carbRatios, now),
      activity: 'none',
      trend: fresh ? trend : undefined,
    }),
    // Defaults are captured when the screen gains focus, not on every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [latest?.id, fresh, draft, unit, profile.targetGlucose],
  );

  const { control, reset, handleSubmit, formState } = useForm<BolusFormValues>({
    defaultValues: defaults,
    resolver: zodResolver(bolusFormSchema),
    mode: 'onChange',
  });

  const [override, setOverride] = useState<{ base: number; value: string } | null>(null);
  const [makeSetpoint, setMakeSetpoint] = useState(false);

  useFocusEffect(
    useCallback(() => {
      reset(defaults);
      setOverride(null);
      setMakeSetpoint(false);
    }, [defaults, reset]),
  );

  const values = useWatch({ control });
  const mealType = (values.mealType ?? 'breakfast') as MealType;
  const ratio = resolveCarbRatio(profile.carbRatios, { mealType, at: now });
  const setpoint = useActiveSetpoint(mealType);
  const resetSetpoint = useAppStore((s) => s.resetSetpoint);
  const correctionSetpoint = useActiveCorrectionSetpoint();
  const resetCorrectionSetpoint = useAppStore((s) => s.resetCorrectionSetpoint);
  // Show the learned suggestion that applies to what is being calculated right now.
  const suggestions = useSuggestions(now);
  const correctionOnly = (values.carbs ?? '').trim() === '0';
  const suggestion = correctionOnly
    ? suggestions.find((s) => s.kind === 'correction')
    : (suggestions.find((s) => s.kind === 'ratio' && s.mealType === mealType) ??
      suggestions.find((s) => s.kind === 'correction'));

  const result = useMemo(() => {
    const glucose = parseNumber(values.glucose ?? '');
    const target = parseNumber(values.target ?? '');
    return calculateBolus(
      {
        currentGlucose: glucose == null ? undefined : fromDisplayGlucose(glucose, unit),
        targetGlucose: target == null ? undefined : fromDisplayGlucose(target, unit),
        carbsGrams: parseNumber(values.carbs ?? ''),
        carbRatio: ratio?.gramsPerUnit,
        correctionFactor: profile.correctionFactor,
        activeInsulin: parseNumber(values.activeInsulin ?? ''),
      },
      {
        maxBolus: profile.maxBolus,
        minGlucoseForBolus: profile.minGlucoseForBolus,
        doseIncrement: profile.doseIncrement,
        highGlucoseCaution: 250,
      },
      { trend: values.trend, plannedActivity: values.activity },
    );
  }, [values, unit, ratio, profile]);

  const similar = useMemo(() => {
    if (!result.ok) return undefined;
    const matches = findSimilarMeals(
      {
        mealType,
        carbs: result.input.carbsGrams,
        minuteOfDay: now.getHours() * 60 + now.getMinutes(),
        glucoseBefore: result.input.currentGlucose,
      },
      // Only meals since the setpoint reflect the ratio in use now.
      setpoint ? events.filter((e) => e.timestamp >= setpoint.createdAt) : events,
      { threshold: 0.72, limit: 12 },
    );
    return summarizeOutcomes(
      matches.map((m) => m.event),
      range,
    );
  }, [result, mealType, events, now, range, setpoint]);

  const engineErrors = result.ok ? {} : mapEngineErrors(result.errors);
  const fieldError = (name: keyof typeof engineErrors) => {
    const touched = formState.dirtyFields[name] || formState.touchedFields[name];
    const current = values[name];
    if (!touched && !current) return undefined;
    return formState.errors[name]?.message ?? engineErrors[name];
  };

  // What the user will actually take. Keyed to the suggestion it was based
  // on, so a new calculation starts from the new suggestion again.
  const suggested = result.ok ? result.breakdown.suggestedBolus : null;
  const activeOverride = override && suggested != null && override.base === suggested ? override : null;
  const takeText = activeOverride ? activeOverride.value : suggested != null ? suggested.toFixed(1) : '';
  const take = parseNumber(takeText);
  const takeDiffers = suggested != null && take != null && Math.abs(take - suggested) >= 0.05;
  const takeOverMax = take != null && take > profile.maxBolus;
  const proposal =
    result.ok && result.input.carbsGrams > 0 && takeDiffers && take != null && ratio
      ? proposeSetpoint({
          unitsTaken: take,
          carbs: result.input.carbsGrams,
          correctionBolus: result.breakdown.correctionBolus,
          activeInsulin: result.input.activeInsulin,
          currentGramsPerUnit: ratio.gramsPerUnit,
        })
      : null;
  const correctionProposal =
    result.ok && result.input.carbsGrams === 0 && takeDiffers && take != null
      ? proposeCorrectionSetpoint({
          unitsTaken: take,
          currentGlucose: result.input.currentGlucose,
          targetGlucose: result.input.targetGlucose,
          activeInsulin: result.input.activeInsulin,
          currentFactor: profile.correctionFactor,
        })
      : null;
  const setpointReady = makeSetpoint && !!(proposal?.ok || correctionProposal?.ok);

  // The calculation uses the latest reading as-is (fresh and unchanged).
  const usesLatest = !!latest && fresh && values.glucose === String(toDisplayGlucose(latest.value, unit));

  const onReview = handleSubmit(() => {
    if (!result.ok || !ratio || take == null || takeOverMax) return;
    haptics.light();
    setPendingBolus({
      currentGlucose: result.input.currentGlucose,
      targetGlucose: result.input.targetGlucose,
      carbs: result.input.carbsGrams,
      carbRatio: result.input.carbRatio,
      correctionFactor: result.input.correctionFactor,
      activeInsulin: result.input.activeInsulin,
      mealType,
      mealBolus: result.breakdown.mealBolus,
      correctionBolus: result.breakdown.correctionBolus,
      activeInsulinAdjustment: result.breakdown.activeInsulinAdjustment,
      suggestedBolus: result.breakdown.suggestedBolus,
      warnings: result.warnings.map((w) => w.message),
      calculationVersion: result.version,
      timestamp: new Date().toISOString(),
      plannedUnits: takeDiffers ? take : undefined,
      plannedSetpoint: takeDiffers && setpointReady,
      logGlucose: !usesLatest,
      // Reusing a value typed in earlier: link that reading instead of adding another.
      glucoseReadingId: usesLatest && latest?.source === 'manual' ? latest.id : undefined,
    });
    router.push('/bolus/confirm');
  });

  const recentlySaved = lastSaved && now.getTime() - new Date(lastSaved.timestamp).getTime() < 10 * 60000;

  return (
    <Screen
      tabBar
      title="Bolus"
      right={
        <IconButton
          label="Calculation history"
          icon={<History size={18} color={colors.text} strokeWidth={1.75} />}
          onPress={() => router.push('/bolus/history')}
        />
      }>
      <View style={styles.badgeRow}>
        <PrototypeBadge />
        <Text variant="caption" color="muted" style={styles.badgeText}>
          Not medical advice. Always check with your care plan.
        </Text>
      </View>

      {recentlySaved ? (
        <View style={styles.saved}>
          <Banner
            tone="info"
            title="Saved"
            message={`${(lastSaved.confirmedUnits ?? lastSaved.suggestedBolus).toFixed(1)} U logged at ${formatTime(lastSaved.timestamp)}.`}
          />
        </View>
      ) : null}

      <View style={styles.row}>
        <Controller
          control={control}
          name="glucose"
          render={({ field }) => (
            <NumberField
              size="l"
              style={styles.flex}
              label="Current glucose"
              unit={unit}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              decimal={unit === 'mmol/L'}
              error={fieldError('glucose')}
              hint={
                latest && fresh
                  ? field.value === String(toDisplayGlucose(latest.value, unit))
                    ? latest.source === 'manual'
                      ? `Typed in ${relativeTime(latest.timestamp, now)}`
                      : `Sensor · ${relativeTime(latest.timestamp, now)} ${TREND_META[trend].arrow}`
                    : 'Entered by you · matched to sensor data when it arrives'
                  : latest
                    ? `Last sensor value is from ${relativeTime(latest.timestamp, now)}. Enter the current value from your CGM app.`
                    : 'Enter the current value from your CGM app or meter.'
              }
            />
          )}
        />
      </View>
      {!fresh ? (
        <View style={styles.trendRow}>
          <Text variant="label" color="secondary">
            Trend in your CGM app (optional)
          </Text>
          <Controller
            control={control}
            name="trend"
            render={({ field }) => (
              <ChipGroup<GlucoseTrend>
                value={field.value}
                onChange={(v) => field.onChange(field.value === v ? undefined : v)}
                options={[
                  { value: 'rising', label: '↗ Rising' },
                  { value: 'stable', label: '→ Stable' },
                  { value: 'falling', label: '↘ Falling' },
                ]}
              />
            )}
          />
        </View>
      ) : null}
      <View style={styles.row}>
        <Controller
          control={control}
          name="carbs"
          render={({ field }) => (
            <NumberField
              size="l"
              style={styles.flex}
              label="Carbs"
              unit="g"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldError('carbs')}
              hint={
                draft && draft.carbs > 0
                  ? `From ${draft.source}`
                  : field.value.trim() === '0'
                    ? 'Correction only — saved as a correction'
                    : 'Enter 0 for a correction without food'
              }
            />
          )}
        />
      </View>

      <Section title="Meal" style={styles.sectionTight}>
        <Controller
          control={control}
          name="mealType"
          render={({ field }) => (
            <ChipGroup<MealType>
              value={field.value}
              onChange={field.onChange}
              options={MEAL_TYPES.map((m) => ({ value: m, label: MEAL_LABEL[m] }))}
            />
          )}
        />
        {setpoint && ratio ? (
          <View style={styles.setpoint}>
            <View style={styles.setpointText}>
              <Text variant="label">
                Your setpoint · 1 U : {ratio.gramsPerUnit} g
              </Text>
              <Text variant="caption" color="muted">
                Set {formatDay(setpoint.createdAt, now).replace(/^(Today|Yesterday)$/, (d) => d.toLowerCase())} · was 1 U : {setpoint.previousGramsPerUnit} g
              </Text>
            </View>
            <Text
              variant="label"
              color="secondary"
              accessibilityRole="button"
              onPress={() => {
                haptics.light();
                resetSetpoint(setpoint.id);
              }}
              style={styles.reset}>
              Reset
            </Text>
          </View>
        ) : (
          <Text variant="label" color="muted" style={styles.ratio}>
            {ratio ? `Carb ratio 1 U : ${ratio.gramsPerUnit} g · ${ratio.label}` : 'No carb ratio set for this meal.'}
          </Text>
        )}
      </Section>

      {suggestion ? (
        <View style={styles.suggestion}>
          <SuggestionCard key={suggestion.key} suggestion={suggestion} />
        </View>
      ) : null}

      <View style={[styles.row, styles.sectionTight]}>
        <Controller
          control={control}
          name="activeInsulin"
          render={({ field }) => (
            <NumberField
              style={styles.flex}
              label="Active insulin"
              unit="U"
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={fieldError('activeInsulin')}
              hint="Estimated from recent doses"
            />
          )}
        />
        <Controller
          control={control}
          name="target"
          render={({ field }) => (
            <NumberField
              style={styles.flex}
              label="Target"
              unit={unit}
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              decimal={unit === 'mmol/L'}
              error={fieldError('target')}
              hint="From your profile"
            />
          )}
        />
      </View>
      {correctionSetpoint ? (
        <View style={[styles.setpoint, styles.correctionSetpoint]}>
          <View style={styles.setpointText}>
            <Text variant="label">
              Correction setpoint · 1 U : {formatGlucose(profile.correctionFactor, unit)} {unit}
            </Text>
            <Text variant="caption" color="muted">
              Set {formatDay(correctionSetpoint.createdAt, now).replace(/^(Today|Yesterday)$/, (d) => d.toLowerCase())} · was 1 U :{' '}
              {formatGlucose(correctionSetpoint.previousFactor, unit)}
            </Text>
          </View>
          <Text
            variant="label"
            color="secondary"
            accessibilityRole="button"
            accessibilityLabel="Reset correction setpoint"
            onPress={() => {
              haptics.light();
              resetCorrectionSetpoint(correctionSetpoint.id);
            }}
            style={styles.reset}>
            Reset
          </Text>
        </View>
      ) : null}

      <Section title="Planned activity" style={styles.sectionTight}>
        <Controller
          control={control}
          name="activity"
          render={({ field }) => <ChipGroup<PlannedActivity> value={field.value} onChange={field.onChange} options={ACTIVITY} />}
        />
      </Section>

      <View style={styles.result}>
        <BolusResultCard
          result={result.ok ? result : null}
          mealType={mealType}
          unit={unit}
          similar={similar}
          setpointSince={setpoint ? formatDay(setpoint.createdAt, now) : undefined}
          correctionSetpoint={!!correctionSetpoint}
          adjuster={
            result.ok && !result.blocked && suggested != null ? (
              <DoseAdjuster
                value={takeText}
                suggested={suggested}
                step={profile.doseIncrement}
                onChange={(value) => setOverride({ base: suggested, value })}
              />
            ) : null
          }
          afterCard={
            takeOverMax ? (
              <Banner tone="critical" message={`Above your max bolus of ${profile.maxBolus} U.`} />
            ) : proposal && ratio ? (
              <SetpointCard
                title={`Use as ${MEAL_LABEL[mealType].toLowerCase()} setpoint`}
                summary={
                  proposal.ok
                    ? `Next ${MEAL_LABEL[mealType].toLowerCase()}s are calculated with 1 U : ${proposal.gramsPerUnit} g instead of 1 U : ${ratio.gramsPerUnit} g. gluciq tracks how they go from here.`
                    : ''
                }
                proposal={proposal}
                value={makeSetpoint}
                onChange={setMakeSetpoint}
              />
            ) : correctionProposal ? (
              <SetpointCard
                title="Use as correction setpoint"
                summary={
                  correctionProposal.ok
                    ? `Corrections are calculated with 1 U : ${formatGlucose(correctionProposal.factor, unit)} instead of 1 U : ${formatGlucose(profile.correctionFactor, unit)} ${unit} — also the correction part of meal boluses. gluciq tracks how they go from here.`
                    : ''
                }
                proposal={correctionProposal}
                value={makeSetpoint}
                onChange={setMakeSetpoint}
              />
            ) : null
          }
        />
      </View>

      <Button
        label={takeDiffers && take != null ? `Review ${take.toFixed(1)} U${setpointReady ? ' + setpoint' : ''}` : 'Review & save'}
        onPress={onReview}
        disabled={!result.ok || !ratio || take == null || takeOverMax}
        style={styles.cta}
      />
      <Text variant="caption" color="muted" align="center" style={styles.footnote}>
        You confirm the amount before anything is saved. gluciq never changes your settings on its own.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: -spacing.md, marginBottom: spacing.xl },
  badgeText: { flex: 1 },
  saved: { marginBottom: spacing.lg },
  row: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  trendRow: { gap: spacing.sm, marginBottom: spacing.lg },
  flex: { flex: 1 },
  sectionTight: { marginTop: spacing.xl },
  ratio: { marginTop: spacing.md },
  suggestion: { marginTop: spacing.lg },
  setpoint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md + 2,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  setpointText: { flex: 1, gap: 2 },
  correctionSetpoint: { marginTop: 0, marginBottom: spacing.md },
  reset: { paddingVertical: 4, paddingLeft: 8 },
  result: { marginTop: spacing.xxxl },
  cta: { marginTop: spacing.xxxl },
  footnote: { marginTop: spacing.md, paddingHorizontal: spacing.xl },
});
