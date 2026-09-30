import { MockFoodProvider } from './mockProvider';
import type { FoodDatabaseProvider } from './types';

export type { FoodDatabaseProvider } from './types';
export { MockFoodProvider } from './mockProvider';
export { OpenFoodFactsProvider } from './openFoodFacts';

/**
 * The active provider. Swap for `new OpenFoodFactsProvider()` (or a
 * composite that merges custom foods + remote results) when going online.
 */
export const foodDatabase: FoodDatabaseProvider = new MockFoodProvider();
