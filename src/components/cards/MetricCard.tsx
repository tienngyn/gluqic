import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text, type TextColor } from '@/components/typography/Text';
import { spacing } from '@/constants/theme';

import { Card } from './Card';

export type MetricCardProps = {
  label: string;
  value: string;
  unit?: string;
  footnote?: string;
  footnoteColor?: TextColor;
  valueColor?: TextColor;
  icon?: ReactNode;
  size?: 'm' | 'l';
  onPress?: () => void;
};

export function MetricCard({
  label,
  value,
  unit,
  footnote,
  footnoteColor = 'muted',
  valueColor = 'primary',
  icon,
  size = 'm',
  onPress,
}: MetricCardProps) {
  return (
    <Card style={styles.card} onPress={onPress} padding={spacing.lg + 2}>
      <View style={styles.header}>
        <Text variant="label" color="secondary">
          {label}
        </Text>
        {icon}
      </View>
      <View style={styles.valueRow}>
        <Text variant={size === 'l' ? 'metricL' : 'metricM'} color={valueColor}>
          {value}
        </Text>
        {unit ? (
          <Text variant="label" color="secondary" style={styles.unit}>
            {unit}
          </Text>
        ) : null}
      </View>
      {footnote ? (
        <Text variant="caption" color={footnoteColor} numberOfLines={1}>
          {footnote}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, minHeight: 120, justifyContent: 'space-between' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: spacing.lg, marginBottom: spacing.xs },
  unit: { marginLeft: spacing.xs },
});
