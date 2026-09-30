import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { PressableScale } from '@/components/ui/PressableScale';
import { colors, radius, spacing } from '@/constants/theme';

export type CardProps = {
  children: ReactNode;
  variant?: 'default' | 'elevated' | 'outline';
  padding?: number;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
};

export function Card({ children, variant = 'default', padding = spacing.xl, style, onPress, accessibilityLabel }: CardProps) {
  const body = [styles.base, styles[variant], { padding }, style];
  if (onPress) {
    return (
      <PressableScale onPress={onPress} style={body} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
        {children}
      </PressableScale>
    );
  }
  return <View style={body}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  default: {
    backgroundColor: colors.card,
    borderColor: colors.borderSubtle,
  },
  elevated: {
    backgroundColor: colors.elevated,
    borderColor: colors.border,
  },
  outline: {
    backgroundColor: 'transparent',
    borderColor: colors.border,
  },
});
