import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { NumberField, parseNumber } from '@/components/forms/NumberField';
import { Text } from '@/components/typography/Text';
import { Button } from '@/components/ui/Button';
import { PressableScale } from '@/components/ui/PressableScale';
import { Screen, Section } from '@/components/ui/Screen';
import { ChipGroup, SegmentedControl } from '@/components/ui/SegmentedControl';
import { colors, radius, spacing } from '@/constants/theme';
import { classifyDose } from '@/domain/insulin/purpose';
import { slotFor, type MealSample } from '@/domain/system/analyze';
import { OUTCOME } from '@/features/system/outcome';
import { useNow, useSystemAnalysis } from '@/hooks/useDerived';
import { useAppStore } from '@/store/useAppStore';
import type { MealType } from '@/types/models';
import { dayText, num, timeText } from '@/utils/de';
import { formatGlucose, fromDisplayGlucose } from '@/utils/format';
import { haptics } from '@/utils/haptics';

type When = '0' | '15' | '30' | '60';
const WHEN: { value: When; label: string }[] = [
  { value: '0', label: 'Jetzt' },
  { value: '15', label: '−15 min' },
  { value: '30', label: '−30 min' },
  { value: '60', label: '−1 h' },
];

const MEAL_TYPE: Record<ReturnType<typeof slotFor>, MealType> = {
  morning: 'breakfast',
  midday: 'lunch',
  evening: 'dinner',
  late: 'snack',
};

type Entry = {
  timestamp: string;
  glucose?: number;
  carbs?: number;
  weighed?: boolean;
  units?: number;
  correction?: boolean;
  sample?: MealSample;
};

