/** Primary choices match the menu; legacy morning snacks remain supported. */
export const MEAL_TYPES = [
  ['breakfast', 'Desayuno'],
  ['lunch', 'Almuerzo'],
  ['snack_pm', 'Merienda'],
  ['dinner', 'Cena'],
  ['snack_am', 'Merienda AM'],
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
  const order = ['breakfast', 'snack_am', 'lunch', 'snack_pm', 'dinner', 'other'];
  const index = order.indexOf(type);
  return index < 0 ? order.length : index;
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

// Fixed inline line icons: no remote images, emoji fonts or user-provided SVG.
const ICON_PATHS = {
  camp: '<path d="m3 20 9-16 9 16H3Z"/><path d="m8 20 4-7 4 7M9 3l3 1 3-1"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M16 3v4M8 3v4M3 11h18M8 15h2M14 15h2"/>',
  coffee: '<path d="M17 8h1a4 4 0 0 1 0 8h-1M3 8h14v9a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3ZM6 2v2M10 2v2M14 2v2"/>',
  utensils: '<path d="M4 3v6a2 2 0 0 0 4 0V3M6 3v18M20 21V3c-4 0-5 6-5 10h5"/>',
  snack: '<path d="m5 6 1.5 14h11L19 6H5ZM4 6h16M11 6l2-4h4M6 11h12"/>',
  soup: '<path d="M3 12h18a9 9 0 0 1-18 0ZM6 21h12M7 3c-2 2 2 3 0 5M12 3c-2 2 2 3 0 5M17 3c-2 2 2 3 0 5"/>',
} as const;

function menuIcon(name: keyof typeof ICON_PATHS): string {
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON_PATHS[name]}</svg>`;
}

function mealAppearance(type: string): { tone: string; icon: keyof typeof ICON_PATHS } {
  switch (type) {
    case 'breakfast': return { tone: 'peach', icon: 'coffee' };
    case 'lunch': return { tone: 'sage', icon: 'utensils' };
    case 'snack_am':
    case 'snack_pm': return { tone: 'yellow', icon: 'snack' };
    case 'dinner': return { tone: 'pink', icon: 'soup' };
    default: return { tone: 'peach', icon: 'utensils' };
  }
}

function menuDateRange(days: readonly { date: string }[]): string {
  if (!days.length) return 'Sin comidas planificadas';
  const first = days[0].date;
  const last = days[days.length - 1].date;
  const full: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };
  if (first === last) return formatMenuDate(first, full);
  if (/^\d{4}-\d{2}-\d{2}$/.test(first) && first.slice(0, 7) === last.slice(0, 7)) {
    return `${formatMenuDate(first, { day: 'numeric' })}–${formatMenuDate(last, full)}`;
  }
  return `${formatMenuDate(first, full)} — ${formatMenuDate(last, full)}`;
}

/** Script-free, offline-safe print document using the app's light Polymet palette.
 * The client shares the app's already loaded Poppins faces before enabling print.
 * Never copy the live cards: their elapsed/strike-through state is screen-only.
 */
export function buildMealMenuDocument(meals: readonly MenuMeal[], camporeeName: string): string {
  const days = groupMealsForMenu(meals);
  const name = escapeHtml(camporeeName.trim() || 'Camporee');
  const sections = days.map(({ date, meals: entries }) => `
    <section class="day" aria-label="${escapeHtml(formatMenuDate(date, { weekday: 'long', day: 'numeric', month: 'long' }))}">
      <header class="day-heading">
        <span class="day-icon">${menuIcon('calendar')}</span>
        <div class="day-copy"><h2>${escapeHtml(formatMenuDate(date, { weekday: 'long' }))}</h2><p>${escapeHtml(formatMenuDate(date, { day: 'numeric', month: 'long' }))}</p></div>
        <span class="day-count">${entries.length} ${entries.length === 1 ? 'comida' : 'comidas'}</span>
      </header>
      <dl class="meals">${entries.map(meal => {
        const { tone, icon } = mealAppearance(meal.meal_type);
        return `
        <div class="meal">
          <dt><span class="meal-icon tone-${tone}">${menuIcon(icon)}</span><span>${escapeHtml(mealLabel(meal.meal_type))}</span></dt>
          <dd>${escapeHtml(meal.menu)}</dd>
        </div>`;
      }).join('')}
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
    /* Match app/polymet-theme.css and app/polymet-panels-b.css, not the legacy green theme. */
    :root { --pm-bg: #fdf8f5; --pm-ink: #2b211c; --pm-muted: #827973; --pm-orange: #fa8943; --pm-peach: #fde9dd; --pm-sage: #e2ebd6; --pm-line: #f0e9e3; }
    * { box-sizing: border-box; }
    html { color-scheme: light; }
    body { margin: 0; background: var(--pm-bg); color: var(--pm-ink); font-family: Poppins, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; -webkit-font-smoothing: antialiased; }
    svg { display: block; flex-shrink: 0; }
    .menu { max-width: 186mm; margin: 24px auto; padding: 24px; background: #fff; border-radius: 28px; }
    .masthead { padding: 18px 22px; margin-bottom: 16px; background: var(--pm-bg); border: 1px solid var(--pm-line); border-radius: 24px; break-inside: avoid; }
    .brand-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
    .brand { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; font-weight: 600; }
    .brand svg { color: #b45120; width: 19px; height: 19px; }
    .kicker { color: var(--pm-muted); font-size: 10px; }
    .title-row { display: flex; align-items: center; justify-content: space-between; gap: 18px; }
    .title-copy { min-width: 0; }
    h1 { margin: 0 0 5px; font-size: 30px; line-height: 1.15; font-weight: 600; letter-spacing: -.045em; }
    .event { margin: 0; color: #6c625b; font-size: 13px; font-weight: 500; line-height: 1.5; overflow-wrap: anywhere; }
    .hero-icon { width: 54px; height: 54px; flex: 0 0 54px; border-radius: 50%; display: grid; place-items: center; background: var(--pm-peach); color: #a14f23; }
    .hero-icon svg { width: 27px; height: 27px; }
    .date-range { display: inline-flex; align-items: center; gap: 7px; margin: 13px 0 0; padding: 5px 11px; background: #fff; border: 1px solid #f1e5dc; border-radius: 999px; color: #6c625b; font-size: 10px; line-height: 1.5; }
    .date-range svg { width: 13px; height: 13px; color: #a14f23; }
    .day { margin: 0 0 12px; padding: 0 16px 3px; border: 1px solid var(--pm-line); border-radius: 22px; background: #fff; break-inside: avoid; page-break-inside: avoid; box-shadow: 0 3px 12px rgba(84,56,39,.035); }
    .day-heading { display: flex; align-items: center; gap: 10px; padding: 11px 0 10px; border-bottom: 1px solid var(--pm-line); break-after: avoid; }
    .day-icon { display: grid; place-items: center; width: 34px; height: 34px; flex: 0 0 34px; background: var(--pm-peach); color: #a14f23; border-radius: 50%; }
    .day-icon svg { width: 17px; height: 17px; }
    .day-copy { min-width: 0; flex: 1; }
    h2 { margin: 0; font-size: 15px; font-weight: 600; line-height: 1.3; letter-spacing: -.025em; text-transform: capitalize; overflow-wrap: anywhere; }
    .day-copy p { margin: 2px 0 0; color: var(--pm-muted); font-size: 10px; line-height: 1.4; }
    .day-count { padding: 4px 9px; border-radius: 999px; background: #f6f2ee; color: #6c625b; font-size: 9px; white-space: nowrap; }
    .meals { margin: 0; padding: 0; }
    .meal { display: grid; grid-template-columns: 115px minmax(0, 1fr); align-items: center; gap: 12px; padding: 9px 0; break-inside: avoid; page-break-inside: avoid; }
    .meal + .meal { border-top: 1px solid #f5f0ec; }
    dt { display: flex; align-items: center; gap: 8px; min-width: 0; font-size: 10.5px; font-weight: 500; line-height: 1.4; overflow-wrap: anywhere; }
    .meal-icon { width: 28px; height: 28px; flex: 0 0 28px; border-radius: 50%; display: grid; place-items: center; }
    .meal-icon svg { width: 15px; height: 15px; }
    .tone-peach { background: var(--pm-peach); color: #a14f23; }
    .tone-sage { background: var(--pm-sage); color: #39543b; }
    .tone-yellow { background: #fff3c5; color: #a96b20; }
    .tone-pink { background: #fde7e9; color: #d53558; }
    dd { margin: 0; min-width: 0; font-size: 12px; line-height: 1.6; font-weight: 400; white-space: pre-wrap; overflow-wrap: anywhere; }
    footer { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 6px 12px; margin-top: 14px; padding: 0 3px; color: var(--pm-muted); font-size: 9px; line-height: 1.5; }
    .empty { padding: 24px; border: 1px dashed var(--pm-line); border-radius: 22px; color: var(--pm-muted); font-size: 12px; text-align: center; }
    @media screen and (max-width: 540px) {
      .menu { margin: 0; padding: 12px; border-radius: 0; }
      .masthead { padding: 16px; margin-bottom: 12px; border-radius: 22px; }
      .brand-row { gap: 8px; margin-bottom: 12px; }
      h1 { font-size: 25px; }
      .hero-icon { width: 43px; height: 43px; flex-basis: 43px; }
      .hero-icon svg { width: 22px; height: 22px; }
      .title-row { gap: 10px; }
      .event { font-size: 11px; }
      .kicker { font-size: 9px; }
      .day { padding-right: 12px; padding-left: 12px; }
      .meal { grid-template-columns: 96px minmax(0, 1fr); gap: 8px; }
      dt { font-size: 10px; gap: 6px; }
      dd { font-size: 11px; }
      .meal-icon { width: 24px; height: 24px; flex-basis: 24px; }
    }
    @page { size: letter portrait; margin: 10mm; }
    @media print {
      html, body { background: #fff; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .menu { width: 100%; max-width: none; margin: 0; padding: 0; border-radius: 0; }
      /* Leave room for all four days and eleven meals on Letter at 100%.
         Keep text readable; compact the decorative space, never clip content. */
      .masthead { padding: 12px 16px; margin-bottom: 10px; break-after: avoid; page-break-after: avoid; }
      .brand-row { margin-bottom: 8px; }
      h1 { font-size: 26px; }
      .hero-icon { width: 44px; height: 44px; flex-basis: 44px; }
      .date-range { margin-top: 8px; padding: 3px 9px; }
      .day { margin-bottom: 8px; padding: 0 14px 2px; box-shadow: none; }
      .day-heading { padding: 7px 0 6px; }
      .day-icon { width: 28px; height: 28px; flex-basis: 28px; }
      .meal { padding: 5px 0; }
      .meal-icon { width: 24px; height: 24px; flex-basis: 24px; }
      dd { line-height: 1.5; }
      footer { margin-top: 8px; break-inside: avoid; }
    }
  </style>
</head>
<body>
  <main class="menu" data-design="camporee-polymet">
    <header class="masthead">
      <div class="brand-row"><span class="brand">${menuIcon('camp')}Camporee</span><span class="kicker">Plan de alimentación</span></div>
      <div class="title-row"><div class="title-copy"><h1>Menú del camporee</h1><p class="event">${name}</p></div><span class="hero-icon">${menuIcon('utensils')}</span></div>
      <p class="date-range">${menuIcon('calendar')}<span>${escapeHtml(menuDateRange(days))}</span></p>
    </header>
    ${sections || '<p class="empty">Todavía no hay comidas planificadas.</p>'}
    <footer><span>${days.length} ${days.length === 1 ? 'día' : 'días'} de camporee</span><span>${meals.length} ${meals.length === 1 ? 'comida planificada' : 'comidas planificadas'}</span></footer>
  </main>
</body>
</html>`;
}
