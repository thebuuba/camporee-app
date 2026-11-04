type CalendarEvent={id:string;title:string;starts_at:string;ends_at?:string|null;description?:string|null;location?:string|null};

const escapeText=(value:string)=>value.replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
const utcStamp=(value:string)=>new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
function fold(line:string) {
  const parts:string[]=[];
  let part='',bytes=0;
  for(const char of line){
    const size=new TextEncoder().encode(char).length;
    if(bytes+size>75){parts.push(part);part=' ';bytes=1;}
    part+=char;bytes+=size;
  }
  parts.push(part);
  return parts.join('\r\n');
}

export function programCalendar(events:CalendarEvent[],name:string,now=new Date()):string {
  const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Camporee//Programa//ES','CALSCALE:GREGORIAN','METHOD:PUBLISH',`X-WR-CALNAME:${escapeText(name)}`];
  for(const event of events){
    if(!Number.isFinite(Date.parse(event.starts_at)))continue;
    const start=Date.parse(event.starts_at);
    const end=event.ends_at&&Date.parse(event.ends_at)>start?event.ends_at:new Date(start+60*60_000).toISOString();
    lines.push('BEGIN:VEVENT',`UID:${event.id}@camporee.app`,`DTSTAMP:${utcStamp(now.toISOString())}`,
      `DTSTART:${utcStamp(event.starts_at)}`,`DTEND:${utcStamp(end)}`,
      `SUMMARY:${escapeText(event.title)}`);
    if(event.description)lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    if(event.location)lines.push(`LOCATION:${escapeText(event.location)}`);
    lines.push('BEGIN:VALARM','ACTION:DISPLAY','TRIGGER:PT0M',`DESCRIPTION:${escapeText(`Comienza ${event.title}`)}`,'END:VALARM','END:VEVENT');
  }
  return lines.concat('END:VCALENDAR','').map(fold).join('\r\n');
}

export function downloadProgramCalendar(events:CalendarEvent[],name:string) {
  const blob=new Blob([programCalendar(events,name)],{type:'text/calendar;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');link.href=url;link.download='camporee-programa.ics';
  document.body.append(link);link.click();link.remove();
  window.setTimeout(()=>URL.revokeObjectURL(url),60_000);
}