export default function EntryScreen() {
  const now = useNow();
  const unit = useAppStore((s) => s.user.glucoseUnit);
  const addGlucose = useAppStore((s) => s.addGlucose);
  const addInsulin = useAppStore((s) => s.addInsulin);
  const logMealItems = useAppStore((s) => s.logMealItems);
  const deleteEntry = useAppStore((s) => s.deleteEntry);
  const glucose = useAppStore((s) => s.glucose);
  const meals = useAppStore((s) => s.meals);
  const insulin = useAppStore((s) => s.insulin);
  const analysis = useSystemAnalysis(now);

  const [bg, setBg] = useState('');
  const [carbs, setCarbs] = useState('');
  const [units, setUnits] = useState('');
  const [weighed, setWeighed] = useState<'estimated' | 'weighed'>('estimated');
  const [when, setWhen] = useState<When>('0');
  const [saved, setSaved] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2500);
    return () => clearTimeout(t);
  }, [saved]);

  const bgValue = parseNumber(bg);
  const carbValue = parseNumber(carbs);
  const unitValue = parseNumber(units);
  const bgMgdl = bgValue != null ? fromDisplayGlucose(bgValue, unit) : undefined;
  const bgInvalid = bgMgdl != null && (bgMgdl < 20 || bgMgdl > 600);
  const unitsInvalid = unitValue != null && unitValue > 50;
  const carbsInvalid = carbValue != null && carbValue > 400;
  const hasAny = !!bgMgdl || !!carbValue || !!unitValue;
  const canSave = hasAny && !bgInvalid && !unitsInvalid && !carbsInvalid;

  const hint = !hasAny
    ? null
    : carbValue && !unitValue
      ? 'Ohne Einheiten wird es nur als Mahlzeit gespeichert.'
      : unitValue && !carbValue
        ? 'Ohne Kohlenhydrate zählt es als Korrektur.'
        : bgMgdl && !carbValue && !unitValue
          ? 'Nur ein Wert – z. B. ca. 3 h nach dem Essen, wenn Dexcom nicht verbunden ist.'
          : bgMgdl
            ? null
            : 'Mit Blutzucker vorher kann gluciq die Mahlzeit besser auswerten.';

  const onSave = () => {
    if (!canSave) return;
    const timestamp = new Date(Date.now() - Number(when) * 60000).toISOString();
    if (bgMgdl) addGlucose({ value: bgMgdl, timestamp, source: 'manual', context: carbValue ? 'before-meal' : 'other' });
    if (carbValue) {
      logMealItems(
        MEAL_TYPE[slotFor(new Date(timestamp))],
        [{ name: 'Mahlzeit', servings: 1, nutrients: { carbs: carbValue, calories: 0, protein: 0, fat: 0 } }],
        { timestamp, carbsWeighed: weighed === 'weighed' },
      );
    }
    if (unitValue) {
      addInsulin({ units: unitValue, insulinType: 'rapid', purpose: carbValue ? 'meal' : 'correction', source: 'manual', timestamp });
    }
    haptics.success();
    setBg('');
    setCarbs('');
    setUnits('');
    setWhen('0');
    setSaved(true);
  };

  const entries = useMemo<Entry[]>(() => {
    const from = new Date(now.getTime() - 7 * 86400000).toISOString();
    const byTime = new Map<string, Entry>();
    const get = (t: string) => {
      let e = byTime.get(t);
      if (!e) byTime.set(t, (e = { timestamp: t }));
      return e;
    };
    for (const g of glucose) if (g.source === 'manual' && g.timestamp >= from) get(g.timestamp).glucose = g.value;
    for (const m of meals)
      if (m.timestamp >= from) {
        const e = get(m.timestamp);
        e.carbs = (e.carbs ?? 0) + m.carbs;
        e.weighed = m.carbsWeighed;
        e.sample = analysis.samples.find((s) => s.mealId === m.id);
      }
    for (const d of insulin)
      if (d.insulinType !== 'long' && d.timestamp >= from) {
        const e = get(d.timestamp);
        e.units = (e.units ?? 0) + d.units;
        e.correction = classifyDose(d, meals) === 'correction';
      }
    return [...byTime.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 15);
  }, [glucose, meals, insulin, analysis.samples, now]);

  return (
    <Screen
      title="Eintragen"
      subtitle="Spritz wie immer – trag einfach ein, was du gemacht hast."
      tabBar>
      <View style={styles.form}>
        <NumberField
          label="Blutzucker"
          value={bg}
          onChangeText={setBg}
          unit={unit}
          size="l"
          decimal={unit === 'mmol/L'}
          placeholder="–"
          error={bgInvalid ? 'Bitte prüfen' : undefined}
        />
        <View style={styles.row}>
          <NumberField
            label="Kohlenhydrate"
            value={carbs}
            onChangeText={setCarbs}
            unit="g"
            size="l"
            decimal={false}
            placeholder="–"
            style={styles.half}
            error={carbsInvalid ? 'Bitte prüfen' : undefined}
          />
          <NumberField
            label="NovoRapid"
            value={units}
            onChangeText={setUnits}
            unit="IE"
            size="l"
            placeholder="–"
            style={styles.half}
            error={unitsInvalid ? 'Bitte prüfen' : undefined}
          />
        </View>
        {carbValue ? (
          <SegmentedControl
            size="s"
            value={weighed}
            onChange={setWeighed}
            segments={[
              { value: 'estimated', label: 'Geschätzt' },
              { value: 'weighed', label: 'Gewogen' },
            ]}
          />
        ) : null}
        <ChipGroup<When> value={when} onChange={setWhen} options={WHEN} />
        {hint ? (
          <Text variant="caption" color="muted">
            {hint}
          </Text>
        ) : null}
        <Button label={saved ? 'Gespeichert ✓' : 'Speichern'} onPress={onSave} disabled={!canSave} style={styles.save} />
      </View>

      <Section title="Letzte Einträge">
        {entries.length === 0 ? (
          <Text variant="callout" color="secondary">
            Noch nichts eingetragen.
          </Text>
        ) : (
          <View style={styles.list}>
            {entries.map((e, i) => {
              const meta = e.sample ? OUTCOME[e.sample.outcome] : undefined;
              const parts = [
                e.carbs != null ? `${num(e.carbs)} g${e.weighed ? ' (gewogen)' : ''}` : null,
                e.units != null ? `${num(e.units)} IE` : null,
                e.glucose != null ? `${formatGlucose(e.glucose, unit)} ${unit}` : null,
              ].filter(Boolean);
              const s = e.sample;
              const after =
                s && s.glucoseBefore != null && s.glucoseAfter != null && s.afterMinutes != null
                  ? `${formatGlucose(s.glucoseBefore, unit)} → ${formatGlucose(s.glucoseAfter, unit)} nach ${num(Math.round(s.afterMinutes / 30) / 2)} h`
                  : undefined;
              const expanded = open === e.timestamp;
              return (
                <PressableScale
                  key={e.timestamp}
                  scaleTo={0.99}
                  onPress={() => setOpen(expanded ? null : e.timestamp)}
                  accessibilityRole="button"
                  style={[styles.item, i < entries.length - 1 && styles.divider]}>
                  <View style={styles.itemRow}>
                    <View style={styles.itemTime}>
                      <Text variant="label">{timeText(e.timestamp)}</Text>
                      <Text variant="caption" color="muted">
                        {dayText(e.timestamp, now)}
                      </Text>
                    </View>
                    <View style={styles.itemBody}>
                      <Text variant="bodyStrong">{parts.join(' · ')}</Text>
                      {meta ? (
                        <Text variant="label" style={{ color: meta.color }}>
                          {meta.label}
                          {after ? <Text variant="label" color="muted">{`  ${after}`}</Text> : null}
                        </Text>
                      ) : e.correction ? (
                        <Text variant="label" color="muted">
                          Korrektur
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  {expanded ? (
                    <View style={styles.actions}>
                      {meta?.detail ? (
                        <Text variant="caption" color="muted" style={styles.flex}>
                          {meta.detail}
                        </Text>
                      ) : (
                        <View style={styles.flex} />
                      )}
                      <Button label="Löschen" variant="danger" size="m" onPress={() => deleteEntry(e.timestamp)} />
                    </View>
                  ) : null}
                </PressableScale>
              );
            })}
          </View>
        )}
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
  save: { marginTop: spacing.sm },
  list: { backgroundColor: colors.card, borderRadius: radius.xl, paddingHorizontal: spacing.lg },
  item: { paddingVertical: spacing.md + 2 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSubtle },
  itemRow: { flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' },
  itemTime: { width: 64 },
  itemBody: { flex: 1, gap: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.md },
  flex: { flex: 1 },
});
