import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/typography/Text';
import { colors, radius, spacing } from '@/constants/theme';

import { PressableScale } from './PressableScale';

export type Segment<T extends string> = { value: T; label: string };

export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  size = 'm',
}: {
  segments: Segment<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: 's' | 'm';
}) {
  return (
    <View style={styles.wrap} accessibilityRole="tablist">
      {segments.map((s) => {
        const active = s.value === value;
        return (
          <PressableScale
            key={s.value}
            haptic="selection"
            scaleTo={0.95}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(s.value)}
            style={[styles.segment, size === 's' && styles.segmentSmall, active && styles.active]}>
            <Text variant="label" color={active ? 'inverse' : 'secondary'} style={active && styles.activeText}>
              {s.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

/** Horizontally wrapping chips for single choice. */
export function ChipGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Segment<T>[];
  value: T | undefined;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <PressableScale
            key={o.value}
            haptic="selection"
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.chip, active && styles.chipActive]}>
            <Text variant="label" color={active ? 'inverse' : 'secondary'} style={active && styles.activeText}>
              {o.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    padding: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.pill,
  },
  segmentSmall: { paddingVertical: spacing.xs + 2 },
  active: { backgroundColor: colors.text },
  activeText: { fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 1,
    borderRadius: radius.pill,
    backgroundColor: colors.elevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  chipActive: { backgroundColor: colors.text, borderColor: colors.text },
});
