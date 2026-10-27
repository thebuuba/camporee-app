type Stock = { id: string; quantity: number | string; unit?: string | null };
type Ingredient = { id: string; required_quantity: number | string; unit?: string | null; inventory_item_id?: string | null };
type Meal = { id: string; meal_date: string; meal_ingredients?: Ingredient[] };
const units: Record<string, [string, number]> = {
  kg: ['mass', 1000], kilogramo: ['mass', 1000], kilogramos: ['mass', 1000],
  g: ['mass', 1], gr: ['mass', 1], gramo: ['mass', 1], gramos: ['mass', 1],
  l: ['volume', 1000], litro: ['volume', 1000], litros: ['volume', 1000],
  ml: ['volume', 1], mililitro: ['volume', 1], mililitros: ['volume', 1],
  ud: ['count', 1], uds: ['count', 1], unidad: ['count', 1], unidades: ['count', 1],
};
function unit(value?: string | null): [string, number] {
  const normalized = (value || '').trim().toLowerCase();
  return units[normalized] || [normalized, 1];
}

// This is a planning allocation, ordered by date/id; it does not change persisted stock.
export function allocateMealStock(meals: Meal[], inventory: Stock[]) {
  const stocks = new Map(inventory.map(item => [item.id, item]));
  const remaining = new Map(inventory.map(item => [item.id, Math.max(0, Number(item.quantity) || 0)]));
  const result = new Map<string, { missing: number; mismatch: boolean }>();
  for (const meal of [...meals].sort((a, b) => a.meal_date.localeCompare(b.meal_date) || a.id.localeCompare(b.id))) {
    for (const ingredient of [...(meal.meal_ingredients || [])].sort((a, b) => a.id.localeCompare(b.id))) {
      const required = Math.max(0, Number(ingredient.required_quantity) || 0);
      const stock = stocks.get(ingredient.inventory_item_id || '');
      const [demandUnit, demandFactor] = unit(ingredient.unit);
      const [stockUnit, stockFactor] = unit(stock?.unit);
      const mismatch = Boolean(stock && demandUnit !== stockUnit);
      const available = stock && !mismatch ? (remaining.get(stock.id) || 0) * stockFactor / demandFactor : 0;
      const allocated = Math.min(required, available);
      if (stock && !mismatch) remaining.set(stock.id, Math.max(0, (remaining.get(stock.id) || 0) - allocated * demandFactor / stockFactor));
      result.set(ingredient.id, { missing: Number((required - allocated).toFixed(6)), mismatch });
    }
  }
  return result;
}
