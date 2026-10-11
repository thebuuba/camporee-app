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
