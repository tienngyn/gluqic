import { Redirect } from 'expo-router';
import { TabList, Tabs, TabSlot, TabTrigger } from 'expo-router/ui';
import { StyleSheet } from 'react-native';

import { BolusTabButton, FloatingTabBar, TAB_ICONS, TabButton } from '@/components/navigation/TabBar';
import { colors } from '@/constants/theme';
import { useAppStore } from '@/store/useAppStore';

export default function TabLayout() {
  const onboarded = useAppStore((s) => s.onboarded);
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
