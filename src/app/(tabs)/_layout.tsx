import { Redirect } from 'expo-router';
import { TabList, Tabs, TabSlot, TabTrigger } from 'expo-router/ui';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { ChartSpline, PenLine } from 'lucide-react-native';

import { FloatingTabBar, TabButton } from '@/components/navigation/TabBar';
import { colors } from '@/constants/theme';
import { useNow } from '@/hooks/useDerived';
import { useAppStore, useHydrated } from '@/store/useAppStore';
import { SHARE_POLL_MIN, useDexcomShare } from '@/store/useDexcomShare';

export default function TabLayout() {
  const hydrated = useHydrated();
  const onboarded = useAppStore((s) => s.onboarded);
  const releaseDelayedSensor = useAppStore((s) => s.releaseDelayedSensor);
  const now = useNow();
  // Prototype: delayed sensor readings "arrive" once they are old enough.
  useEffect(() => {
    if (hydrated) releaseDelayedSensor(now);
  }, [hydrated, now, releaseDelayedSensor]);

  // Dexcom Share: reconnect with saved credentials, then poll every 5 minutes.
  const restoreShare = useDexcomShare((s) => s.restore);
  const syncShare = useDexcomShare((s) => s.sync);
  const shareStatus = useDexcomShare((s) => s.status);
  const lastShareSync = useDexcomShare((s) => s.lastSyncAt);
  useEffect(() => {
    if (hydrated) void restoreShare();
  }, [hydrated, restoreShare]);
  useEffect(() => {
    if (!hydrated || (shareStatus !== 'connected' && shareStatus !== 'demo')) return;
    if (!lastShareSync || now.getTime() - new Date(lastShareSync).getTime() >= SHARE_POLL_MIN * 60000) void syncShare(now);
  }, [hydrated, now, shareStatus, lastShareSync, syncShare]);

  // Saved data is still loading: show the plain background, not setup or sample data.
  if (!hydrated) return <View style={styles.root} />;
  if (!onboarded) return <Redirect href="/start" />;
  return (
    <Tabs style={styles.root}>
      <TabSlot style={styles.slot} />
      <TabList asChild>
        <FloatingTabBar>
          <TabTrigger name="index" href="/" asChild>
            <TabButton icon={PenLine} label="Eintragen" />
          </TabTrigger>
          <TabTrigger name="system" href="/system" asChild>
            <TabButton icon={ChartSpline} label="System" />
          </TabTrigger>
        </FloatingTabBar>
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  slot: { flex: 1 },
});
