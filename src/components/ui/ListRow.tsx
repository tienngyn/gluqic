import { ChevronRight } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/typography/Text';
import { colors, spacing } from '@/constants/theme';

import { PressableScale } from './PressableScale';

export type ListRowProps = {
  label: string;
  detail?: string;
  value?: string;
  valueMuted?: boolean;
  icon?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  last?: boolean;
  chevron?: boolean;
};

export function ListRow({ label, detail, value, valueMuted, icon, right, onPress, last, chevron }: ListRowProps) {
  const body = (
    <View style={[styles.row, !last && styles.divider]}>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <View style={styles.text}>
        <Text variant="body">{label}</Text>
        {detail ? (
          <Text variant="label" color="muted" style={styles.detail}>
            {detail}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text variant="body" color={valueMuted ? 'muted' : 'secondary'} tabular>
          {value}
        </Text>
      ) : null}
      {right}
      {chevron ?? !!onPress ? <ChevronRight size={18} color={colors.textMuted} strokeWidth={1.75} /> : null}
    </View>
  );
  if (!onPress) return body;
  return (
    <PressableScale onPress={onPress} scaleTo={0.985} haptic="selection" accessibilityRole="button">
      {body}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.lg - 2,
    minHeight: 56,
  },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSubtle },
  icon: { width: 28, alignItems: 'center' },
  text: { flex: 1 },
  detail: { marginTop: 2 },
});
