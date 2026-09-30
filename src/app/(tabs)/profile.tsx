import { router } from 'expo-router';
import { Activity, Database, HeartPulse, Pen, Radio, RotateCcw, Scale, SlidersHorizontal, Target } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/cards/Card';
import { Text } from '@/components/typography/Text';
import { ListRow } from '@/components/ui/ListRow';
import { Screen, Section } from '@/components/ui/Screen';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { colors, spacing } from '@/constants/theme';
import { useAppStore } from '@/store/useAppStore';
import type { GlucoseUnit } from '@/types/models';
import { formatGlucose, formatMinuteOfDay } from '@/utils/format';

const icon = (I: typeof Activity) => <I size={18} color={colors.textSecondary} strokeWidth={1.6} />;

export default function ProfileScreen() {
  const user = useAppStore((s) => s.user);
  const profile = useAppStore((s) => s.insulinProfile);
  const goals = useAppStore((s) => s.nutritionGoals);
  const weightGoal = useAppStore((s) => s.weightGoal);
  const latestWeight = useAppStore((s) => s.weights[s.weights.length - 1]);
  const updateProfile = useAppStore((s) => s.updateProfile);
  const resetDemoData = useAppStore((s) => s.resetDemoData);
  const unit = user.glucoseUnit;

  return (
    <Screen tabBar>
      <View style={styles.identity}>
        <View style={styles.avatar}>
          <Text variant="metricM">{user.name.charAt(0)}</Text>
        </View>
        <View>
          <Text variant="title">{user.name}</Text>
          <Text variant="callout" color="secondary">
            gluciq since {new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </Text>
        </View>
      </View>

      <Section title="Diabetes settings" action={<EditLink onPress={() => router.push('/profile/diabetes')} />}>
        <Card padding={0}>
          <View style={styles.inset}>
            <View style={styles.unitRow}>
              <Text variant="body">Glucose unit</Text>
              <View style={styles.unitControl}>
                <SegmentedControl<GlucoseUnit>
                  size="s"
                  value={unit}
                  onChange={(glucoseUnit) => updateProfile({ glucoseUnit })}
                  segments={[
                    { value: 'mg/dL', label: 'mg/dL' },
                    { value: 'mmol/L', label: 'mmol/L' },
                  ]}
                />
              </View>
            </View>
            <ListRow label="Target glucose" value={`${formatGlucose(profile.targetGlucose, unit)} ${unit}`} onPress={() => router.push('/profile/diabetes')} />
            <ListRow label="Correction factor" value={`1 U : ${formatGlucose(profile.correctionFactor, unit)}`} onPress={() => router.push('/profile/diabetes')} />
            <ListRow label="Insulin duration" value={`${profile.insulinDurationHours} h`} onPress={() => router.push('/profile/diabetes')} />
            <ListRow label="Max bolus" value={`${profile.maxBolus} U`} onPress={() => router.push('/profile/diabetes')} last />
          </View>
        </Card>
      </Section>

      <Section title="Carb ratios">
        <Card padding={0}>
          <View style={styles.inset}>
            {profile.carbRatios.map((c, i) => (
              <ListRow
                key={c.id}
                label={c.label}
                detail={`${formatMinuteOfDay(c.startMinute)}–${formatMinuteOfDay(c.endMinute)}`}
                value={`1 U : ${c.gramsPerUnit} g`}
                onPress={() => router.push('/profile/diabetes')}
                last={i === profile.carbRatios.length - 1}
              />
            ))}
          </View>
        </Card>
      </Section>

      <Section title="Goals" action={<EditLink onPress={() => router.push('/profile/goals')} />}>
        <Card padding={0}>
          <View style={styles.inset}>
            <ListRow icon={icon(Target)} label="Calories" value={`${goals.calories} kcal`} onPress={() => router.push('/profile/goals')} />
            <ListRow icon={icon(SlidersHorizontal)} label="Macros" value={`P ${goals.protein} · C ${goals.carbs} · F ${goals.fat}`} onPress={() => router.push('/profile/goals')} />
            <ListRow
              icon={icon(Scale)}
              label="Weight"
              detail={latestWeight ? `Now ${latestWeight.weightKg.toFixed(1)} kg` : undefined}
              value={`Goal ${weightGoal.targetKg} kg`}
              onPress={() => router.push('/weight')}
              last
            />
          </View>
        </Card>
      </Section>

      <Section title="Integrations">
        <Card padding={0}>
          <View style={styles.inset}>
            <ListRow icon={icon(HeartPulse)} label="Apple Health" detail="Choose what gluciq reads and writes" onPress={() => router.push('/profile/health')} />
            <ListRow icon={icon(Radio)} label="CGM" detail="Dexcom, FreeStyle Libre" value="Coming later" valueMuted />
            <ListRow icon={icon(Database)} label="Food database" detail="Bundled sample foods · Open Food Facts ready" value="Offline" valueMuted />
            <ListRow icon={icon(Pen)} label="Smart insulin pens" value="Planned" valueMuted last />
          </View>
        </Card>
      </Section>

      <Section title="Prototype">
        <Card padding={0}>
          <View style={styles.inset}>
            <ListRow icon={icon(RotateCcw)} label="Reset demo data" detail="Regenerates 90 days of sample history" onPress={resetDemoData} chevron={false} last />
          </View>
        </Card>
        <Text variant="caption" color="muted" style={styles.disclaimer}>
          gluciq is a development prototype. Calculations are deterministic and fully shown, but have not been clinically
          validated. Do not use them for real dosing decisions.
        </Text>
      </Section>
    </Screen>
  );
}

function EditLink({ onPress }: { onPress: () => void }) {
  return (
    <Text variant="label" color="secondary" onPress={onPress} accessibilityRole="link" style={styles.edit}>
      Edit
    </Text>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginBottom: spacing.sm },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.elevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inset: { paddingHorizontal: spacing.lg + 2 },
  unitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  unitControl: { width: 170 },
  edit: { paddingVertical: 4, paddingLeft: 8 },
  disclaimer: { marginTop: spacing.md, lineHeight: 17 },
});
