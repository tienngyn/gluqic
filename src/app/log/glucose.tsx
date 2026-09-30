import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { z } from 'zod';

import { NumberField, parseNumber, TextField } from '@/components/forms/NumberField';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Screen, Section } from '@/components/ui/Screen';
import { ChipGroup } from '@/components/ui/SegmentedControl';
import { SheetHeader } from '@/components/ui/SheetHeader';
import { spacing } from '@/constants/theme';
import { timestampFor, WhenPicker, type WhenOffset } from '@/features/logging/WhenPicker';
import { useAppStore } from '@/store/useAppStore';
import type { GlucoseContext } from '@/types/models';
import { fromDisplayGlucose } from '@/utils/format';
import { haptics } from '@/utils/haptics';

const CONTEXTS: { value: GlucoseContext; label: string }[] = [
  { value: 'fasting', label: 'Fasting' },
  { value: 'before-meal', label: 'Before meal' },
  { value: 'after-meal', label: 'After meal' },
  { value: 'before-exercise', label: 'Before exercise' },
  { value: 'after-exercise', label: 'After exercise' },
  { value: 'bedtime', label: 'Bedtime' },
  { value: 'other', label: 'Other' },
];

const schema = z.number().min(20, 'At least 20 mg/dL').max(600, 'At most 600 mg/dL');

export default function LogGlucose() {
  const unit = useAppStore((s) => s.user.glucoseUnit);
  const low = useAppStore((s) => s.range.low);
  const addGlucose = useAppStore((s) => s.addGlucose);
  const [value, setValue] = useState('');
  const [when, setWhen] = useState<WhenOffset>('0');
  const [context, setContext] = useState<GlucoseContext>('before-meal');
  const [note, setNote] = useState('');

  const raw = parseNumber(value);
  const mgdl = raw == null ? undefined : fromDisplayGlucose(raw, unit);
  const check = mgdl == null ? undefined : schema.safeParse(mgdl);
  const error = check && !check.success ? check.error.issues[0].message : undefined;
  const isLow = mgdl != null && !error && mgdl < low;

  const save = () => {
    if (mgdl == null || error) return;
    addGlucose({ value: mgdl, timestamp: timestampFor(when), context, note: note.trim() || undefined, source: 'manual' });
    haptics.success();
    router.back();
  };

  return (
    <Screen modal footer={<Button label="Save reading" onPress={save} disabled={mgdl == null || !!error} />}>
      <SheetHeader title="Log glucose" />
      <NumberField size="l" label="Glucose" unit={unit} value={value} onChangeText={setValue} decimal={unit === 'mmol/L'} error={error} autoFocus />
      {isLow ? (
        <Banner tone="critical" title="Low glucose" message="Treat the low according to your care plan and re-check." />
      ) : null}
      <Section title="When" style={styles.section}>
        <WhenPicker value={when} onChange={setWhen} />
      </Section>
      <Section title="Context" style={styles.section}>
        <ChipGroup<GlucoseContext> value={context} onChange={setContext} options={CONTEXTS} />
      </Section>
      <Section style={styles.section}>
        <TextField label="Note" value={note} onChangeText={setNote} placeholder="Optional" multiline />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({ section: { marginTop: spacing.xxl } });
