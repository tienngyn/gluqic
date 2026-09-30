import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/typography/Text';
import { colors, layout, spacing } from '@/constants/theme';

export type ScreenProps = {
  children: ReactNode;
  /** Large page title, e.g. "Nutrition". */
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  /** Adds bottom clearance for the floating tab bar. */
  tabBar?: boolean;
  /** For modal sheets: less top inset. */
  modal?: boolean;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  footer?: ReactNode;
};

export function Screen({
  children,
  title,
  subtitle,
  right,
  tabBar = false,
  modal = false,
  scroll = true,
  contentStyle,
  footer,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const top = modal ? spacing.xl : insets.top + spacing.md;
  const bottom = (tabBar ? layout.tabBarClearance : spacing.xxxl) + (modal ? insets.bottom : insets.bottom / 2);

  const header = title ? (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <Text variant="title" accessibilityRole="header">
          {title}
        </Text>
        {subtitle ? (
          <Text variant="callout" color="secondary" style={styles.subtitle}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  ) : null;

  const content = (
    <View style={[styles.inner, contentStyle]}>
      {header}
      {children}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={modal ? 0 : insets.top}>
      {scroll ? (
        <ScrollView
          style={styles.root}
          contentContainerStyle={{ paddingTop: top, paddingBottom: bottom }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive">
          {content}
        </ScrollView>
      ) : (
        <View style={[styles.root, { paddingTop: top }]}>{content}</View>
      )}
      {footer ? <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>{footer}</View> : null}
    </KeyboardAvoidingView>
  );
}

export function Section({
  title,
  action,
  children,
  style,
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.section, style]}>
      {title ? (
        <View style={styles.sectionHeader}>
          <Text variant="headline">{title}</Text>
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  inner: {
    paddingHorizontal: layout.screenPadding,
    width: '100%',
    maxWidth: layout.maxContentWidth,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.xxl,
    gap: spacing.md,
  },
  headerText: { flex: 1 },
  subtitle: { marginTop: spacing.xs },
  section: { marginTop: spacing.xxxl },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  footer: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
    width: '100%',
    maxWidth: layout.maxContentWidth + layout.screenPadding * 2,
    alignSelf: 'center',
  },
});
