/** Shared chronological order for the meals screen and its printable menu. */
export const MEAL_TYPES = [
  ['breakfast', 'Desayuno'],
  ['snack_am', 'Merienda AM'],
  ['lunch', 'Comida'],
  ['snack_pm', 'Merienda PM'],
  ['dinner', 'Cena'],
  ['other', 'Otro'],
] as const;

export type MenuMeal = {
  meal_date: string;
  meal_type: string;
  menu: string;
};

export function mealLabel(type: string): string {
  return MEAL_TYPES.find(([key]) => key === type)?.[1] ?? type;
}

function mealOrder(type: string): number {
  const index = MEAL_TYPES.findIndex(([key]) => key === type);
  return index < 0 ? MEAL_TYPES.length : index;
}

export function sortMealsForMenu<T extends MenuMeal>(meals: readonly T[]): T[] {
  return [...meals].sort((a, b) =>
    a.meal_date.localeCompare(b.meal_date) || mealOrder(a.meal_type) - mealOrder(b.meal_type),
  );
}

export function groupMealsForMenu<T extends MenuMeal>(meals: readonly T[]) {
  const days = new Map<string, T[]>();
  for (const meal of sortMealsForMenu(meals)) {
    const entries = days.get(meal.meal_date) ?? [];
    entries.push(meal);
    days.set(meal.meal_date, entries);
  }
  return [...days].map(([date, entries]) => ({ date, meals: entries }));
}

export function formatMenuDate(date: string, options: Intl.DateTimeFormatOptions): string {
  // A meal_date is a calendar day, not an instant in the viewer's time zone.
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat('es-DO', { ...options, timeZone: 'UTC' }).format(parsed);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

/** Self-contained, script-free document: no app navigation, theme or remote assets. */
export function buildMealMenuDocument(meals: readonly MenuMeal[], camporeeName: string): string {
  const days = groupMealsForMenu(meals);
  const name = escapeHtml(camporeeName.trim() || 'Camporee');
  const dateOptions: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };
  const range = days.length
    ? [formatMenuDate(days[0].date, dateOptions), ...(days.length > 1 ? [formatMenuDate(days[days.length - 1].date, dateOptions)] : [])].join(' — ')
    : 'Sin comidas planificadas';
  const sections = days.map(({ date, meals: entries }, index) => `
    <section class="day" aria-label="${escapeHtml(formatMenuDate(date, { weekday: 'long', day: 'numeric', month: 'long' }))}">
      <header class="day-heading">
        <span class="day-number">DÍA ${String(index + 1).padStart(2, '0')}</span>
        <h2>${escapeHtml(formatMenuDate(date, { weekday: 'long' }))}</h2>
        <p>${escapeHtml(formatMenuDate(date, { day: 'numeric', month: 'long' }))}</p>
      </header>
      <dl class="meals">${entries.map(meal => `
        <div class="meal">
          <dt>${escapeHtml(mealLabel(meal.meal_type))}</dt>
          <dd>${escapeHtml(meal.menu)}</dd>
        </div>`).join('')}
      </dl>
    </section>`).join('');

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
  <title>Menú — ${name}</title>
  <style>
    * { box-sizing: border-box; }
    html { color-scheme: light; }
    body { margin: 0; background: #edf1ed; color: #23382f; font-family: Arial, Helvetica, sans-serif; }
    .menu { max-width: 186mm; margin: 20px auto; padding: 28px; background: #fff; border-radius: 18px; }
    .masthead { padding-bottom: 19px; margin-bottom: 19px; border-bottom: 3px solid #d5a849; }
    .eyebrow { margin: 0 0 12px; color: #526b5e; font-size: 9px; font-weight: 700; letter-spacing: 2px; }
    .hero { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
    h1 { margin: 0 0 6px; font-size: 38px; line-height: 1; letter-spacing: -1.5px; }
    .event { margin: 0; font-size: 15px; font-weight: 700; overflow-wrap: anywhere; }
    .date-range { margin: 10px 0 0; color: #526b5e; font-size: 11px; line-height: 1.5; }
    .badge { flex-shrink: 0; padding: 9px 12px; border: 1px solid #d8e3d9; border-radius: 12px; background: #eff5ed; font-size: 11px; font-weight: 700; text-align: center; line-height: 1.6; }
    .badge strong { display: block; font-size: 20px; }
    .day { display: grid; grid-template-columns: 120px minmax(0, 1fr); margin-bottom: 13px; border: 1px solid #d9e2da; border-radius: 12px; break-inside: avoid; page-break-inside: avoid; }
    .day-heading { padding: 15px 12px; background: #eff5ed; border-radius: 11px 0 0 11px; border-right: 1px solid #d9e2da; }
    .day:nth-of-type(even) .day-heading { background: #fbf5e8; }
    .day-number { font-size: 8px; font-weight: 700; letter-spacing: 1.5px; color: #647769; }
    h2 { margin: 5px 0 4px; font-size: 18px; text-transform: capitalize; }
    .day-heading p { margin: 0; font-size: 10px; color: #526b5e; line-height: 1.5; }
    .meals { margin: 0; padding: 4px 13px; align-self: center; width: 100%; }
    .meal { display: grid; grid-template-columns: 87px minmax(0, 1fr); gap: 8px; padding: 10px 0; }
    .meal + .meal { border-top: 1px solid #e6ece5; }
    dt { font-size: 10px; line-height: 1.6; font-weight: 700; color: #64745b; }
    dd { margin: 0; font-size: 12px; line-height: 1.5; white-space: pre-wrap; overflow-wrap: anywhere; }
    footer { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; margin-top: 17px; padding-top: 12px; border-top: 1px solid #d9e2da; color: #637367; font-size: 9px; line-height: 1.5; }
    .empty { padding: 28px 0; font-size: 13px; }
    @media screen and (max-width: 540px) {
      .menu { margin: 0; padding: 18px; border-radius: 0; }
      h1 { font-size: 32px; }
      .day { display: block; }
      .day-heading { padding: 10px 13px; border-right: 0; border-bottom: 1px solid #d9e2da; border-radius: 11px 11px 0 0; }
      .day-heading h2 { display: inline; margin-right: 8px; }
      .day-heading p { display: inline; }
      .day-number { display: block; margin-bottom: 5px; }
      .meal { grid-template-columns: 77px minmax(0, 1fr); }
    }
    @page { size: auto; margin: 12mm; }
    @media print {
      html, body { background: #fff; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .menu { width: 100%; max-width: none; margin: 0; padding: 0; border-radius: 0; }
      .masthead { break-after: avoid; page-break-after: avoid; }
      .day { margin-bottom: 11px; }
      .meal { padding: 8px 0; }
      footer { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <main class="menu">
    <header class="masthead">
      <p class="eyebrow">CAMPOREE APP / ALIMENTACIÓN</p>
      <div class="hero">
        <div><h1>Menú del camporee</h1><p class="event">${name}</p></div>
        <div class="badge"><strong>${days.length}</strong>${days.length === 1 ? 'día' : 'días'}</div>
      </div>
      <p class="date-range">${escapeHtml(range)}</p>
    </header>
    ${sections || '<p class="empty">Todavía no hay comidas planificadas.</p>'}
    <footer><span>Compartimos la mesa. Vivimos el camporee.</span><span>${meals.length} ${meals.length === 1 ? 'comida planificada' : 'comidas planificadas'}</span></footer>
  </main>
</body>
</html>`;
}
