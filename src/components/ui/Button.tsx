import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/typography/Text';
import { colors, radius, spacing } from '@/constants/theme';

import { PressableScale } from './PressableScale';

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: ReactNode;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  size?: 'm' | 'l';
};

export function Button({ label, onPress, variant = 'primary', icon, disabled, style, size = 'l' }: ButtonProps) {
  return (
    <PressableScale
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      haptic={variant === 'primary' ? 'medium' : 'light'}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={[styles.base, size === 'm' && styles.medium, styles[variant], disabled && styles.disabled, style]}>
      <View style={styles.content}>
        {icon}
        <Text variant="bodyStrong" color={variant === 'primary' ? 'inverse' : variant === 'danger' ? 'red' : 'primary'}>
          {label}
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
  },
  medium: { height: 44, paddingHorizontal: spacing.xl },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  primary: { backgroundColor: colors.text },
  secondary: { backgroundColor: colors.elevated, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  ghost: { backgroundColor: 'transparent' },
  danger: { backgroundColor: colors.redSoft },
  disabled: { opacity: 0.35 },
});
