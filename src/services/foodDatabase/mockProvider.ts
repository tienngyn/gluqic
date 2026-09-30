import { MOCK_FOODS } from '@/data/foods';
import type { FoodItem } from '@/types/models';

import type { FoodDatabaseProvider } from './types';

/** Offline provider backed by the bundled sample foods. */
export class MockFoodProvider implements FoodDatabaseProvider {
  readonly id = 'mock';

  constructor(private foods: FoodItem[] = MOCK_FOODS) {}

  async search(query: string): Promise<FoodItem[]> {
    const q = query.trim().toLowerCase();
    if (!q) return this.foods.slice(0, 12);
    return this.foods
      .filter((f) => `${f.name} ${f.brand ?? ''}`.toLowerCase().includes(q))
      .slice(0, 30);
  }

  async getByBarcode(barcode: string): Promise<FoodItem | null> {
    return this.foods.find((f) => f.barcode === barcode) ?? null;
  }
}
