// Calendar dates are date-only values. Formatting them in UTC avoids changing
// the day according to the browser's local timezone.
export function formatCamporeeDate(value: string, options: Intl.DateTimeFormatOptions = {
  day:'numeric', month:'long', year:'numeric',
}): string {
  return new Date(`${value}T12:00:00Z`).toLocaleDateString('es-DO', {...options,timeZone:'UTC'});
}

export function formatCamporeeMoney(value: number, currency = 'DOP', maximumFractionDigits = 0): string {
  return new Intl.NumberFormat('es-DO', {
    style:'currency', currency, maximumFractionDigits,
  }).format(value);
}

// Visible times use the camporee zone and a consistent 12-hour am/pm notation.
export function formatCamporeeTime(value: string | number | Date, timeZone: string): string {
  const date = value instanceof Date ? value : new Date(value);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hour:'2-digit', minute:'2-digit', hourCycle:'h23',
  }).formatToParts(date).map(part => [part.type, part.value]));
  const hour = Number(parts.hour);
  return `${hour % 12 || 12}:${parts.minute} ${hour < 12 ? 'am' : 'pm'}`;
}

export function formatCamporeeDateTime(value: string, timeZone: string, dateStyle: 'short' | 'medium' = 'medium'): string {
  const date = new Date(value);
  return `${new Intl.DateTimeFormat('es-DO', { dateStyle, timeZone }).format(date)}, ${formatCamporeeTime(date, timeZone)}`;
}

// Converts midnight of a civil date in an IANA timezone to a UTC timestamp.
// Iterate against local parts to handle both UTC offsets and daylight saving.
export function camporeeMidnightEpoch(date: string, timeZone = 'America/Santo_Domingo'): number {
  const [year,month,day] = date.split('-').map(Number);
  const target = Date.UTC(year,month-1,day);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23',
  });
  let instant = target;
  for (let i=0;i<3;i++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(part=>[part.type,part.value]));
    const localAsUTC = Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute));
    const adjustment = target-localAsUTC;
    instant+=adjustment;
    if (!adjustment) break;
  }
  return instant;
}

export function camporeeDateTimeInput(value: string | null | undefined, timeZone: string): string {
  if (!value) return '';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23',
  }).formatToParts(new Date(value)).map(part => [part.type,part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function camporeeDateTimeIso(value: string, timeZone: string): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Fecha u hora inválida.');
  const target = Date.parse(`${value}:00Z`);
  let instant = target;
  for (let i=0;i<3;i++) {
    const local = camporeeDateTimeInput(new Date(instant).toISOString(),timeZone);
    const adjustment = target-Date.parse(`${local}:00Z`);
    instant += adjustment;
    if (!adjustment) break;
  }
  const result = new Date(instant).toISOString();
  if (camporeeDateTimeInput(result,timeZone) !== value) throw new Error('Esa hora no existe en la zona horaria del camporee.');
  return result;
}
