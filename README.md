# gluciq

A premium, dark-first diabetes companion that helps you see how glucose, insulin, food, activity and time of day interact.

> **Prototype.** The bolus calculator is a deterministic development prototype. It has not been clinically validated and must not be used for real dosing decisions.

## Run it

```bash
npm install
npm run ios        # iOS simulator (Expo Go works; camera + HealthKit need a dev build)
npm run web        # quickest way to look around
```

Checks:

```bash
npm test           # domain unit tests (jest-expo)
npm run typecheck  # tsc --noEmit
npm run lint       # eslint (expo config)
```

On first start you can begin empty or look around with 90 days of deterministic sample data.

## Die App (reduziert)

gluciq löst ein Problem: **Spritzen nach Gefühl, ohne System.** Die App hat zwei Tabs, auf Deutsch:

| Tab | Was er macht |
| --- | --- |
| **Eintragen** | Blutzucker, Kohlenhydrate (geschätzt / gewogen) und NovoRapid-Einheiten, dazu Jetzt / −15 / −30 / −1 h, dann Speichern. Ohne Kohlenhydrate zählt eine Dosis als Korrektur, ein Wert allein ist eine Messung. Darunter stehen die letzten Einträge mit Ergebnis (Passt / Zu wenig / Zu viel Insulin / Wartet auf Werte). Antippen → Löschen. |
| **Dein System** | Pro Tageszeit (morgens 5–11, mittags 11–16, abends 16–22, spät) der KE-Faktor, den deine **passenden** Mahlzeiten benutzt haben, mit Beispiel. Jede Mahlzeit ist ein Punkt auf der Skala „mehr ↔ weniger Insulin“, damit man sieht, wie stark die Dosen streuen. Dazu kommen die Wirkung einer Korrektur (mg/dL pro IE) und ein Tresiba-Check für die Nacht. Über das Zahnrad: Einheit, Dexcom Share, alle Daten löschen. |

Beim ersten Start: kurze Erklärung, Einheit wählen, leer starten oder Beispieldaten ansehen.

### Wie das System entsteht (`src/domain/system/analyze.ts`, mit Tests)

- **Mahlzeit bewerten:** Wert ca. 3 h nach dem Essen (Fenster 2,5–4 h, ein eingetippter Wert zählt auch) gegen den Startwert. Innerhalb von ±40 mg/dL → **passt**. Mehr als 40 darüber oder eine Korrektur 20 min – 3 h danach → **zu wenig Insulin**. Mehr als 40 darunter oder unter 70 innerhalb von 4 h → **zu viel Insulin**.
- **Zählt nicht für den Faktor:** Start außerhalb 70–180 (dann steckt eine Korrektur in der Dosis), eine zweite Mahlzeit innerhalb von 3 h, unter 10 g Kohlenhydrate. Ohne Wert nach 3 h wartet gluciq bis zu 8 h (Dexcom → Apple Health ≈ 3 h Verzögerung), danach „Kein Wert nach 3 h“.
- **Faktor pro Tageszeit:** ab 3 passenden Mahlzeiten der Median ihrer Verhältnisse (g pro IE, auf 0,5 gerundet), ab 6 „ziemlich sicher“. Davor nur eine Richtung, wenn ≥ 60 % zu hoch oder zu niedrig liefen. Gezählt werden nur die letzten 4 Wochen.
- **Korrektur:** saubere Korrekturen ohne Essen 3 h davor und danach (bestehendes `analyzeCorrections`), ab 4 Stück.
- **Tresiba:** Nächte ohne Essen und NovoRapid ab 21 Uhr, Veränderung von 1 bis 6 Uhr mit CGM-Werten. Ab 3 Nächten: stabil / steigt / fällt / Unterzucker (≥ 2 Nächte unter 70) / uneinheitlich.
- Beschreibt nur die Daten. Nichts wird automatisch eingestellt. Die Hinweise sagen ausdrücklich, dass der Faktor mit dem Diabetologen besprochen werden soll.

Die früheren Screens (Home, Food, Bolus-Rechner, Insights, Profil, Onboarding, Gewicht, Timeline) sind aus der App entfernt und in der Git-Historie (bis `b560a58`) noch vorhanden. Die Domain-Logik dahinter (Bolus-Engine, Setpoints, Vorschläge, Matching) ist noch da und getestet.

## Dexcom Share (live values)

System → ⚙︎ → **Dexcom Share**: region, Dexcom username and password. gluciq logs in to Dexcom's Share service (the one the Dexcom Follow app uses; also used by pydexcom, Nightscout and xDrip), loads the last 24 h and then polls every 5 minutes. Readings arrive as live sensor values with Dexcom's trend arrow, so meals are judged without waiting for the 3-hour Apple Health delay. Later Apple Health copies of the same readings are de-duplicated (±2.5 min).

- Credentials are stored only in the device keychain (`expo-secure-store`) and sent only to Dexcom; the app reconnects on start.
- Requirements: Share turned on in the Dexcom app with at least one follower.
- Unofficial: Dexcom can change this service; gluciq then falls back to typed values + Apple Health.
- Browsers block Dexcom's server (no CORS), so it works in the native app. The web preview offers “Try with simulated values”.
- Code: `src/services/dexcomShare/` (client with tests), `src/store/useDexcomShare.ts`, `src/app/dexcom.tsx`. It has not yet been run against a real Dexcom account.

## Saved data

Everything you log and set (readings, doses, meals, weight, settings, setpoints, learning state) is saved on the device: SQLite (`expo-sqlite/kv-store`) on iOS, `localStorage` in the browser. Saves are batched (≈ 1 s after the last change) and written immediately when the app goes to the background. Unfinished calculations are never saved. The app waits until saved data is loaded before showing anything, so nothing can overwrite it on start. The saved format is versioned (`STORAGE_VERSION`) for future migrations. System → ⚙︎ → Alle Daten löschen removes everything and disconnects Dexcom Share (two taps).

## Architecture

```
src/
  app/                 Expo Router routes: (tabs)/index (Eintragen), (tabs)/system, start, settings, dexcom
  components/          cards/, charts/ (SVG line, bar, ring), forms/, navigation/ (floating glass tab bar), typography/, ui/
  domain/              pure, tested logic: system/ (Dein System), bolus/, glucose/, insulin/, nutrition/, insights/
  features/system/     outcome labels
  services/            persistence/ (debounced local saving), dexcomShare/, foodDatabase/ (provider interface, mock + Open Food Facts), healthkit/ (interface + stub),
                       supabase/ (sync interface + schema.sql)
  store/               Zustand store (local-first source of truth)
  hooks/               memoised derived views over the store
  data/                seed-data simulator + sample foods
  constants/theme.ts   design tokens (colors, type scale, radii, spacing)
```

## Next steps

1. Use it for 2 weeks with real data, then check the factors with the diabetologist.
2. Test Dexcom Share with a real account (in the iPhone app; it needs Share turned on and one follower).
3. HealthKit, if Share is not an option: implement `HealthService` in a development build (e.g. `@kingstinct/react-native-healthkit`).
4. Once the factors are set: show the dose by the agreed system on the Eintragen tab (the bolus engine is still there).
