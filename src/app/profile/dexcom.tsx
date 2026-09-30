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
import { formatGlucose, relativeTime } from '@/utils/format';
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
          <Button label="Disconnect" variant="secondary" onPress={() => void share.disconnect()} />
        ) : (
          <Button label={share.status === 'connecting' ? 'Connecting…' : 'Connect'} onPress={() => void onConnect()} disabled={!canConnect} />
        )
      }>
      <BackHeader />
      <Text variant="title">Dexcom Share</Text>
      <Text variant="callout" color="secondary" style={styles.lead}>
        Live glucose every 5 minutes, straight from Dexcom — no typing, no 3-hour Apple Health delay.
      </Text>

      {live ? (
        <Card padding={0}>
          <View style={styles.inset}>
            <ListRow label="Status" value={share.status === 'demo' ? 'Demo (simulated)' : 'Connected'} />
            <ListRow label="Account" value={share.username} />
            <ListRow
              label="Latest value"
              value={latest ? `${formatGlucose(latest.value, unit)} ${unit} · ${relativeTime(latest.timestamp, now)}` : '—'}
            />
            <ListRow label="Last sync" value={share.lastSyncAt ? relativeTime(share.lastSyncAt, now) : '—'} last />
          </View>
        </Card>
      ) : (
        <View style={styles.stack}>
          <Text variant="label" color="secondary">
            Dexcom account region
          </Text>
          <ChipGroup<ShareRegion>
            value={region}
            onChange={setRegion}
            options={(Object.keys(SHARE_REGIONS) as ShareRegion[]).map((r) => ({ value: r, label: SHARE_REGIONS[r].label }))}
          />
          <TextField label="Dexcom username, email or phone" value={username} onChangeText={setUsername} autoComplete="username" />
          <TextField label="Dexcom password" value={password} onChangeText={setPassword} secure autoComplete="password" />
        </View>
      )}

      {share.error ? (
        <View style={styles.banner}>
          <Banner tone={share.status === 'error' ? 'critical' : 'caution'} message={share.error} />
        </View>
      ) : null}

      {!shareSupported && !live ? (
        <View style={styles.banner}>
          <Banner
            tone="info"
            title="In the browser"
            message="Live Share works in the gluciq iPhone app. Here you can try how it feels with simulated values."
          />
          <Button label="Try with simulated values" variant="secondary" size="m" style={styles.demo} onPress={share.startDemo} />
        </View>
      ) : null}

      <Section title="Before you connect">
        <View style={styles.notes}>
          <Text variant="label" color="secondary">
            • In the Dexcom app, turn on Share and invite at least one follower (it can be yourself on another account).
          </Text>
          <Text variant="label" color="secondary">
            • Your password is stored only in this phone’s keychain and sent only to Dexcom’s server.
          </Text>
          <Text variant="label" color="secondary">
            • Share is not an official Dexcom API for apps like this one. Dexcom can change it at any time; gluciq then falls back to
            typed values and Apple Health.
          </Text>
        </View>
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  lead: { marginTop: spacing.sm, marginBottom: spacing.xl },
  inset: { paddingHorizontal: spacing.lg + 2 },
  stack: { gap: spacing.md },
  banner: { marginTop: spacing.lg, gap: spacing.md },
  demo: { alignSelf: 'flex-start' },
  notes: { gap: spacing.sm },
});
