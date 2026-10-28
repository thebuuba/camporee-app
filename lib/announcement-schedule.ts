// Dominican Republic uses UTC-4 year-round. Never interpret this as device time.
export function announcementPublishAt(value:string,now=Date.now()){
 const parsed=new Date(`${value}:00-04:00`);
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)||!Number.isFinite(parsed.getTime())||
  new Date(parsed.getTime()-4*3600000).toISOString().slice(0,16)!==value||parsed.getTime()<=now)
  throw new Error('Elige una fecha y hora futuras válidas.');
 return parsed.toISOString();
}
