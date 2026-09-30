import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/constants/theme';

import { IconButton } from './SheetHeader';

/** Back button row for pushed (non-tab) screens. */
export function BackHeader({ right }: { right?: ReactNode }) {
  return (
    <View style={styles.row}>
      <IconButton
        label="Back"
        icon={<ChevronLeft size={20} color={colors.text} strokeWidth={2} />}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      />
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
});
