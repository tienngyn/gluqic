/**
 * Apple Health integration boundary.
 *
 * The prototype ships a stub so the rest of the app can be built against
 * the interface. A real implementation (e.g. `@kingstinct/react-native-healthkit`
 * in a development build) plugs in behind `HealthService` without UI changes.
 */
import type { ActivityEntry, GlucoseReading, InsulinDose, WeightEntry } from '@/types/models';

export type HealthDataType =
  | 'bodyMass'
  | 'workouts'
  | 'steps'
  | 'activeEnergy'
  | 'bloodGlucose'
  | 'dietaryCarbohydrates'
  | 'insulinDelivery';

export type HealthPermission = {
  type: HealthDataType;
  label: string;
  why: string;
  read: boolean;
  write: boolean;
};

/** The complete, minimal set gluciq asks for. Shown verbatim to the user. */
export const HEALTH_PERMISSIONS: HealthPermission[] = [
  { type: 'bloodGlucose', label: 'Blood glucose', why: 'Import readings and save the ones you log.', read: true, write: true },
  { type: 'insulinDelivery', label: 'Insulin delivery', why: 'Keep doses in one place across apps.', read: true, write: true },
  { type: 'dietaryCarbohydrates', label: 'Carbohydrates', why: 'Share meal carbs with other apps.', read: true, write: true },
  { type: 'bodyMass', label: 'Weight', why: 'Track weight trends.', read: true, write: true },
  { type: 'workouts', label: 'Workouts', why: 'Spot glucose changes after exercise.', read: true, write: false },
  { type: 'steps', label: 'Steps', why: 'Add daily activity context.', read: true, write: false },
  { type: 'activeEnergy', label: 'Active energy', why: 'Add daily activity context.', read: true, write: false },
];

export type HealthStatus = 'unavailable' | 'not-determined' | 'authorized';

export interface HealthService {
  status(): Promise<HealthStatus>;
  requestAuthorization(types: HealthDataType[]): Promise<HealthStatus>;
  readGlucose(from: Date, to: Date): Promise<GlucoseReading[]>;
  readWeight(from: Date, to: Date): Promise<WeightEntry[]>;
  readWorkouts(from: Date, to: Date): Promise<ActivityEntry[]>;
  writeGlucose(reading: GlucoseReading): Promise<void>;
  writeInsulin(dose: InsulinDose): Promise<void>;
  writeWeight(entry: WeightEntry): Promise<void>;
}

/** No-op implementation used in the prototype, Expo Go and on web. */
export const stubHealthService: HealthService = {
  status: async () => 'unavailable',
  requestAuthorization: async () => 'unavailable',
  readGlucose: async () => [],
  readWeight: async () => [],
  readWorkouts: async () => [],
  writeGlucose: async () => {},
  writeInsulin: async () => {},
  writeWeight: async () => {},
};

export const health: HealthService = stubHealthService;
