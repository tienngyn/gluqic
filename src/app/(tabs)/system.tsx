import { router } from 'expo-router';
import { Settings } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/cards/Card';
import { Text } from '@/components/typography/Text';
import { Banner } from '@/components/ui/Banner';
import { Screen, Section } from '@/components/ui/Screen';
import { IconButton } from '@/components/ui/SheetHeader';
import { colors, spacing } from '@/constants/theme';
import { keFactor, SYSTEM_RULES, type BasalCheck, type SlotSummary } from '@/domain/system/analyze';
import { OUTCOME } from '@/features/system/outcome';
import { useNow, useSystemAnalysis } from '@/hooks/useDerived';
import { useAppStore } from '@/store/useAppStore';
import { num, ratioText } from '@/utils/de';
import { formatGlucose } from '@/utils/format';

export default function SystemScreen() {
  const now = useNow();
  const unit = useAppStore((s) => s.user.glucoseUnit);
  const a = useSystemAnalysis(now);
  const judged = a.slots.reduce((s, x) => s + x.judged, 0);
  // The three main meals always show; late only once there is something.
  const slots = a.slots.filter((s) => s.slot !== 'late' || s.samples.length > 0);

  return (
    <Screen
      title="Dein System"
      subtitle={
        judged === 0
          ? 'Entsteht aus deinen Einträgen.'
          : `Aus ${judged} ausgewerteten Mahlzeiten der letzten ${SYSTEM_RULES.lookbackDays / 7} Wochen.`
      }
      tabBar
      right={
        <IconButton
          label="Einstellungen"
          icon={<Settings size={18} color={colors.text} strokeWidth={1.8} />}
          onPress={() => router.push('/settings')}
        />
      }>
      {a.sensorReadings24h === 0 ? (
        <Banner
          tone="caution"
          title="Keine Dexcom-Werte"
          message="In den letzten 24 h kamen keine Sensorwerte an. Verbinde Dexcom Share in den Einstellungen – oder trag ca. 3 h nach dem Essen deinen Wert ein."
        />
      ) : null}

      {judged < 3 ? (
        <Card style={styles.intro}>
          <Text variant="headline">So entsteht dein System</Text>
          <Text variant="callout" color="secondary" style={styles.introText}>
            Spritz wie immer und trag jede Mahlzeit ein: Blutzucker, Kohlenhydrate, NovoRapid. Nach ca. 3 h schaut gluciq, ob du
            wieder beim Startwert bist. Aus den Mahlzeiten, die gepasst haben, wird dein Faktor – getrennt für morgens, mittags und
            abends.
          </Text>
        </Card>
      ) : null}

      <View style={styles.stack}>
        {slots.map((s) => (
          <SlotCard key={s.slot} s={s} />
        ))}
      </View>

      <Section title="Korrektur">
        <Card>
          {a.correction.dropPerUnit != null ? (
            <>
              <Text variant="metricM">
                1 IE ≈ −{formatGlucose(a.correction.dropPerUnit, unit)} {unit}
              </Text>
              <Text variant="label" color="secondary" style={styles.sub}>
                So weit senkt dich 1 IE NovoRapid, aus {a.correction.usable} Korrekturen.
              </Text>
            </>
          ) : (
            <>
              <Text variant="bodyStrong">
                Noch {a.correction.usable} von {a.correction.needed} Korrekturen
              </Text>
              <Text variant="label" color="secondary" style={styles.sub}>
                Zählt nur, wenn du ohne Essen korrigierst (3 h davor und danach nichts gegessen) und Dexcom-Werte danach da sind.
              </Text>
            </>
          )}
        </Card>
      </Section>

      <Section title="Tresiba">
        <BasalCard basal={a.basal} unit={unit} />
      </Section>

      <Text variant="caption" color="muted" style={styles.disclaimer}>
        Aus deinen eigenen Einträgen berechnet, nicht ärztlich geprüft. Besprich deinen Faktor mit deinem Diabetologen, bevor du
        danach spritzt.
      </Text>
    </Screen>
  );
}

function SlotCard({ s }: { s: SlotSummary }) {
  const e = s.estimate;
  return (
    <Card>
      <Text variant="overline" color="secondary">
        {s.label}
      </Text>
      {e ? (
        <>
          <Text variant="metricL" style={styles.metric}>
            {ratioText(e.gramsPerUnit)}
          </Text>
          <Text variant="label" color="secondary">
            KE-Faktor {num(keFactor(e.gramsPerUnit), 1)} · {e.confidence === 'high' ? 'ziemlich sicher' : 'noch unsicher'} · aus {s.good}{' '}
            passenden Mahlzeiten
          </Text>
          <Text variant="callout" style={styles.example}>
            Beispiel: 60 g → {num(Math.floor((60 / e.gramsPerUnit) * 2) / 2)} IE
          </Text>
        </>
      ) : (
        <>
          <Text variant="headline" style={styles.metric}>
            Noch kein Faktor
          </Text>
          <Text variant="label" color="secondary">
            {s.lean === 'more-insulin'
              ? 'Bisher meist zu wenig Insulin: deine Mahlzeiten liefen hoch.'
              : s.lean === 'less-insulin'
                ? 'Bisher meist zu viel Insulin: dein Wert fiel deutlich ab.'
                : `${s.good} von ${SYSTEM_RULES.minGood} passenden Mahlzeiten`}
          </Text>
        </>
      )}
      {s.samples.length > 0 ? <RatioStrip s={s} /> : null}
    </Card>
  );
}

/**
 * Every meal as a dot on a grams-per-unit scale, coloured by outcome: shows
 * how random dosing by feel is, and where the meals that worked sit.
 */
