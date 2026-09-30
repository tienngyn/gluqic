import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Switch, View } from 'react-native';

import { Card } from '@/components/cards/Card';
import { Text } from '@/components/typography/Text';
import { BackHeader } from '@/components/ui/BackHeader';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Screen, Section } from '@/components/ui/Screen';
import { colors, spacing } from '@/constants/theme';
import { health, HEALTH_PERMISSIONS, type HealthDataType, type HealthStatus } from '@/services/healthkit';
import { haptics } from '@/utils/haptics';

export default function AppleHealth() {
  const [status, setStatus] = useState<HealthStatus>('not-determined');
  const [enabled, setEnabled] = useState<Record<HealthDataType, boolean>>(
    () => Object.fromEntries(HEALTH_PERMISSIONS.map((p) => [p.type, true])) as Record<HealthDataType, boolean>,
  );

  useEffect(() => {
    void health.status().then(setStatus);
  }, []);

  const connect = async () => {
    const types = HEALTH_PERMISSIONS.filter((p) => enabled[p.type]).map((p) => p.type);
    setStatus(await health.requestAuthorization(types));
  };

  return (
    <Screen footer={<Button label={status === 'authorized' ? 'Connected' : 'Connect Apple Health'} onPress={connect} disabled={status === 'authorized'} />}>
      <BackHeader />
      <Text variant="title">Apple Health</Text>
      <Text variant="callout" color="secondary" style={styles.lead}>
        gluciq asks only for what it uses. Here is exactly what it reads and writes. You can change this any time in the
        Health app.
      </Text>
      {status === 'unavailable' ? (
        <Banner
          tone="info"
          message={
            Platform.OS === 'ios'
              ? 'Apple Health needs a development build of gluciq. This preview uses sample data instead.'
              : 'Apple Health is available on iPhone. This preview uses sample data instead.'
          }
        />
      ) : null}

      <Section title="Data types">
        <Card padding={0}>
          {HEALTH_PERMISSIONS.map((p, i) => (
            <View key={p.type} style={[styles.row, i < HEALTH_PERMISSIONS.length - 1 && styles.divider]}>
              <View style={styles.text}>
                <Text variant="body">{p.label}</Text>
                <Text variant="label" color="muted">
                  {p.why}
                </Text>
                <View style={styles.tags}>
                  {p.read ? <Tag label="Read" /> : null}
                  {p.write ? <Tag label="Write" /> : null}
                </View>
              </View>
              <Switch
                value={enabled[p.type]}
                onValueChange={(v) => {
                  haptics.selection();
                  setEnabled((e) => ({ ...e, [p.type]: v }));
                }}
                trackColor={{ false: colors.elevatedHigh, true: colors.green }}
                thumbColor="#fff"
                accessibilityLabel={`${p.label} access`}
              />
            </View>
          ))}
        </Card>
      </Section>
    </Screen>
  );
}

function Tag({ label }: { label: string }) {
  return (
    <View style={styles.tag}>
      <Text variant="caption" color="secondary">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  lead: { marginTop: spacing.sm, marginBottom: spacing.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg + 2 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSubtle },
  text: { flex: 1, gap: 2 },
  tags: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm },
  tag: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: 6, backgroundColor: colors.elevated },
});
