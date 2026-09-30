import { Redirect } from 'expo-router';
import { TabList, Tabs, TabSlot, TabTrigger } from 'expo-router/ui';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';

import { BolusTabButton, FloatingTabBar, TAB_ICONS, TabButton } from '@/components/navigation/TabBar';
import { colors } from '@/constants/theme';
import { useNow } from '@/hooks/useDerived';
import { useAppStore } from '@/store/useAppStore';
import { SHARE_POLL_MIN, useDexcomShare } from '@/store/useDexcomShare';

export default function TabLayout() {
  const onboarded = useAppStore((s) => s.onboarded);
  const releaseDelayedSensor = useAppStore((s) => s.releaseDelayedSensor);
  const now = useNow();
  // Prototype: delayed sensor readings "arrive" once they are old enough.
  useEffect(() => {
    releaseDelayedSensor(now);
  }, [now, releaseDelayedSensor]);

  // Dexcom Share: reconnect with saved credentials, then poll every 5 minutes.
  const restoreShare = useDexcomShare((s) => s.restore);
  const syncShare = useDexcomShare((s) => s.sync);
  const shareStatus = useDexcomShare((s) => s.status);
  const lastShareSync = useDexcomShare((s) => s.lastSyncAt);
  useEffect(() => {
    void restoreShare();
  }, [restoreShare]);
  useEffect(() => {
    if (shareStatus !== 'connected' && shareStatus !== 'demo') return;
    if (!lastShareSync || now.getTime() - new Date(lastShareSync).getTime() >= SHARE_POLL_MIN * 60000) void syncShare(now);
  }, [now, shareStatus, lastShareSync, syncShare]);

  if (!onboarded) return <Redirect href="/onboarding" />;
  return (
    <Tabs style={styles.root}>
      <TabSlot style={styles.slot} />
      <TabList asChild>
        <FloatingTabBar>
          <TabTrigger name="index" href="/" asChild>
            <TabButton icon={TAB_ICONS.home} label="Home" />
          </TabTrigger>
          <TabTrigger name="food" href="/food" asChild>
            <TabButton icon={TAB_ICONS.food} label="Food" />
          </TabTrigger>
          <TabTrigger name="bolus" href="/bolus" asChild>
            <BolusTabButton />
          </TabTrigger>
          <TabTrigger name="insights" href="/insights" asChild>
            <TabButton icon={TAB_ICONS.insights} label="Insights" />
          </TabTrigger>
          <TabTrigger name="profile" href="/profile" asChild>
            <TabButton icon={TAB_ICONS.profile} label="Profile" />
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
