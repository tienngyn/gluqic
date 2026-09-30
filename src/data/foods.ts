import type { FoodItem } from '@/types/models';

type Row = [
  id: string,
  name: string,
  serving: number,
  unit: FoodItem['servingUnit'],
  label: string | undefined,
  kcal: number,
  carbs: number,
  protein: number,
  fat: number,
  fiber: number,
  sugar: number,
  brand?: string,
  barcode?: string,
];

// Nutrients per serving. Values are typical reference values for prototyping.
const rows: Row[] = [
  ['bread-roll', 'Bread roll', 1, 'piece', '1 roll (60 g)', 165, 31, 5.5, 1.2, 1.6, 1.5],
  ['butter', 'Butter', 10, 'g', '1 pat (10 g)', 72, 0.1, 0.1, 8.1, 0, 0.1],
  ['coffee-milk', 'Coffee with milk', 250, 'ml', '1 mug', 38, 3.3, 2.1, 1.9, 0, 3.3],
  ['greek-yogurt', 'Greek yogurt 2%', 150, 'g', '1 pot (150 g)', 110, 6, 15, 3, 0, 6, 'Fage', '5200435000027'],
  ['oats', 'Rolled oats', 100, 'g', undefined, 372, 58.7, 13.5, 7, 10, 1],
  ['banana', 'Banana', 1, 'piece', '1 medium (118 g)', 105, 27, 1.3, 0.4, 3.1, 14.4],
  ['apple', 'Apple', 1, 'piece', '1 medium (180 g)', 95, 25, 0.5, 0.3, 4.4, 19],
  ['blueberries', 'Blueberries', 100, 'g', undefined, 57, 14.5, 0.7, 0.3, 2.4, 10],
  ['egg', 'Egg', 1, 'piece', '1 large', 72, 0.4, 6.3, 4.8, 0, 0.2],
  ['sourdough', 'Sourdough bread', 1, 'piece', '1 slice (50 g)', 130, 25, 4.5, 0.8, 1.2, 0.6],
  ['avocado', 'Avocado', 100, 'g', undefined, 160, 8.5, 2, 14.7, 6.7, 0.7],
  ['granola', 'Granola', 100, 'g', undefined, 471, 64, 10, 20, 7, 24, 'Kellogg’s', '5059319030258'],
  ['milk', 'Milk 1.5%', 250, 'ml', '1 glass', 118, 12, 8.5, 3.8, 0, 12],
  ['chicken-breast', 'Chicken breast, grilled', 100, 'g', undefined, 165, 0, 31, 3.6, 0, 0],
  ['basmati', 'Basmati rice, cooked', 100, 'g', undefined, 130, 28, 2.7, 0.3, 0.4, 0.1],
  ['pasta', 'Pasta, cooked', 100, 'g', undefined, 158, 31, 5.8, 0.9, 1.8, 0.6],
  ['bolognese', 'Bolognese sauce', 150, 'g', '1 portion', 180, 9, 12, 10.5, 2, 6],
  ['pizza-margherita', 'Pizza Margherita', 1, 'piece', '1 pizza (320 g)', 850, 98, 34, 34, 5, 8],
  ['salmon', 'Salmon fillet', 100, 'g', undefined, 208, 0, 20, 13, 0, 0],
  ['sweet-potato', 'Sweet potato, baked', 100, 'g', undefined, 90, 20.7, 2, 0.2, 3.3, 6.5],
  ['broccoli', 'Broccoli', 100, 'g', undefined, 34, 6.6, 2.8, 0.4, 2.6, 1.7],
  ['mixed-salad', 'Mixed salad', 100, 'g', undefined, 20, 3.5, 1.4, 0.2, 1.8, 2],
  ['olive-oil', 'Olive oil', 10, 'ml', '1 tbsp', 88, 0, 0, 10, 0, 0],
  ['burrito-bowl', 'Burrito bowl', 1, 'piece', '1 bowl', 640, 72, 38, 21, 13, 5],
  ['sushi', 'Salmon sushi roll', 1, 'piece', '8 pieces', 380, 62, 14, 8, 3, 9],
  ['almonds', 'Almonds', 30, 'g', '1 handful', 174, 6.5, 6.3, 15, 3.8, 1.3],
  ['protein-bar', 'Protein bar', 1, 'piece', '1 bar (60 g)', 212, 20, 20, 7, 4, 2, 'Barebells', '7340001802358'],
  ['dark-chocolate', 'Dark chocolate 85%', 20, 'g', '2 squares', 120, 4, 2.2, 10, 2.8, 2.8, 'Lindt', '3046920028363'],
  ['cola-zero', 'Cola Zero', 330, 'ml', '1 can', 1, 0, 0, 0, 0, 0, 'Coca-Cola', '5449000131805'],
  ['orange-juice', 'Orange juice', 200, 'ml', '1 glass', 90, 20.8, 1.4, 0.4, 0.4, 16.8],
  ['hummus', 'Hummus', 50, 'g', '2 tbsp', 125, 7, 4, 9.5, 3, 0.3],
  ['whole-wheat-wrap', 'Whole wheat wrap', 1, 'piece', '1 wrap (64 g)', 190, 31, 6, 4.5, 4, 1.5],
  ['skyr', 'Skyr natural', 150, 'g', '1 pot', 95, 6, 16.5, 0.3, 0, 6, 'Arla', '5711953068881'],
  ['peanut-butter', 'Peanut butter', 15, 'g', '1 tbsp', 94, 3, 3.8, 7.5, 1, 1],
  ['lentil-soup', 'Lentil soup', 300, 'ml', '1 bowl', 250, 36, 15, 5, 11, 4],
];

export const MOCK_FOODS: FoodItem[] = rows.map(
  ([id, name, servingSize, servingUnit, servingLabel, calories, carbs, protein, fat, fiber, sugar, brand, barcode]) => ({
    id,
    name,
    brand,
    barcode,
    servingSize,
    servingUnit,
    servingLabel,
    nutrients: { calories, carbs, protein, fat, fiber, sugar },
    source: 'mock',
  }),
);

export const FOOD_BY_ID: Record<string, FoodItem> = Object.fromEntries(MOCK_FOODS.map((f) => [f.id, f]));
