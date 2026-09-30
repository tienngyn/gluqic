import type { FoodItem, Meal } from '@/types/models';

import { caloriesByMealType, caloriesFromMacros, dayTotals, portionNutrients, sumNutrients } from './totals';

const oats: FoodItem = {
  id: 'oats',
  name: 'Oats',
  servingSize: 100,
  servingUnit: 'g',
  nutrients: { calories: 372, carbs: 58.7, protein: 13.5, fat: 7, fiber: 10 },
  source: 'mock',
};

const meal = (mealType: Meal['mealType'], calories: number, carbs: number): Meal => ({
  id: `${mealType}-${calories}`,
  userId: 'u',
  mealType,
  items: [],
  calories,
  carbs,
  protein: 10,
  fat: 5,
  timestamp: '2026-09-30T08:00:00Z',
});

describe('nutrition', () => {
  it('scales a portion by serving size', () => {
    const n = portionNutrients(oats, 60);
    expect(n.calories).toBe(223);
    expect(n.carbs).toBe(35.2);
    expect(n.fiber).toBe(6);
  });

  it('sums nutrients without float drift', () => {
    const n = sumNutrients([
      { calories: 1, carbs: 0.1, protein: 0.2, fat: 0 },
      { calories: 1, carbs: 0.2, protein: 0.1, fat: 0 },
    ]);
    expect(n.carbs).toBe(0.3);
    expect(n.protein).toBe(0.3);
  });

  it('totals a day and groups calories by meal type', () => {
    const meals = [meal('breakfast', 540, 62), meal('lunch', 620, 70), meal('snack', 120, 20), meal('snack', 100, 10)];
    expect(dayTotals(meals).calories).toBe(1380);
    expect(dayTotals(meals).carbs).toBe(162);
    expect(caloriesByMealType(meals)).toEqual({ breakfast: 540, lunch: 620, dinner: null, snack: 220 });
  });

  it('derives calories from macros (4/4/9)', () => {
    expect(caloriesFromMacros({ carbs: 62, protein: 22, fat: 21 })).toBe(525);
  });
});
