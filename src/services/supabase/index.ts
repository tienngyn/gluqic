/**
 * Cloud sync boundary.
 *
 * gluciq is local-first: the device store is the source of truth and a
 * sync service pushes/pulls changes when signed in. The prototype runs
 * fully offline; this interface is where a Supabase client plugs in
 * (tables mirror `src/types/models.ts`, see `schema.sql`).
 */
export type SyncEntity = 'glucose' | 'insulin' | 'meals' | 'weight' | 'activity' | 'bolus_calculations' | 'profile';

export type SyncResult = { pushed: number; pulled: number; at: string };

export interface SyncService {
  readonly enabled: boolean;
  sync(entities?: SyncEntity[]): Promise<SyncResult>;
}

export const supabaseConfig = {
  url: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
};

export const offlineSync: SyncService = {
  enabled: false,
  sync: async () => ({ pushed: 0, pulled: 0, at: new Date().toISOString() }),
};

export const sync: SyncService = offlineSync;
