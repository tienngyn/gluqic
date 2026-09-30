import { Minus, Plus } from 'lucide-react-native';
import { Platform, StyleSheet, TextInput, View, type TextStyle } from 'react-native';

import { sanitizeNumber } from '@/components/forms/NumberField';
import { Text } from '@/components/typography/Text';
import { PressableScale } from '@/components/ui/PressableScale';
import { colors, fontFamily, radius, spacing } from '@/constants/theme';
import { roundTo } from '@/domain/bolus/engine';

/** "You'll take" stepper under the suggestion. Editing never changes the calculation. */
export function DoseAdjuster({
  value,
  suggested,
  step,
  onChange,
}: {
  value: string;
  suggested: number;
  step: number;
  onChange: (v: string) => void;
}) {
  const n = Number(value);
  const valid = value.trim() !== '' && Number.isFinite(n);
  const delta = valid ? roundTo(n - suggested, 2) : 0;
  const nudge = (dir: 1 | -1) => {
    const base = valid ? n : suggested;
    onChange(String(Math.max(0, roundTo(base + dir * step, 2))));
  };

  return (
    <View style={styles.wrap}>
      <Text variant="label" color="secondary">
        You’ll take
      </Text>
      <View style={styles.row}>
        <StepButton label={`Minus ${step} units`} onPress={() => nudge(-1)} icon={<Minus size={18} color={colors.text} strokeWidth={2} />} />
        <View style={styles.valueBox}>
          <TextInput
            value={value}
            onChangeText={(t) => onChange(sanitizeNumber(t))}
            keyboardType="decimal-pad"
            inputMode="decimal"
            selectionColor={colors.text}
            accessibilityLabel="Units you'll take"
            style={styles.input}
          />
          <Text variant="body" color="secondary">
            U
          </Text>
        </View>
        <StepButton label={`Plus ${step} units`} onPress={() => nudge(1)} icon={<Plus size={18} color={colors.text} strokeWidth={2} />} />
      </View>
      {valid && delta !== 0 ? (
        <View style={styles.deltaRow}>
          <Text variant="label" color="orange">
            {delta > 0 ? '+' : '−'}
            {Math.abs(delta).toFixed(1)} U vs suggested
          </Text>
          <Text variant="label" color="secondary" accessibilityRole="button" onPress={() => onChange(suggested.toFixed(1))} style={styles.undo}>
            Use suggested
          </Text>
        </View>
      ) : (
        <Text variant="label" color="muted">
          Change it if you’ll take a different amount
        </Text>
      )}
    </View>
  );
}

function StepButton({ icon, onPress, label }: { icon: React.ReactNode; onPress: () => void; label: string }) {
  return (
    <PressableScale onPress={onPress} haptic="selection" scaleTo={0.9} accessibilityRole="button" accessibilityLabel={label} style={styles.step}>
      {icon}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  step: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.elevatedHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueBox: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
    minWidth: 120,
    justifyContent: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  input: {
    color: colors.text,
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '700',
    letterSpacing: -0.8,
    textAlign: 'center',
    width: 80,
    padding: 0,
    fontVariant: ['tabular-nums'],
    fontFamily: fontFamily.sans,
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as unknown as TextStyle) : null),
  },
  deltaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  undo: { textDecorationLine: 'underline' },
});
