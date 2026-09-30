import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { Card } from '@/components/cards/Card';
import { Text } from '@/components/typography/Text';
import { Banner } from '@/components/ui/Banner';
import { colors, spacing } from '@/constants/theme';
import type { BolusResult } from '@/domain/bolus/engine';
import type { OutcomeSummary } from '@/domain/insights/similarMeals';
import type { GlucoseUnit, MealType } from '@/types/models';
import { formatGlucose, MEAL_LABEL } from '@/utils/format';

type Ok = Extract<BolusResult, { ok: true }>;

const signed = (n: number) => (n > 0 ? `+${n.toFixed(1)}` : n < 0 ? `−${Math.abs(n).toFixed(1)}` : '0.0');

export function BolusResultCard({
  result,
  mealType,
  unit,
  similar,
  setpointSince,
  adjuster,
  afterCard,
  correctionSetpoint,
}: {
  result: Ok | null;
  mealType: MealType;
  unit: GlucoseUnit;
  similar?: OutcomeSummary;
  /** Date label when the ratio comes from a user setpoint. */
  setpointSince?: string;
  /** Rendered under the suggested number, e.g. the "You'll take" stepper. */
  adjuster?: ReactNode;
  /** Rendered between the card and the explanation, e.g. the setpoint offer. */
  afterCard?: ReactNode;
  /** The correction factor comes from a user setpoint. */
  correctionSetpoint?: boolean;
}) {
  if (!result) {
    return (
      <Card style={styles.card}>
        <Text variant="label" color="secondary" align="center">
          Suggested
        </Text>
        <Text variant="metricXL" color="muted" align="center" style={styles.value}>
          —
        </Text>
        <Text variant="callout" color="muted" align="center">
          Enter glucose and carbs to see the calculation.
        </Text>
      </Card>
    );
  }

  const b = result.breakdown;
  const { input } = result;
  const differs = Math.abs(b.suggestedBolus - Math.max(0, b.rawTotal)) >= 0.05;
  const mealLabel = MEAL_LABEL[mealType].toLowerCase();

  return (
    <Animated.View entering={FadeIn.duration(300)} layout={LinearTransition.springify().damping(20)}>
      <Card style={styles.card} variant="elevated">
        <Text variant="label" color="secondary" align="center">
          {result.blocked ? 'No insulin suggested' : input.carbsGrams === 0 ? 'Suggested correction' : 'Suggested'}
        </Text>
        <View style={styles.valueRow} accessibilityLabel={`Suggested ${b.suggestedBolus.toFixed(1)} units`}>
          <Text variant="display" color={result.blocked ? 'red' : 'primary'}>
            {b.suggestedBolus.toFixed(1)}
          </Text>
          <Text variant="headline" color="secondary" style={styles.u}>
            U
          </Text>
        </View>

        {adjuster}

        <View style={styles.breakdown}>
          {result.steps.map((s) => (
            <View key={s.label} style={styles.line}>
              <View style={styles.lineLabel}>
                <Text variant="callout">{s.label}</Text>
                <Text variant="caption" color="muted" tabular>
                  {s.formula}
                </Text>
              </View>
              <Text variant="bodyStrong" tabular>
                {signed(s.value)} U
              </Text>
            </View>
          ))}
          <View style={[styles.line, styles.total]}>
            <Text variant="callout" color="secondary">
              {differs ? 'Calculated' : 'Total'}
            </Text>
            <Text variant="bodyStrong" tabular>
              {b.rawTotal.toFixed(2)} U
            </Text>
          </View>
          {differs ? (
            <View style={styles.line}>
              <Text variant="callout" color="secondary">
                After safety rules
              </Text>
              <Text variant="bodyStrong" tabular>
                {b.suggestedBolus.toFixed(1)} U
              </Text>
            </View>
          ) : null}
        </View>

        {result.warnings.length ? (
          <View style={styles.warnings}>
            {result.warnings.map((w) => (
              <Banner key={w.code} tone={w.severity} message={w.message} />
            ))}
          </View>
        ) : null}
      </Card>

      {afterCard ? <View style={styles.afterCard}>{afterCard}</View> : null}

      <View style={styles.why}>
        <Text variant="headline">Why this amount?</Text>
        <Text variant="callout" color="secondary" style={styles.whyBody}>
          {setpointSince ? `Your ${mealLabel} setpoint from ${setpointSince.replace(/^(Today|Yesterday)$/, (d) => d.toLowerCase())}` : `Your ${mealLabel} ratio`} covers{' '}
          {input.carbRatio} g per unit, and each unit lowers glucose about{' '}
          {formatGlucose(input.correctionFactor, unit)} {unit}
          {correctionSetpoint ? ' (your correction setpoint)' : ''}. You are{' '}
          {input.currentGlucose === input.targetGlucose ? 'at' : input.currentGlucose > input.targetGlucose ? 'above' : 'below'} your target of{' '}
          {formatGlucose(input.targetGlucose, unit)} {unit}, and {input.activeInsulin.toFixed(1)} U is still active.
        </Text>
        {similar && similar.withOutcome >= 3 ? (
          <Text variant="callout" color="secondary" style={styles.whyBody}>
            {similar.count} similar {mealLabel}s{setpointSince ? ' since your setpoint' : ''} were analyzed. Two hours later glucose was in range after{' '}
            {similar.inRangeAt2h} and ran high after {similar.aboveAt2h}
            {similar.corrected ? ` (${similar.corrected} needed a correction)` : ''}. This history is shown for context — it does
            not change the suggestion.
          </Text>
        ) : null}
        <Text variant="caption" color="muted" style={styles.version}>
          Deterministic calculation · {result.version}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: spacing.xxl },
  value: { marginVertical: spacing.md },
  valueRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', marginTop: spacing.xs },
  u: { marginLeft: spacing.xs, marginBottom: spacing.md },
  breakdown: {
    marginTop: spacing.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm },
  lineLabel: { gap: 1 },
  total: {
    marginTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
    paddingTop: spacing.md,
  },
  warnings: { gap: spacing.sm, marginTop: spacing.lg },
  afterCard: { marginTop: spacing.md },
  why: { marginTop: spacing.xxl, gap: spacing.sm },
  whyBody: { lineHeight: 22 },
  version: { marginTop: spacing.xs },
});
