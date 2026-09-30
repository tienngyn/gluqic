import { router } from 'expo-router';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { TimelineRow } from '@/components/cards/TimelineRow';
import { Text } from '@/components/typography/Text';
import { BackHeader } from '@/components/ui/BackHeader';
import { Screen } from '@/components/ui/Screen';
import { ChipGroup } from '@/components/ui/SegmentedControl';
import { IconButton } from '@/components/ui/SheetHeader';
import { colors, spacing } from '@/constants/theme';
import { describeMatch } from '@/features/glucose/matchText';
import { startOfDay, useManualMatches, useNow, useTimeline } from '@/hooks/useDerived';
import { useAppStore } from '@/store/useAppStore';
import type { TimelineEvent } from '@/types/models';
import { formatDay } from '@/utils/format';

type Filter = 'all' | TimelineEvent['kind'];

export default function Timeline() {
  const now = useNow();
  const unit = useAppStore((s) => s.user.glucoseUnit);
  const source = useAppStore((s) => s.user.glucoseSource);
  const matches = useManualMatches();
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');
  const day = useMemo(() => new Date(startOfDay(now).getTime() - offset * 86400000 + 12 * 3600000), [now, offset]);
  const events = useTimeline(day);
  const shown = filter === 'all' ? events : events.filter((e) => e.kind === filter);

  return (
    <Screen>
      <BackHeader right={<IconButton label="Log glucose" icon={<Plus size={18} color={colors.text} />} onPress={() => router.push('/log/glucose')} />} />
      <Text variant="title">Timeline</Text>
      <View style={styles.dayRow}>
        <IconButton label="Previous day" size={32} icon={<ChevronLeft size={16} color={colors.text} />} onPress={() => setOffset((o) => Math.min(89, o + 1))} />
        <Text variant="bodyStrong">{formatDay(day, now)}</Text>
        <IconButton
          label="Next day"
          size={32}
          icon={<ChevronRight size={16} color={offset === 0 ? colors.textMuted : colors.text} />}
          onPress={() => setOffset((o) => Math.max(0, o - 1))}
        />
      </View>
      <ChipGroup<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All' },
          { value: 'glucose', label: 'Glucose' },
          { value: 'meal', label: 'Meals' },
          { value: 'insulin', label: 'Insulin' },
          { value: 'activity', label: 'Activity' },
        ]}
      />
      <View style={styles.list}>
        {shown.length ? (
          shown.map((e, i) => (
            <TimelineRow
              key={e.id}
              event={e}
              unit={unit}
              last={i === shown.length - 1}
              note={e.kind === 'glucose' && e.data.source === 'manual' ? describeMatch(matches.get(e.id), unit, source) : undefined}
            />
          ))
        ) : (
          <Text variant="callout" color="secondary">
            Nothing logged.
          </Text>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  dayRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: spacing.lg },
  list: { marginTop: spacing.xxl },
});
