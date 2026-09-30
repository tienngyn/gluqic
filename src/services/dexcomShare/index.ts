/**
 * Dexcom Share connection: credentials in the device keychain, one shared
 * client, and helpers the store uses to sync.
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import type { GlucoseReading } from '@/types/models';

import { DexcomShareClient, ShareError, type ShareRegion } from './client';

export { mergeSensorReadings, SHARE_REGIONS, ShareError, type ShareRegion } from './client';

export type ShareCredentials = { region: ShareRegion; username: string; password: string };

const KEY = 'gluciq.dexcomShare';

/** Browsers block Dexcom's server (no CORS), so live Share needs the native app. */
export const shareSupported = Platform.OS === 'ios' || Platform.OS === 'android';

let client: DexcomShareClient | null = null;

export async function saveCredentials(c: ShareCredentials): Promise<void> {
  if (!shareSupported) return;
  // Stored only in the iOS Keychain / Android Keystore; never synced.
  await SecureStore.setItemAsync(KEY, JSON.stringify(c), { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK });
}

export async function loadCredentials(): Promise<ShareCredentials | null> {
  if (!shareSupported) return null;
  const raw = await SecureStore.getItemAsync(KEY);
  return raw ? (JSON.parse(raw) as ShareCredentials) : null;
}

export async function clearCredentials(): Promise<void> {
  client = null;
  if (shareSupported) await SecureStore.deleteItemAsync(KEY);
}

/** Logs in and reads the last `minutes` of readings. */
export async function connect(c: ShareCredentials, userId: string, minutes = 1440): Promise<GlucoseReading[]> {
  if (!shareSupported) {
    throw new ShareError('Dexcom Share works in the gluciq iPhone app. Browsers block Dexcom’s server.', 'blocked');
  }
  client = new DexcomShareClient(c.region, c.username, c.password);
  await client.login();
  return client.readLatest(userId, minutes, Math.ceil(minutes / 5) + 2);
}

export async function readRecent(userId: string, minutes: number): Promise<GlucoseReading[]> {
  if (!client) throw new ShareError('Not connected.', 'session');
  const m = Math.max(10, Math.min(1440, Math.round(minutes)));
  return client.readLatest(userId, m, Math.ceil(m / 5) + 2);
}
