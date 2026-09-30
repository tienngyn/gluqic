import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/typography/Text';
import { colors, spacing, toneColor } from '@/constants/theme';
import type { Insight } from '@/types/models';

import { Card } from './Card';

export function InsightCard({ insight, compact, onPress }: { insight: Insight; compact?: boolean; onPress?: () => void }) {
  return (
    <Card onPress={onPress} padding={compact ? spacing.lg + 2 : spacing.xl}>
      <View style={styles.header}>
        <View style={[styles.dot, { backgroundColor: toneColor[insight.tone] }]} />
        <Text variant="overline" color="secondary">
          {insight.title}
        </Text>
      </View>
      <Text variant={compact ? 'callout' : 'body'} style={styles.body}>
        {insight.body}
      </Text>
      {insight.suggestion ? (
        <View style={styles.suggestion}>
          <Text variant="label" color="secondary">
            {insight.suggestion}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  dot: { width: 6, height: 6, borderRadius: 3 },
  body: { marginTop: spacing.xxs },
  suggestion: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
});
