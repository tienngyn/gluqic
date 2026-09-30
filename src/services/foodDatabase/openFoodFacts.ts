import type { FoodItem } from '@/types/models';

import type { FoodDatabaseProvider } from './types';

type OffProduct = {
  code?: string;
  product_name?: string;
  brands?: string;
  serving_size?: string;
  nutriments?: Record<string, number | undefined>;
};

const BASE = 'https://world.openfoodfacts.org';

/** Maps an Open Food Facts product (per 100 g) onto a FoodItem. */
export function mapOffProduct(p: OffProduct): FoodItem | null {
  const n = p.nutriments ?? {};
  if (!p.product_name || n['energy-kcal_100g'] == null) return null;
  return {
    id: `off-${p.code ?? p.product_name}`,
    name: p.product_name,
    brand: p.brands?.split(',')[0]?.trim() || undefined,
    barcode: p.code,
    servingSize: 100,
    servingUnit: 'g',
    servingLabel: p.serving_size,
    nutrients: {
      calories: Math.round(n['energy-kcal_100g'] ?? 0),
      carbs: n.carbohydrates_100g ?? 0,
      protein: n.proteins_100g ?? 0,
      fat: n.fat_100g ?? 0,
      fiber: n.fiber_100g ?? 0,
      sugar: n.sugars_100g ?? 0,
    },
    source: 'open-food-facts',
  };
}

/**
 * Open Food Facts provider. Not wired into the app by default in the
 * prototype (the mock provider is), but ready to swap in via `foodDatabase`.
 */
export class OpenFoodFactsProvider implements FoodDatabaseProvider {
  readonly id = 'open-food-facts';

  constructor(private fetchImpl: typeof fetch = fetch) {}

  async search(query: string): Promise<FoodItem[]> {
    const url = `${BASE}/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&json=1&page_size=25`;
    const res = await this.fetchImpl(url);
    if (!res.ok) return [];
    const body = (await res.json()) as { products?: OffProduct[] };
    return (body.products ?? []).map(mapOffProduct).filter((f): f is FoodItem => f !== null);
  }

  async getByBarcode(barcode: string): Promise<FoodItem | null> {
    const res = await this.fetchImpl(`${BASE}/api/v2/product/${encodeURIComponent(barcode)}.json`);
    if (!res.ok) return null;
    const body = (await res.json()) as { status?: number; product?: OffProduct };
    return body.status === 1 && body.product ? mapOffProduct({ ...body.product, code: barcode }) : null;
  }
}
