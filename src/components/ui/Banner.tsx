import { Info, OctagonAlert, TriangleAlert } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/typography/Text';
import { colors, radius, spacing } from '@/constants/theme';

export type BannerTone = 'info' | 'caution' | 'critical';

const toneStyle: Record<BannerTone, { bg: string; fg: string; Icon: typeof Info }> = {
  info: { bg: colors.elevated, fg: colors.textSecondary, Icon: Info },
  caution: { bg: colors.orangeSoft, fg: colors.orange, Icon: TriangleAlert },
  critical: { bg: colors.redSoft, fg: colors.red, Icon: OctagonAlert },
};

export function Banner({ tone = 'info', title, message }: { tone?: BannerTone; title?: string; message: string }) {
  const t = toneStyle[tone];
  return (
    <View style={[styles.wrap, { backgroundColor: t.bg }]} accessibilityRole="alert">
      <t.Icon size={16} color={t.fg} strokeWidth={2} style={styles.icon} />
      <View style={styles.text}>
        {title ? (
          <Text variant="label" style={{ color: tone === 'info' ? colors.text : t.fg, fontWeight: '600' }}>
            {title}
          </Text>
        ) : null}
        <Text variant="label" color={tone === 'info' ? 'secondary' : 'primary'}>
          {message}
        </Text>
      </View>
    </View>
  );
}

/** Persistent label for anything touching insulin math. */
export function PrototypeBadge() {
  return (
    <View style={styles.badge}>
      <Text variant="overline" color="orange">
        Prototype
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: spacing.sm + 2,
    padding: spacing.md + 2,
    borderRadius: radius.md,
  },
  icon: { marginTop: 1 },
  text: { flex: 1, gap: 2 },
  badge: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.orangeSoft,
    alignSelf: 'flex-start',
  },
});
