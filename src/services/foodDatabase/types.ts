import type { FoodItem } from '@/types/models';

/**
 * Every food source (Open Food Facts, USDA, a future API, the user's own
 * foods) sits behind this interface so the UI never couples to a provider.
 */
export interface FoodDatabaseProvider {
  readonly id: string;
  search(query: string): Promise<FoodItem[]>;
  getByBarcode(barcode: string): Promise<FoodItem | null>;
}
