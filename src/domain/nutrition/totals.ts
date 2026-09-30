import type { FoodItem, Meal, MealItem, MealType, Nutrients } from '@/types/models';

export const EMPTY_NUTRIENTS: Nutrients = { calories: 0, carbs: 0, protein: 0, fat: 0, fiber: 0, sugar: 0 };

const r1 = (n: number) => Math.round(n * 10) / 10;

export function scaleNutrients(n: Nutrients, factor: number): Nutrients {
  return {
    calories: Math.round(n.calories * factor),
    carbs: r1(n.carbs * factor),
    protein: r1(n.protein * factor),
    fat: r1(n.fat * factor),
    fiber: r1((n.fiber ?? 0) * factor),
    sugar: r1((n.sugar ?? 0) * factor),
  };
}

export function sumNutrients(list: Nutrients[]): Nutrients {
  return list.reduce<Nutrients>(
    (acc, n) => ({
      calories: acc.calories + n.calories,
      carbs: r1(acc.carbs + n.carbs),
      protein: r1(acc.protein + n.protein),
      fat: r1(acc.fat + n.fat),
      fiber: r1((acc.fiber ?? 0) + (n.fiber ?? 0)),
      sugar: r1((acc.sugar ?? 0) + (n.sugar ?? 0)),
    }),
    { ...EMPTY_NUTRIENTS },
  );
}

/** Nutrients for `amount` of a food, where amount is in the food's serving unit. */
export function portionNutrients(food: FoodItem, amount: number): Nutrients {
  return scaleNutrients(food.nutrients, amount / food.servingSize);
}

export function mealTotals(items: MealItem[]): Nutrients {
  return sumNutrients(items.map((i) => i.nutrients));
}

export function mealNutrients(meal: Meal): Nutrients {
  return {
    calories: meal.calories,
    carbs: meal.carbs,
    protein: meal.protein,
    fat: meal.fat,
    fiber: meal.fiber ?? 0,
    sugar: meal.sugar ?? 0,
  };
}

export function dayTotals(meals: Meal[]): Nutrients {
  return sumNutrients(meals.map(mealNutrients));
}

export function caloriesByMealType(meals: Meal[]): Record<MealType, number | null> {
  const out: Record<MealType, number | null> = { breakfast: null, lunch: null, dinner: null, snack: null };
  for (const m of meals) out[m.mealType] = (out[m.mealType] ?? 0) + m.calories;
  return out;
}

/** 4/4/9 kcal per gram. Useful for checking custom food entries. */
export function caloriesFromMacros(n: Pick<Nutrients, 'carbs' | 'protein' | 'fat'>): number {
  return Math.round(n.carbs * 4 + n.protein * 4 + n.fat * 9);
}

export function progress(current: number, target: number): number {
  if (target <= 0) return 0;
  return Math.max(0, current / target);
}
