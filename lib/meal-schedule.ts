/** Meal times are wall-clock times in the camporee zone, never the device zone. */
export const DEFAULT_MEAL_TIMES: Readonly<Record<string, string>> = {
  breakfast: '08:00', snack_am: '10:00', lunch: '12:30',
  snack_pm: '16:00', dinner: '19:00', other: '12:00',
};
export type ScheduledMeal = { meal_date: string; meal_type: string; meal_time?: string | null };
export const DEFAULT_MEAL_TIME_ZONE = 'America/Santo_Domingo';

export function normalizeMealTime(value: string | null | undefined): string | null {
  // PostgreSQL returns HH:mm:ss; the editor and schema use minute precision.
  return value && /^([01]\d|2[0-3]):[0-5]\d(?::00(?:\.0+)?)?$/.test(value)
    ? value.slice(0, 5) : null;
}
export function mealTime(meal: Pick<ScheduledMeal, 'meal_type' | 'meal_time'>): string {
  return normalizeMealTime(meal.meal_time) ?? DEFAULT_MEAL_TIMES[meal.meal_type] ?? '';
}
export function formatMealTime(value: string): string {
  const time = normalizeMealTime(value);
  if (!time) return 'Sin hora';
  const hour = Number(time.slice(0, 2));
  return `${hour % 12 || 12}:${time.slice(3)} ${hour < 12 ? 'a. m.' : 'p. m.'}`;
}
export function camporeeLocalClock(now: Date, timeZone = DEFAULT_MEAL_TIME_ZONE): string | null {
  if (!Number.isFinite(now.getTime())) return null;
  const options: Intl.DateTimeFormatOptions = {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  };
  let formatter: Intl.DateTimeFormat;
  try { formatter = new Intl.DateTimeFormat('en-CA', options); }
  catch { formatter = new Intl.DateTimeFormat('en-CA', { ...options, timeZone: DEFAULT_MEAL_TIME_ZONE }); }
  const parts = Object.fromEntries(formatter.formatToParts(now).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
export function hasMealTimePassed(meal: ScheduledMeal, localClock: string | null): boolean {
  if (!localClock || !/^\d{4}-\d{2}-\d{2}$/.test(meal.meal_date)) return false;
  const date = new Date(`${meal.meal_date}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== meal.meal_date) return false;
  const time = mealTime(meal);
  // Unknown legacy types without a time are only past once their day has ended.
  return time ? `${meal.meal_date}T${time}` <= localClock : meal.meal_date < localClock.slice(0, 10);
}
