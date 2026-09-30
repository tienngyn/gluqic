import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated';

import { Text } from '@/components/typography/Text';
import { colors, spacing } from '@/constants/theme';

export function ProgressBar({ progress, color = colors.text, height = 4 }: { progress: number; color?: string; height?: number }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.set(withTiming(Math.max(0, Math.min(1, progress)), { duration: 700, easing: Easing.out(Easing.cubic) }));
  }, [progress, p]);
  const style = useAnimatedStyle(() => ({ width: `${p.get() * 100}%` }));
  return (
    <View style={[styles.track, { height, borderRadius: height }]}>
      <Animated.View style={[styles.fill, { backgroundColor: color, borderRadius: height }, style]} />
    </View>
  );
}

export function MacroRow({
  label,
  current,
  target,
  unit = 'g',
}: {
  label: string;
  current: number;
  target: number;
  unit?: string;
}) {
  const over = current > target;
  return (
    <View style={styles.row}>
      <View style={styles.rowHeader}>
        <Text variant="callout" color="secondary">
          {label}
        </Text>
        <Text variant="callout" tabular>
          {Math.round(current)}
          <Text variant="callout" color="muted" tabular>
            {' '}
            / {Math.round(target)} {unit}
          </Text>
        </Text>
      </View>
      <ProgressBar progress={target ? current / target : 0} color={over ? colors.orange : colors.text} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: '100%', backgroundColor: colors.elevatedHigh, overflow: 'hidden' },
  fill: { height: '100%' },
  row: { gap: spacing.sm },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
});
