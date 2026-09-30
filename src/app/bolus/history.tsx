import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/cards/Card';
import { Text } from '@/components/typography/Text';
import { BackHeader } from '@/components/ui/BackHeader';
import { Screen } from '@/components/ui/Screen';
import { colors, spacing } from '@/constants/theme';
import { useAppStore } from '@/store/useAppStore';
import { formatDay, formatGlucose, formatTime, MEAL_LABEL } from '@/utils/format';

export default function BolusHistory() {
  const history = useAppStore((s) => s.bolusHistory);
  const unit = useAppStore((s) => s.user.glucoseUnit);

  return (
    <Screen>
      <BackHeader />
      <Text variant="title" style={styles.title}>
        Calculations
      </Text>
      <Text variant="callout" color="secondary" style={styles.subtitle}>
        Every saved calculation keeps its inputs, result and engine version.
      </Text>

      <View style={styles.list}>
        {history.map((c) => {
          const taken = c.confirmedUnits ?? c.suggestedBolus;
          const differs = Math.abs(taken - c.suggestedBolus) >= 0.05;
          return (
            <Card key={c.id} padding={spacing.lg + 2}>
              <View style={styles.head}>
                <View>
                  <Text variant="label" color="secondary">
                    {formatDay(c.timestamp)} · {formatTime(c.timestamp)}
                  </Text>
                  <Text variant="bodyStrong" style={styles.meal}>
                    {MEAL_LABEL[c.mealType]} · {Math.round(c.carbs)} g
                  </Text>
                </View>
                <View style={styles.units}>
                  <Text variant="metricM">{taken.toFixed(1)}</Text>
                  <Text variant="label" color="secondary">
                    {' '}
                    U
                  </Text>
                </View>
              </View>
              <View style={styles.grid}>
                <Cell label="Glucose" value={`${formatGlucose(c.currentGlucose, unit)}`} />
                <Cell label="Meal" value={`${c.mealBolus.toFixed(1)}`} />
                <Cell label="Corr." value={`${c.correctionBolus >= 0 ? '+' : ''}${c.correctionBolus.toFixed(1)}`} />
                <Cell label="IOB" value={`${c.activeInsulinAdjustment.toFixed(1)}`} />
                <Cell label="Suggested" value={c.suggestedBolus.toFixed(1)} />
              </View>
              {differs ? (
                <Text variant="caption" color="orange" style={styles.note}>
                  Took {taken.toFixed(1)} U vs suggested {c.suggestedBolus.toFixed(1)} U
                </Text>
              ) : null}
              <Text variant="caption" color="muted" style={styles.note}>
                {c.calculationVersion}
              </Text>
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.cell}>
      <Text variant="caption" color="muted">
        {label}
      </Text>
      <Text variant="callout" tabular>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.xs },
  subtitle: { marginBottom: spacing.xxl },
  list: { gap: spacing.md },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  meal: { marginTop: 2 },
  units: { flexDirection: 'row', alignItems: 'baseline' },
  grid: {
    flexDirection: 'row',
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  cell: { flex: 1, gap: 2 },
  note: { marginTop: spacing.sm },
});
