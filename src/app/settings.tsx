import { router } from 'expo-router';
import { Activity, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/cards/Card';
import { Text } from '@/components/typography/Text';
import { BackHeader } from '@/components/ui/BackHeader';
import { ListRow } from '@/components/ui/ListRow';
import { Screen, Section } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { colors, spacing } from '@/constants/theme';
import { useAppStore } from '@/store/useAppStore';
import { useDexcomShare } from '@/store/useDexcomShare';
import type { GlucoseUnit } from '@/types/models';

export default function SettingsScreen() {
  const unit = useAppStore((s) => s.user.glucoseUnit);
  const updateProfile = useAppStore((s) => s.updateProfile);
  const eraseAllData = useAppStore((s) => s.eraseAllData);
  const shareStatus = useDexcomShare((s) => s.status);
  const disconnectShare = useDexcomShare((s) => s.disconnect);

  // Two taps: the first arms, the second deletes. Disarms itself after a few seconds.
  const [confirmErase, setConfirmErase] = useState(false);
  useEffect(() => {
    if (!confirmErase) return;
    const t = setTimeout(() => setConfirmErase(false), 4000);
    return () => clearTimeout(t);
  }, [confirmErase]);
  const onErase = async () => {
    if (!confirmErase) return setConfirmErase(true);
    setConfirmErase(false);
    await disconnectShare();
    await eraseAllData();
    router.replace('/start');
  };

  const share =
    shareStatus === 'connected' ? 'Verbunden' : shareStatus === 'demo' ? 'Demo' : shareStatus === 'error' ? 'Fehler' : 'Nicht verbunden';

  return (
    <Screen>
      <BackHeader />
      <Text variant="title">Einstellungen</Text>

      <Section title="Blutzucker-Einheit">
        <SegmentedControl<GlucoseUnit>
          value={unit}
          onChange={(glucoseUnit) => updateProfile({ glucoseUnit })}
          segments={[
            { value: 'mg/dL', label: 'mg/dL' },
            { value: 'mmol/L', label: 'mmol/L' },
          ]}
        />
      </Section>

      <Section title="Daten">
        <Card padding={0}>
          <View style={styles.inset}>
            <ListRow
              icon={<Activity size={18} color={colors.textSecondary} strokeWidth={1.6} />}
              label="Dexcom Share"
              detail="Sensorwerte für die Auswertung"
              value={share}
              onPress={() => router.push('/dexcom')}
              chevron
            />
            <ListRow
              icon={<Trash2 size={18} color={confirmErase ? colors.red : colors.textSecondary} strokeWidth={1.6} />}
              label={confirmErase ? 'Nochmal tippen zum Löschen' : 'Alle Daten löschen'}
              detail={confirmErase ? 'Kann nicht rückgängig gemacht werden' : 'Löscht alle Einträge und trennt Dexcom Share'}
              onPress={() => void onErase()}
              chevron={false}
              last
            />
          </View>
        </Card>
      </Section>

      <Text variant="caption" color="muted" style={styles.note}>
        gluciq ist ein Prototyp und nicht ärztlich geprüft. Alle Daten bleiben auf diesem Gerät.
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  inset: { paddingHorizontal: spacing.lg + 2 },
  note: { marginTop: spacing.xxl },
});
