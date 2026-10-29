export type IntroEvent = { starts_on:string; ends_on:string; status:string; time_zone:string };
export type SabbathPeriod = { key:string; sunsetAt:number; weekday:number };
export type EventIntro = { kind:'camporee'|'sabbath'; key:string };
const civilDate = (now:number,timeZone:string) => new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);

export function regionalSabbathPeriod(now:number, sunset:{date:string;weekday:number;sunsetAt:number}|null):SabbathPeriod|null {
  if (!sunset || !Number.isFinite(sunset.sunsetAt)) return null;
  // Never use yesterday's response while today's astronomical time is loading.
  if (civilDate(now,'America/Santo_Domingo') !== sunset.date) return null;
  if (sunset.weekday === 5 && now >= sunset.sunsetAt) return {key:sunset.date,sunsetAt:sunset.sunsetAt,weekday:5};
  if (sunset.weekday === 6 && now < sunset.sunsetAt) {
    const friday = new Date(Date.parse(`${sunset.date}T12:00:00Z`)-86400000).toISOString().slice(0,10);
    return {key:friday,sunsetAt:sunset.sunsetAt,weekday:6};
  }
  return null;
}

export function eventIntroCandidates(event:IntroEvent, now:number, sabbath:SabbathPeriod|null):EventIntro[] {
  const today=civilDate(now,event.time_zone);
  if (['finished','archived'].includes(event.status) || today<event.starts_on || today>event.ends_on) return [];
  const candidates:EventIntro[]=[];
  if (today===event.starts_on) candidates.push({kind:'camporee',key:`camporee:${event.starts_on}`});
  if (sabbath) candidates.push({kind:'sabbath',key:`sabbath:${event.starts_on}:${sabbath.key}`});
  return candidates;
}

const claimed = new Set<string>();
export function claimEventIntro(storage:Pick<Storage,'getItem'|'setItem'>|null, scope:string, introKey:string) {
  const key=`camporee:intro:${scope}:${introKey}`;
  if(claimed.has(key))return false;
  try {
    if(storage?.getItem(key)==='seen'){claimed.add(key);return false;}
    storage?.setItem(key,'seen');
  } catch { /* Storage restrictions must never prevent entry into the app. */ }
  claimed.add(key);
  return true;
}
