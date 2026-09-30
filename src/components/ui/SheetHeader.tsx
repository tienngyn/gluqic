import { router } from 'expo-router';
import { X } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/typography/Text';
import { colors, spacing } from '@/constants/theme';

import { PressableScale } from './PressableScale';

export function IconButton({
  icon,
  onPress,
  label,
  size = 40,
}: {
  icon: React.ReactNode;
  onPress: () => void;
  label: string;
  size?: number;
}) {
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      scaleTo={0.9}
      style={[styles.iconButton, { width: size, height: size, borderRadius: size / 2 }]}>
      {icon}
    </PressableScale>
  );
}

/** Title row for modal sheets, with a close button. */
export function SheetHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.text}>
        <Text variant="headline">{title}</Text>
        {subtitle ? (
          <Text variant="label" color="secondary">
            {subtitle}
          </Text>
        ) : null}
      </View>
      <IconButton
        icon={<X size={18} color={colors.text} strokeWidth={2} />}
        label="Close"
        size={34}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xxl },
  text: { flex: 1, gap: 2 },
  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.elevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
});
