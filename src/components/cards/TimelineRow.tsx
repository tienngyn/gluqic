import { Activity, NotebookPen, Scale, Utensils, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Text, type TextColor } from '@/components/typography/Text';
import { colors, spacing } from '@/constants/theme';
import { classify, DEFAULT_RANGE } from '@/domain/glucose/stats';
import type { GlucoseUnit, TimelineEvent } from '@/types/models';
import { formatGlucose, formatTime, MEAL_LABEL, TREND_META } from '@/utils/format';

function describe(e: TimelineEvent, unit: GlucoseUnit): { title: string; detail?: string; color?: TextColor; Icon?: LucideIcon; glyph?: string } {
  switch (e.kind) {
    case 'glucose': {
      const c = classify(e.data.value, DEFAULT_RANGE);
      return {
        title: `${formatGlucose(e.data.value, unit)} ${unit}${e.data.trend ? ` ${TREND_META[e.data.trend].arrow}` : ''}`,
        detail: e.data.source === 'manual' ? (e.data.note ?? 'Logged') : undefined,
        color: c === 'low' ? 'red' : c === 'high' ? 'orange' : 'primary',
        glyph: '●',
      };
    }
    case 'meal':
      return {
        title: `${Math.round(e.data.carbs)} g carbs`,
        detail: `${e.data.name ?? MEAL_LABEL[e.data.mealType]} · ${e.data.calories} kcal`,
        Icon: Utensils,
      };
    case 'insulin':
      return {
        title: `${e.data.units} U ${e.data.insulinType === 'long' ? 'basal' : 'insulin'}`,
        detail: e.data.source === 'bolus-calculator' ? 'From bolus calculator' : undefined,
        glyph: '≡',
      };
    case 'activity':
      return {
        title: `${e.data.durationMin} min ${e.data.kind}`,
        detail: e.data.activeEnergyKcal ? `${e.data.activeEnergyKcal} kcal active` : undefined,
        Icon: Activity,
      };
    case 'weight':
      return { title: `${e.data.weightKg.toFixed(1)} kg`, detail: 'Weight', Icon: Scale };
    case 'note':
      return { title: e.data.text, Icon: NotebookPen };
  }
}

export function TimelineRow({ event, unit, last }: { event: TimelineEvent; unit: GlucoseUnit; last?: boolean }) {
  const d = describe(event, unit);
  return (
    <View style={styles.row}>
      <Text variant="label" color="muted" tabular style={styles.time}>
        {formatTime(event.timestamp)}
      </Text>
      <View style={styles.rail}>
        <View style={styles.node}>
          {d.Icon ? (
            <d.Icon size={13} color={colors.textSecondary} strokeWidth={1.75} />
          ) : (
            <Text variant="caption" color={d.color ?? 'secondary'} style={styles.glyph}>
              {d.glyph}
            </Text>
          )}
        </View>
        {!last ? <View style={styles.line} /> : null}
      </View>
      <View style={styles.body}>
        <Text variant="bodyStrong" color={d.color ?? 'primary'} tabular>
          {d.title}
        </Text>
        {d.detail ? (
          <Text variant="label" color="secondary" numberOfLines={1}>
            {d.detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', minHeight: 58 },
  time: { width: 48, paddingTop: 5 },
  rail: { width: 28, alignItems: 'center' },
  node: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.elevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  glyph: { fontSize: 11, lineHeight: 14 },
  line: { flex: 1, width: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 4 },
  body: { flex: 1, paddingLeft: spacing.md, paddingTop: 2, paddingBottom: spacing.lg, gap: 2 },
});