function RatioStrip({ s }: { s: SlotSummary }) {
  const values = s.samples.map((x) => x.gramsPerUnit);
  const lo = Math.floor(Math.min(...values, s.estimate?.gramsPerUnit ?? Infinity) - 1);
  const hi = Math.ceil(Math.max(...values, s.estimate?.gramsPerUnit ?? -Infinity) + 1);
  const pos = (v: number) => `${((v - lo) / (hi - lo)) * 100}%` as const;
  return (
    <View style={styles.strip}>
      <View style={styles.track}>
        <View style={styles.line} />
        {s.estimate ? <View style={[styles.marker, { left: pos(s.estimate.gramsPerUnit) }]} /> : null}
        {s.samples.map((x) => {
          const judged = x.outcome === 'good' || x.outcome === 'too-little' || x.outcome === 'too-much';
          return (
            <View
              key={x.mealId}
              style={[
                styles.dot,
                { left: pos(x.gramsPerUnit) },
                judged ? { backgroundColor: OUTCOME[x.outcome].color } : styles.dotOpen,
              ]}
            />
          );
        })}
      </View>
      <View style={styles.scale}>
        <Text variant="caption" color="muted">
          ← mehr Insulin
        </Text>
        <Text variant="caption" color="muted">
          weniger Insulin →
        </Text>
      </View>
      {s.used ? (
        <Text variant="label" color="secondary" style={styles.sub}>
          {s.used.min === s.used.max
            ? `Gespritzt hast du mit ${ratioText(s.used.min)}.`
            : `Gespritzt hast du zwischen ${ratioText(s.used.min)} und ${ratioText(s.used.max)}.`}
        </Text>
      ) : null}
      <View style={styles.legend}>
        <Legend color={colors.green} label={`Passt ${s.good}`} />
        <Legend color={colors.orange} label={`Zu wenig ${s.tooLittle}`} />
        <Legend color={colors.red} label={`Zu viel ${s.tooMuch}`} />
        {s.samples.length > s.judged ? <Legend label={`Offen ${s.samples.length - s.judged}`} /> : null}
      </View>
    </View>
  );
}

function Legend({ color, label }: { color?: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, color ? { backgroundColor: color } : styles.dotOpen]} />
      <Text variant="caption" color="secondary">
        {label}
      </Text>
    </View>
  );
}

function BasalCard({ basal, unit }: { basal: BasalCheck; unit: 'mg/dL' | 'mmol/L' }) {
  const n = basal.nights.length;
  const change = basal.medianChange ?? 0;
  const delta = `${change >= 0 ? '+' : '−'}${formatGlucose(Math.abs(change), unit)} ${unit}`;
  const count = (k: string) => basal.nights.filter((x) => x.kind === k).length;
  const content: Record<NonNullable<BasalCheck['verdict']>, { title: string; color: string; body: string }> = {
    stable: {
      title: 'Nachts stabil',
      color: colors.green,
      body: `In ${count('stable')} von ${n} ruhigen Nächten blieb dein Wert von 1 bis 6 Uhr fast gleich. Das spricht dafür, dass Tresiba passt.`,
    },
    rising: {
      title: 'Steigt nachts',
      color: colors.orange,
      body: `Im Schnitt ${delta} von 1 bis 6 Uhr. Das kann an zu wenig Tresiba liegen – sprich die Dosis mit deinem Arzt ab. Solange ist auch der KE-Faktor schwerer zu beurteilen.`,
    },
    falling: {
      title: 'Fällt nachts',
      color: colors.orange,
      body: `Im Schnitt ${delta} von 1 bis 6 Uhr. Das kann an zu viel Tresiba liegen – sprich die Dosis mit deinem Arzt ab.`,
    },
    lows: {
      title: 'Unterzucker in der Nacht',
      color: colors.red,
      body: `In ${count('low')} Nächten unter ${formatGlucose(70, unit)} ${unit}. Bitte bald mit deinem Arzt besprechen.`,
    },
    mixed: {
      title: 'Uneinheitlich',
      color: colors.textSecondary,
      body: `Mal steigt, mal fällt dein Wert nachts (${n} Nächte). Noch kein klares Muster.`,
    },
  };
  const c = basal.verdict ? content[basal.verdict] : null;
  return (
    <Card>
      {c ? (
        <>
          <Text variant="headline" style={{ color: c.color }}>
            {c.title}
          </Text>
          <Text variant="label" color="secondary" style={styles.sub}>
            {c.body}
          </Text>
        </>
      ) : (
        <>
          <Text variant="bodyStrong">Noch {n} von 3 ruhigen Nächten</Text>
          <Text variant="label" color="secondary" style={styles.sub}>
            Zeigt, ob Tresiba passt: wie sich dein Wert von 1 bis 6 Uhr verändert. Zählt nur, wenn du ab 21 Uhr nichts isst und kein
            NovoRapid spritzt.
          </Text>
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  intro: { marginTop: spacing.lg },
  introText: { marginTop: spacing.sm },
  stack: { gap: spacing.md, marginTop: spacing.lg },
  metric: { marginTop: spacing.xs, marginBottom: spacing.xs },
  example: { marginTop: spacing.md },
  sub: { marginTop: spacing.xs },
  strip: { marginTop: spacing.lg },
  track: { height: 20, justifyContent: 'center' },
  line: { height: 2, borderRadius: 1, backgroundColor: colors.elevatedHigh },
  marker: { position: 'absolute', width: 2, height: 20, marginLeft: -1, backgroundColor: colors.text, borderRadius: 1 },
  dot: { position: 'absolute', width: 10, height: 10, marginLeft: -5, borderRadius: 5, opacity: 0.9 },
  dotOpen: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.textMuted },
  scale: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  disclaimer: { marginTop: spacing.xxxl },
});
