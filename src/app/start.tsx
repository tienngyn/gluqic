import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/typography/Text';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { spacing } from '@/constants/theme';
import { useAppStore } from '@/store/useAppStore';
import type { GlucoseUnit } from '@/types/models';

const STEPS = [
  ['Eintragen', 'Vor dem Essen: Blutzucker, Kohlenhydrate und deine NovoRapid-Einheiten. Spritz ruhig weiter nach Gefühl.'],
  ['Auswerten', 'Nach ca. 3 h schaut gluciq mit deinen Dexcom-Werten, ob du wieder beim Startwert bist.'],
  ['Dein System', 'Aus den Mahlzeiten, die gepasst haben, entsteht dein KE-Faktor – morgens, mittags, abends. Dazu Korrektur und ein Tresiba-Check.'],
];

export default function StartScreen() {
  const startObservation = useAppStore((s) => s.startObservation);
  const [unit, setUnit] = useState<GlucoseUnit>('mg/dL');

  const start = (keepSampleData: boolean) => {
    startObservation({ glucoseUnit: unit, keepSampleData });
    router.replace('/');
  };

  return (
    <Screen
      footer={
        <View style={styles.footer}>
          <Button label="Los geht’s" onPress={() => start(false)} />
          <Button label="Erst mit Beispieldaten ansehen" variant="ghost" size="m" onPress={() => start(true)} />
        </View>
      }>
      <Text variant="title" style={styles.title}>
        Vom Bauchgefühl zum System
      </Text>
      <Text variant="callout" color="secondary">
        gluciq findet heraus, nach welchem System du spritzt – und welches bei dir funktioniert.
      </Text>

      <View style={styles.steps}>
        {STEPS.map(([title, body], i) => (
          <View key={title} style={styles.step}>
            <Text variant="metricM" color="muted" style={styles.num}>
              {i + 1}
            </Text>
            <View style={styles.flex}>
              <Text variant="bodyStrong">{title}</Text>
              <Text variant="label" color="secondary">
                {body}
              </Text>
            </View>
          </View>
        ))}
      </View>

      <Text variant="label" color="secondary" style={styles.unitLabel}>
        Deine Blutzucker-Einheit
      </Text>
      <SegmentedControl
        value={unit}
        onChange={setUnit}
        segments={[
          { value: 'mg/dL', label: 'mg/dL' },
          { value: 'mmol/L', label: 'mmol/L' },
        ]}
      />

      <Text variant="caption" color="muted" style={styles.note}>
        Prototyp, nicht ärztlich geprüft. gluciq beschreibt deine Daten – besprich deinen Faktor mit deinem Diabetologen, bevor du
        danach spritzt.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: spacing.xxxl, marginBottom: spacing.sm },
  steps: { gap: spacing.xl, marginTop: spacing.xxxl },
  step: { flexDirection: 'row', gap: spacing.lg },
  num: { width: 24 },
  flex: { flex: 1, gap: 2 },
  unitLabel: { marginTop: spacing.xxxl, marginBottom: spacing.sm },
  note: { marginTop: spacing.xl },
  footer: { gap: spacing.xs },
});
