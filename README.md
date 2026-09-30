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

The app starts with 90 days of deterministic, realistic sample data (glucose, meals, doses, workouts, 13 months of weight). Profile → *Reset demo data* regenerates it.

## What's in the first build

| Tab | What it does |
| --- | --- |
| **Home** | Current glucose + trend, scrubbable 3–24 h chart with haptics, active insulin, 24 h time in range, today's calories/macros, quick actions (+ Glucose / Meal / Insulin / Weight), featured insight, recent timeline. |
| **Food** | Daily energy ring, macros, fiber/sugar, meals by type, one-tap saved meals, day navigation. Add food via search, barcode scan (Expo Camera, with manual/sample fallback), custom food; portion picker can send carbs straight to Bolus. |
| **Bolus** | React Hook Form + Zod form, live deterministic calculation, full breakdown with formulas, safety warnings, "Why this amount?", similar-meal context (informational only), explicit confirmation before saving, calculation history. |
| **Insights** | 7/30/90/custom periods; stability chart vs previous period; TIR, average, GMI, high/low events, range bar, average-day profile, similar-meal analysis and pattern cards. |
| **Profile** | Glucose unit (mg/dL ↔ mmol/L everywhere), target, correction factor, insulin duration, max bolus, low-glucose cut-off, dose increment, carb ratios with custom time windows, nutrition + weight goals, Apple Health permissions screen, integrations. |

Also: unified timeline (`/timeline`), weight tracker with 7D/30D/3M/1Y/All, BMI, body fat and lean mass (`/weight`).

## Safety design

- `src/domain/bolus/engine.ts` is pure and deterministic: no clock, no I/O, no AI.
  `meal = carbs ÷ ratio`, `correction = (glucose − target) ÷ CF`, `suggested = meal + correction − IOB`, then in order: **low-glucose block → floor at 0 → round *down* to the dose increment → cap at max bolus**.
- Every result carries its steps (formula + value), warnings and `calculationVersion`; saved calculations keep inputs and the confirmed amount (both suggested and taken are stored).
- Trend and planned activity only produce warnings — they never change the number.
- Nothing changes settings automatically. Insights describe outcomes and at most suggest *reviewing* a setting; `containsDoseInstruction()` filters any insight that reads like a dose instruction, and tests enforce it.
- Active insulin uses the OpenAPS exponential curve (`src/domain/insulin/iob.ts`).

## Setpoints

Under the suggested amount on the Bolus screen, **“You’ll take”** lets you change the dose (− / + in dose steps, or type it). As soon as it differs from the suggestion, a **“Use as … setpoint”** switch appears (it is also on the confirm screen). gluciq turns the dose into a carb ratio for that meal type:

```
mealUnits = unitsTaken − correction + activeInsulin      e.g. 16 − 0.4 + 0 = 15.6 U
ratio     = carbs ÷ mealUnits                            e.g. 72 g ÷ 15.6 U = 1 U : 4.6 g
```

- From then on the calculator uses that ratio for the meal type (labelled “Your setpoint”, with **Reset** back to the previous ratio). The next 60 g breakfast is 60 ÷ 4.6 = 13.0 U.
- “Learning” starts at the setpoint: a setpoint card compares meals since it with the meals before it (2 h outcomes), and similar-meal history only counts meals since the setpoint.
- Only you create, replace or reset a setpoint. Editing that ratio in Diabetes settings ends it. Changes over ×2 either way are refused, over 25 % get a caution, and the max bolus still applies.
- Logic: `src/domain/bolus/setpoint.ts`, `src/domain/insights/setpoints.ts` (with tests).

The demo data includes a breakfast setpoint from 14 days ago (1 U : 5 g → 1 U : 4.6 g).

## Architecture

```
src/
  app/                 Expo Router routes: (tabs)/, log/, food/, bolus/, profile/, timeline, weight
  components/          cards/, charts/ (SVG line, bar, ring), forms/, navigation/ (floating glass tab bar), typography/, ui/
  domain/              pure, tested logic: bolus/, glucose/, insulin/, nutrition/, insights/
  features/            screen-level pieces (bolus form + result card, glucose hero, logging)
  services/            foodDatabase/ (provider interface, mock + Open Food Facts), healthkit/ (interface + stub),
                       supabase/ (sync interface + schema.sql)
  store/               Zustand store (local-first source of truth)
  hooks/               memoised derived views over the store
  data/                seed-data simulator + sample foods
  constants/theme.ts   design tokens (colors, type scale, radii, spacing)
```

## Next steps

1. Persistence: SQLite adapter behind the store; then Supabase sync using `services/supabase/schema.sql`.
2. HealthKit: implement `HealthService` in a development build (e.g. `@kingstinct/react-native-healthkit`).
3. Switch `foodDatabase` to Open Food Facts (already implemented) merged with custom foods.
4. CGM integrations, photo recognition, reports — the domain and service boundaries are set up for these.
