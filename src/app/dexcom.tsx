import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/cards/Card';
import { TextField } from '@/components/forms/NumberField';
import { Text } from '@/components/typography/Text';
import { BackHeader } from '@/components/ui/BackHeader';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { ListRow } from '@/components/ui/ListRow';
import { Screen, Section } from '@/components/ui/Screen';
import { ChipGroup } from '@/components/ui/SegmentedControl';
import { spacing } from '@/constants/theme';
import { useCurrentGlucose, useNow } from '@/hooks/useDerived';
import { SHARE_REGIONS, shareSupported, type ShareRegion } from '@/services/dexcomShare';
import { useAppStore } from '@/store/useAppStore';
import { useDexcomShare } from '@/store/useDexcomShare';
import { formatGlucose } from '@/utils/format';
import { dayText, timeText } from '@/utils/de';
import { haptics } from '@/utils/haptics';

export default function DexcomShareScreen() {
  const now = useNow();
  const share = useDexcomShare();
  const unit = useAppStore((s) => s.user.glucoseUnit);
  const { latest } = useCurrentGlucose(now);
  const [region, setRegion] = useState<ShareRegion>(share.region);
  const [username, setUsername] = useState(share.username ?? '');
  const [password, setPassword] = useState('');

  const live = share.status === 'connected' || share.status === 'demo';
  const canConnect = username.trim().length > 2 && password.length > 0 && share.status !== 'connecting';

  const onConnect = async () => {
    const ok = await share.connect({ region, username: username.trim(), password });
    if (ok) {
      setPassword('');
      haptics.success();
    } else {
      haptics.warning();
    }
  };

  return (
    <Screen
      footer={
        live ? (
          <Button label="Trennen" variant="secondary" onPress={() => void share.disconnect()} />
        ) : (
          <Button label={share.status === 'connecting' ? 'Verbinde …' : 'Verbinden'} onPress={() => void onConnect()} disabled={!canConnect} />
        )
      }>
      <BackHeader />
      <Text variant="title">Dexcom Share</Text>
      <Text variant="callout" color="secondary" style={styles.lead}>
        Deine Sensorwerte alle 5 Minuten direkt von Dexcom. Damit wertet gluciq deine Mahlzeiten automatisch aus.
      </Text>

      {live ? (
        <Card padding={0}>
          <View style={styles.inset}>
            <ListRow label="Status" value={share.status === 'demo' ? 'Demo (simuliert)' : 'Verbunden'} />
            <ListRow label="Konto" value={share.username} />
            <ListRow
              label="Letzter Wert"
              value={latest ? `${formatGlucose(latest.value, unit)} ${unit} · ${ago(latest.timestamp, now)}` : '—'}
            />
            <ListRow label="Zuletzt geladen" value={share.lastSyncAt ? ago(share.lastSyncAt, now) : '—'} last />
          </View>
        </Card>
      ) : (
        <View style={styles.stack}>
          <Text variant="label" color="secondary">
            Region deines Dexcom-Kontos
          </Text>
          <ChipGroup<ShareRegion>
            value={region}
            onChange={setRegion}
            options={(Object.keys(SHARE_REGIONS) as ShareRegion[]).map((r) => ({ value: r, label: SHARE_REGIONS[r].label }))}
          />
          <TextField label="Dexcom-Benutzername, E-Mail oder Telefon" value={username} onChangeText={setUsername} autoComplete="username" />
          <TextField label="Dexcom-Passwort" value={password} onChangeText={setPassword} secure autoComplete="password" />
        </View>
      )}

      {share.error ? (
        <View style={styles.banner}>
          <Banner tone={share.status === 'error' ? 'critical' : 'caution'} message={errorText(share.errorCode, share.error)} />
        </View>
      ) : null}

      {!shareSupported && !live ? (
        <View style={styles.banner}>
          <Banner
            tone="info"
            title="Im Browser"
            message="Dexcom Share funktioniert in der iPhone-App. Hier kannst du es mit simulierten Werten ausprobieren."
          />
          <Button label="Mit simulierten Werten testen" variant="secondary" size="m" style={styles.demo} onPress={share.startDemo} />
        </View>
      ) : null}

      <Section title="Bevor du verbindest">
        <View style={styles.notes}>
          <Text variant="label" color="secondary">
            • Schalte in der Dexcom-App „Teilen“ ein und lade mindestens einen Follower ein (das kannst auch du mit einer zweiten E-Mail sein).
          </Text>
          <Text variant="label" color="secondary">
            • Dein Passwort wird nur im Schlüsselbund dieses iPhones gespeichert und nur an Dexcom gesendet.
          </Text>
          <Text variant="label" color="secondary">
            • Share ist keine offizielle Schnittstelle für Apps wie diese. Dexcom kann sie jederzeit ändern – dann trägst du den Wert
            nach ca. 3 h einfach selbst ein.
          </Text>
        </View>
      </Section>
    </Screen>
  );
}

function ago(iso: string, now: Date): string {
  const mins = Math.round((now.getTime() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'gerade eben';
  if (mins < 60) return `vor ${mins} min`;
  return `${dayText(iso, now)}, ${timeText(iso)}`;
}

const ERRORS: Record<string, string> = {
  auth: 'Dexcom hat Benutzername oder Passwort nicht akzeptiert.',
  network: 'Dexcom ist nicht erreichbar. Prüf deine Verbindung.',
  session: 'Die Verbindung ist abgelaufen. Bitte neu verbinden.',
  blocked: 'Dexcom Share funktioniert nur in der iPhone-App, nicht im Browser.',
};

function errorText(code: string | undefined, fallback: string): string {
  return (code && ERRORS[code]) || fallback;
}

const styles = StyleSheet.create({
  lead: { marginTop: spacing.sm, marginBottom: spacing.xl },
  inset: { paddingHorizontal: spacing.lg + 2 },
  stack: { gap: spacing.md },
  banner: { marginTop: spacing.lg, gap: spacing.md },
  demo: { alignSelf: 'flex-start' },
  notes: { gap: spacing.sm },
});
