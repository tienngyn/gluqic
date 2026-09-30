import { StyleSheet, Switch, View } from 'react-native';

import { Card } from '@/components/cards/Card';
import { Text } from '@/components/typography/Text';
import { Banner } from '@/components/ui/Banner';
import { colors, spacing } from '@/constants/theme';
import type { SetpointProposal } from '@/domain/bolus/setpoint';
import { haptics } from '@/utils/haptics';

/** Offer to turn a changed dose into the setpoint for this meal type. */
export function SetpointCard({
  proposal,
  currentGramsPerUnit,
  mealLabel,
  value,
  onChange,
}: {
  proposal: SetpointProposal;
  currentGramsPerUnit: number;
  mealLabel: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Card variant="elevated" padding={spacing.lg + 2}>
      <View style={styles.head}>
        <View style={styles.text}>
          <Text variant="bodyStrong">Use as {mealLabel} setpoint</Text>
          <Text variant="label" color="secondary">
            {proposal.ok
              ? `Next ${mealLabel}s are calculated with 1 U : ${proposal.gramsPerUnit} g instead of 1 U : ${currentGramsPerUnit} g. gluciq tracks how they go from here.`
              : proposal.reason}
          </Text>
        </View>
        {proposal.ok ? (
          <Switch
            value={value}
            onValueChange={(v) => {
              haptics.selection();
              onChange(v);
            }}
            trackColor={{ false: colors.elevatedHigh, true: colors.green }}
            thumbColor="#fff"
            accessibilityLabel={`Use as ${mealLabel} setpoint`}
          />
        ) : null}
      </View>
      {proposal.ok && value ? (
        <View style={styles.steps}>
          {proposal.steps.map((st) => (
            <View key={st.label} style={styles.step}>
              <View style={styles.text}>
                <Text variant="callout">{st.label}</Text>
                <Text variant="caption" color="muted">
                  {st.formula}
                </Text>
              </View>
              <Text variant="bodyStrong" tabular>
                {st.value}
              </Text>
            </View>
          ))}
          {proposal.caution ? <Banner tone="caution" message={proposal.caution} /> : null}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  text: { flex: 1, gap: 2 },
  steps: {
    marginTop: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
});
