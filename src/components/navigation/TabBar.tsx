import { BlurView } from 'expo-blur';
import type { TabListProps, TabTriggerSlotProps } from 'expo-router/ui';
import { ChartSpline, House, UserRound, Utensils, type LucideIcon } from 'lucide-react-native';
import { forwardRef } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/typography/Text';
import { colors, radius, spacing } from '@/constants/theme';
import { haptics } from '@/utils/haptics';

/** Floating, glass pill that hosts the tab triggers. */
export function FloatingTabBar({ children, style, ...rest }: TabListProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      {...rest}
      pointerEvents="box-none"
      style={[styles.container, { paddingBottom: Math.max(insets.bottom - 6, spacing.lg) }, style]}>
      <View style={styles.pill}>
        {Platform.OS === 'web' ? (
          <View style={[StyleSheet.absoluteFill, styles.webGlass]} />
        ) : (
          <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        )}
        <View style={[StyleSheet.absoluteFill, styles.tint]} />
        {children}
      </View>
    </View>
  );
}

export const TAB_ICONS: Record<string, LucideIcon> = {
  home: House,
  food: Utensils,
  insights: ChartSpline,
  profile: UserRound,
};

type TabButtonProps = TabTriggerSlotProps & { icon: LucideIcon; label: string };

export const TabButton = forwardRef<View, TabButtonProps>(function TabButton(
  { icon: Icon, label, isFocused, onPress, ...rest },
  ref,
) {
  return (
    <Pressable
      ref={ref}
      {...rest}
      onPress={(e) => {
        if (!isFocused) haptics.selection();
        onPress?.(e);
      }}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: isFocused }}
      style={styles.tab}>
      <Icon size={22} strokeWidth={isFocused ? 2 : 1.6} color={isFocused ? colors.text : colors.textMuted} />
      <Text variant="caption" color={isFocused ? 'primary' : 'muted'} style={styles.tabLabel}>
        {label}
      </Text>
    </Pressable>
  );
});

/** The elevated centre action. */
export const BolusTabButton = forwardRef<View, TabTriggerSlotProps>(function BolusTabButton(
  { isFocused, onPress, ...rest },
  ref,
) {
  return (
    <Pressable
      ref={ref}
      {...rest}
      onPress={(e) => {
        haptics.medium();
        onPress?.(e);
      }}
      accessibilityRole="tab"
      accessibilityLabel="Bolus"
      accessibilityState={{ selected: isFocused }}
      style={styles.centerSlot}>
      <View style={[styles.centerButton, isFocused && styles.centerButtonActive]}>
        <BolusGlyph color={isFocused ? '#000' : colors.text} />
      </View>
    </Pressable>
  );
});

/** Abstract "sum" mark — deliberately not a syringe or drop. */
function BolusGlyph({ color }: { color: string }) {
  return (
    <View style={styles.glyph}>
      <View style={[styles.glyphBar, { backgroundColor: color, width: 18 }]} />
      <View style={[styles.glyphBar, { backgroundColor: color, width: 12 }]} />
      <View style={[styles.glyphBar, { backgroundColor: color, width: 6 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 68,
    width: '100%',
    maxWidth: 420,
    borderRadius: radius.pill,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 10 } },
      android: { elevation: 12 },
      default: { boxShadow: '0 12px 40px rgba(0,0,0,0.55)' },
    }),
  },
  webGlass: {
    backgroundColor: 'rgba(20,20,20,0.7)',
    // @ts-expect-error web-only
    backdropFilter: 'blur(24px) saturate(160%)',
  },
  tint: { backgroundColor: 'rgba(17,17,17,0.55)' },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, height: '100%' },
  tabLabel: { fontSize: 10, letterSpacing: 0.2 },
  centerSlot: { flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%' },
  centerButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.elevatedHigh,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  centerButtonActive: { backgroundColor: colors.text, borderColor: colors.text },
  glyph: { gap: 3.5, alignItems: 'center' },
  glyphBar: { height: 2.5, borderRadius: 2 },
});
