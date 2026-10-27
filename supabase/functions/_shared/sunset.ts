export const SUNSET_ZONE='America/Santo_Domingo';
export const SUNSET_CITIES=[
 {id:'santiago',label:'Santiago',latitude:19.45036,longitude:-70.69085},
 {id:'moca',label:'Espaillat (Moca)',latitude:19.39289,longitude:-70.52347},
] as const;
export type SunsetReport={id:string;label:string;timeZone:string;date:string;sunrise:string;sunset:string};
export function localDate(now:number,timeZone=SUNSET_ZONE){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(part=>[part.type,part.value]));
 return `${parts.year}-${parts.month}-${parts.day}`;
}
export function supportsSunsetRegion(location:string|null,timeZone:string){
 return timeZone===SUNSET_ZONE&&/santiago|espaillat|moca/i.test(location??'');
}
export async function fetchSunsetTimes(date:string,request:typeof fetch=fetch):Promise<SunsetReport[]>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return [];
 const results=await Promise.allSettled(SUNSET_CITIES.map(async city=>{
  const query=new URLSearchParams({lat:String(city.latitude),lng:String(city.longitude),date,tz:SUNSET_ZONE});
  const response=await request(`https://api.sunrise-sunset.org/v2?${query}`,{signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error('Sunset source unavailable');
  const body=await response.json();
  if(body.date!==date||body.tzid!==SUNSET_ZONE||typeof body.sunset!=='string'||typeof body.sunrise!=='string'||!Number.isFinite(Date.parse(body.sunset))||!Number.isFinite(Date.parse(body.sunrise))||localDate(Date.parse(body.sunset))!==date||localDate(Date.parse(body.sunrise))!==date)throw new Error('Invalid sunset response');
  return {id:city.id,label:city.label,timeZone:SUNSET_ZONE,date,sunrise:body.sunrise,sunset:body.sunset};
 }));
 return results.flatMap(result=>result.status==='fulfilled'?[result.value]:[]);
}
// Public city data only. Share a day's requests across mounts / warm cron runs.
let cached:{date:string;value:Promise<SunsetReport[]>}|null=null;
export async function dailySunsetTimes(date:string){
 if(cached?.date===date)return cached.value;
 const value=fetchSunsetTimes(date);
 cached={date,value};
 const rows=await value;
 if(rows.length!==SUNSET_CITIES.length&&cached?.value===value)cached=null;
 return rows;
}
export function sunsetReference(rows:SunsetReport[],date:string){
 // One regional clock without GPS: Santiago is the shared reference on Home.
 return rows.find(row=>row.id==='santiago'&&row.date===date&&row.timeZone===SUNSET_ZONE&&Number.isFinite(Date.parse(row.sunset))&&localDate(Date.parse(row.sunset))===date)??null;
}
export function fridaySunsetReminder(now:number,rows:SunsetReport[]){
 const date=localDate(now);
 const reference=sunsetReference(rows,date);
 if(new Date(`${date}T12:00:00Z`).getUTCDay()!==5||!reference)return null;
 // Use the minute shown in the card, so the displayed time and reminder agree.
 const sunset=Math.floor(Date.parse(reference.sunset)/60000)*60000;
 const due=sunset-90*60000,expires=due+5*60000;
 return now>=due&&now<expires?{date,due,expires}:null;
}
