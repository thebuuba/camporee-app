export type LaunchSchedule = {
  legado: boolean; status: string; startsOn: string; endsOn: string; timeZone: string;
};
export type LaunchCamporee = {
  name: string; theme?: string | null; status: string; starts_on: string; ends_on: string; time_zone: string;
};
export function launchSchedule(event: LaunchCamporee): LaunchSchedule {
  return { legado: /\blegado\b/i.test(`${event.name} ${event.theme ?? ''}`), status: event.status,
    startsOn: event.starts_on, endsOn: event.ends_on, timeZone: event.time_zone };
}
export function isLegadoLaunch(event: LaunchSchedule | null, now: number): boolean {
  if (!event?.legado || event.status !== 'active' || !/^\d{4}-\d{2}-\d{2}$/.test(event.startsOn) || !/^\d{4}-\d{2}-\d{2}$/.test(event.endsOn)) return false;
  try {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: event.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    return date >= event.startsOn && date <= event.endsOn;
  } catch { return false; }
}
export function launchScope(pathname: string, search = ''): string | null {
  const path = pathname === '/offline' ? new URLSearchParams(search).get('from') ?? '' : pathname;
  const match = /^\/o\/([a-f0-9-]{36})\/c\/([a-f0-9-]{36})(?:\/|$)/i.exec(path);
  return match ? `${match[1]}:${match[2]}` : null;
}
export function readLaunchSchedule(storage: Pick<Storage, 'getItem'> | null, scope: string | null): LaunchSchedule | null {
  if (!scope) return null;
  try {
    const value = JSON.parse(storage?.getItem(`camporee:launch:${scope}`) ?? 'null');
    return value && typeof value.legado === 'boolean' && ['status','startsOn','endsOn','timeZone'].every(key => typeof value[key] === 'string') ? value : null;
  } catch { return null; }
}
/** Installed apps start at / even offline; retain only the last public event scope. */
export function offlineLaunchScope(storage: Pick<Storage, 'getItem'> | null, search: string): string | null {
  const explicit = launchScope('/offline', search);
  if (explicit) return explicit;
  const from = new URLSearchParams(search).get('from');
  if (from && from !== '/') return null;
  try {
    const saved = storage?.getItem('camporee:launch:last-scope') ?? '';
    return /^[a-f0-9-]{36}:[a-f0-9-]{36}$/i.test(saved) ? saved : null;
  } catch { return null; }
}
