export type TimeOfDay='madrugada'|'amanecer'|'manana'|'tarde'|'atardecer'|'noche';
export function getTimeOfDay(hour:number):TimeOfDay {
  return hour<5?'madrugada':hour<8?'amanecer':hour<12?'manana':hour<17.5?'tarde':hour<20.5?'atardecer':'noche';
}
export const sceneCoordinate=(value:number)=>Math.round(value*1000)/1000;
export function camporeeClock(now:number,timeZone:string){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).map(part=>[part.type,part.value]));
  const date=`${parts.year}-${parts.month}-${parts.day}`;
  return {date,hour:Number(parts.hour)+Number(parts.minute)/60,hm:`${parts.hour}:${parts.minute}`,weekday:new Date(`${date}T12:00:00Z`).getUTCDay()};
}
export function splitDuration(milliseconds:number){
  const ms=Math.max(0,milliseconds);
  return {days:Math.floor(ms/86400000),hours:Math.floor(ms/3600000)%24,minutes:Math.floor(ms/60000)%60,seconds:Math.floor(ms/1000)%60};
}
export type CardScheduleEvent={id:string;title:string;starts_at:string;ends_at?:string|null;location?:string|null};
export type CardTask={id:string;title:string;areas?:{name:string}|null};
export type CardResult={id:string;title:string;activity_type:string;score:number|null;result:string|null};
export type CamporeeCardData={organizationName:string;canEditTasks:boolean;tasks:CardTask[];schedule:CardScheduleEvent[];results:CardResult[];resultCount:number;people:{id:string;full_name:string}[];loadError:boolean};

export function liveSchedule<T extends {starts_at:string;ends_at?:string|null}>(events:T[],now:number,timeZone:string){
  const today=camporeeClock(now,timeZone).date;
  const ordered=[...events].sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at));
  const current=ordered.find(event=>Date.parse(event.starts_at)<=now&&now<(event.ends_at?Date.parse(event.ends_at):Date.parse(event.starts_at)+3600000))??null;
  const upcoming=ordered.filter(event=>Date.parse(event.starts_at)>now&&camporeeClock(Date.parse(event.starts_at),timeZone).date===today);
  const progress=current?Math.min(100,Math.max(0,(now-Date.parse(current.starts_at))/((current.ends_at?Date.parse(current.ends_at):Date.parse(current.starts_at)+3600000)-Date.parse(current.starts_at))*100)):0;
  return {current,upcoming,progress};
}

export function sabbathState(events:{title:string;starts_at:string}[],now:number,timeZone:string){
  const normalized=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const clock=camporeeClock(now,timeZone);
  const civilDay=Date.parse(`${clock.date}T00:00:00Z`);
  // Pair only this week's recorded reception/farewell. No guessed astronomical times.
  const friday=new Date(civilDay-((clock.weekday+2)%7)*86400000).toISOString().slice(0,10);
  const saturday=new Date(Date.parse(friday)+86400000).toISOString().slice(0,10);
  const reception=events.find(event=>/recepcion.*sabado/.test(normalized(event.title))&&camporeeClock(Date.parse(event.starts_at),timeZone).date===friday);
  const farewell=events.find(event=>/despedida.*sabado/.test(normalized(event.title))&&camporeeClock(Date.parse(event.starts_at),timeZone).date===saturday);
  const startsAt=reception?Date.parse(reception.starts_at):null;
  const endsAt=farewell?Date.parse(farewell.starts_at):null;
  const active=startsAt!==null&&endsAt!==null?now>=startsAt&&now<endsAt:clock.weekday===6&&(endsAt===null||now<endsAt);
  return {active,endsAt};
}

export function camporeeDayWindow(startsOn:string,endsOn:string,today:string){
  const start=Date.parse(`${startsOn}T00:00:00Z`);
  const totalDays=Math.max(1,Math.round((Date.parse(`${endsOn}T00:00:00Z`)-start)/86400000)+1);
  const currentDay=Math.min(totalDays,Math.max(1,Math.round((Date.parse(`${today}T00:00:00Z`)-start)/86400000)+1));
  const offset=Math.max(0,Math.min(totalDays-7,currentDay-4));
  const days=Array.from({length:Math.min(7,totalDays)},(_,i)=>{const date=new Date(start+(offset+i)*86400000);return {number:offset+i+1,label:date.toLocaleDateString('es-DO',{weekday:'short',timeZone:'UTC'}).replace('.',''),sabbath:date.getUTCDay()===6};});
  return {currentDay,totalDays,days};
}
