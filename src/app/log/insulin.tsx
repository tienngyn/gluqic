import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { NumberField, parseNumber, TextField } from '@/components/forms/NumberField';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Screen, Section } from '@/components/ui/Screen';
import { ChipGroup } from '@/components/ui/SegmentedControl';
import { SheetHeader } from '@/components/ui/SheetHeader';
import { spacing } from '@/constants/theme';
import { timestampFor, WhenPicker, type WhenOffset } from '@/features/logging/WhenPicker';
import { useActiveInsulin, useNow } from '@/hooks/useDerived';
import { useAppStore } from '@/store/useAppStore';
import { haptics } from '@/utils/haptics';

type Kind = 'rapid' | 'long';

export default function LogInsulin() {
  const now = useNow();
  const addInsulin = useAppStore((s) => s.addInsulin);
  const maxBolus = useAppStore((s) => s.insulinProfile.maxBolus);
  const iob = useActiveInsulin(now);
  const [units, setUnits] = useState('');
  const [kind, setKind] = useState<Kind>('rapid');
  const [when, setWhen] = useState<WhenOffset>('0');
  const [note, setNote] = useState('');

  const u = parseNumber(units);
  const error = u == null ? undefined : u <= 0 ? 'Enter more than 0 U' : u > 100 ? 'At most 100 U' : undefined;
  const aboveMax = kind === 'rapid' && u != null && !error && u > maxBolus;

  const save = () => {
    if (u == null || error) return;
    addInsulin({ units: u, insulinType: kind, timestamp: timestampFor(when), source: 'manual', note: note.trim() || undefined });
    haptics.success();
    router.back();
  };

  return (
    <Screen modal footer={<Button label="Save dose" onPress={save} disabled={u == null || !!error} />}>
      <SheetHeader title="Log insulin" subtitle={`${iob.toFixed(1)} U currently active`} />
      <NumberField size="l" label="Units" unit="U" value={units} onChangeText={setUnits} error={error} autoFocus />
      {aboveMax ? <Banner tone="caution" message={`More than your max bolus of ${maxBolus} U. Double-check before saving.`} /> : null}
      <Section title="Type" style={styles.section}>
        <ChipGroup<Kind>
          value={kind}
          onChange={setKind}
          options={[
            { value: 'rapid', label: 'Rapid / meal' },
            { value: 'long', label: 'Long-acting' },
          ]}
        />
      </Section>
      <Section title="When" style={styles.section}>
        <WhenPicker value={when} onChange={setWhen} />
      </Section>
      <Section style={styles.section}>
        <TextField label="Note" value={note} onChangeText={setNote} placeholder="Optional" />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({ section: { marginTop: spacing.xxl } });
