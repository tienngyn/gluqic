import { Sparkles } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Card } from '@/components/cards/Card';
import { Text } from '@/components/typography/Text';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { colors, spacing } from '@/constants/theme';
import type { SettingSuggestion } from '@/domain/insights/suggestions';
import { useAppStore } from '@/store/useAppStore';
import type { GlucoseUnit } from '@/types/models';
import { formatGlucose, MEAL_LABEL } from '@/utils/format';
import { haptics } from '@/utils/haptics';

function describe(s: SettingSuggestion, unit: GlucoseUnit) {
  if (s.kind === 'ratio' && s.mealType) {
    const meal = MEAL_LABEL[s.mealType];
    return {
      title: `Adjust ${meal.toLowerCase()} ratio?`,
      from: `1 U : ${s.current} g`,
      to: `1 U : ${s.proposed} g`,
      done: `${meal} ratio is now 1 U : ${s.proposed} g.`,
    };
  }
  return {
    title: 'Adjust correction factor?',
    from: `1 U : ${formatGlucose(s.current, unit)}`,
    to: `1 U : ${formatGlucose(s.proposed, unit)}`,
    done: `Correction factor is now 1 U : ${formatGlucose(s.proposed, unit)} ${unit}.`,
  };
}

/** A learned setting change the user can accept with one tap. */
export function SuggestionCard({ suggestion }: { suggestion: SettingSuggestion }) {
  const unit = useAppStore((s) => s.user.glucoseUnit);
  const accept = useAppStore((s) => s.acceptSuggestion);
  const dismiss = useAppStore((s) => s.dismissSuggestion);
  const [accepted, setAccepted] = useState<string | null>(null);
  const d = describe(suggestion, unit);
  const pct = Math.round(Math.abs(suggestion.insulinChange) * 100);

  if (accepted) {
    return (
      <Animated.View entering={FadeIn.duration(250)}>
        <Banner tone="info" title="Updated" message={`${accepted} Learning continues from here — Reset any time on the Bolus tab.`} />
      </Animated.View>
    );
  }

  return (
    <Card variant="elevated" padding={spacing.lg + 2}>
      <View style={styles.head}>
        <Sparkles size={16} color={colors.text} strokeWidth={1.75} />
        <Text variant="bodyStrong">{d.title}</Text>
      </View>
      <View style={styles.change}>
        <Text variant="callout" color="secondary" tabular>
          {d.from}
        </Text>
        <Text variant="callout" color="secondary">
          →
        </Text>
        <Text variant="headline" tabular>
          {d.to}
        </Text>
      </View>
      <Text variant="label" color={suggestion.direction === 'less' ? 'green' : 'orange'}>
        {pct}% {suggestion.direction} insulin {suggestion.kind === 'ratio' ? 'per gram of carbs' : 'per correction'}
      </Text>
      <View style={styles.reasons}>
        {suggestion.reasons.map((r) => (
          <Text key={r} variant="label" color="secondary">
            {r}
          </Text>
        ))}
        <Text variant="caption" color="muted">
          {suggestion.basis} Changes are at most 10% at a time.
        </Text>
      </View>
      <View style={styles.actions}>
        <Button
          size="m"
          label="Use it"
          style={styles.flex}
          onPress={() => {
            accept(suggestion);
            haptics.success();
            setAccepted(d.done);
          }}
        />
        <Button size="m" label="Not now" variant="secondary" style={styles.flex} onPress={() => dismiss(suggestion.key)} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  change: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.xs },
  reasons: { gap: spacing.xs, marginTop: spacing.md },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  flex: { flex: 1 },
});
