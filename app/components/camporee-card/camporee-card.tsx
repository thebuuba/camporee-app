'use client';

import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {ArrowRight,Award,BookOpen,CalendarDays,Check,Church,FileText,Flame,MapPin,MoonStar,NotebookPen,PartyPopper,Sun,Sunset,Tent,Trophy} from 'lucide-react';
import Link from '@/app/components/tenant-link';
import {createClient} from '@/lib/supabase/client';
import {mutationNotice,mutationProblem} from '@/lib/mutation-result';
import {reportMutationError,reportMutationSuccess} from '@/lib/client-ui';
import {camporeeMidnightEpoch,formatCamporeeDate} from '@/lib/camporee-locale';
import {camporeeClock,camporeeDayWindow,liveSchedule,sabbathState,splitDuration,type CamporeeCardData} from '@/lib/camporee-card';
import {CamporeeScene} from './camporee-scene';
import {CountdownUnit} from './countdown-unit';
import {ProgressRing} from './progress-ring';
import {CamporeeClubStrip} from './camporee-club-strip';
import {SabbathBanner} from './sabbath-banner';
import {DailySunset,useDailySunset} from './daily-sunset';
import {supportsSunsetRegion} from '@/supabase/functions/_shared/sunset';

type Camporee={id:string;theme?:string|null;starts_on:string;ends_on:string;location:string|null;time_zone:string};
export type CamporeeCardProps={camporee:Camporee;phase:'before'|'during'|'after';initialNow:number;firstName:string;participants:number;presentParticipants:number;programCount:number;preparation:{completed:number;total:number;percent:number};data?:CamporeeCardData};
const actionClass='inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-0 bg-card px-4 text-[13px] font-semibold text-foreground shadow-sm transition-colors hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const panelClass='rounded-3xl bg-secondary p-3 text-secondary-foreground';
const fallbackData:CamporeeCardData={organizationName:'Mi club',canEditTasks:false,tasks:[],schedule:[],results:[],resultCount:0,people:[],loadError:false};

export default function CamporeeCard({camporee,phase,initialNow,firstName,participants,presentParticipants,programCount,preparation,data=fallbackData}:CamporeeCardProps){
  const [tick,setTick]=useState(initialNow);
  const [completed,setCompleted]=useState<string[]>([]);
  const [savingTask,setSavingTask]=useState<string|null>(null);
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  const router=useRouter();
  useEffect(()=>{setCompleted(previous=>previous.filter(id=>data.tasks.some(task=>task.id===id)));},[data.tasks]);
  useEffect(()=>{const timer=window.setInterval(()=>setTick(Date.now()),1000);return()=>window.clearInterval(timer);},[]);
  const now=tick;
  const zone=camporee.time_zone;
  const clock=camporeeClock(now,zone);
  const regionalSunset=supportsSunsetRegion(camporee.location,zone);
  const sunset=useDailySunset(now,regionalSunset);
  const sabbath=regionalSunset?{active:sunset?.sabbath??false,endsAt:sunset?.weekday===6?sunset.sunsetAt:null}:sabbathState(data.schedule,now,zone);
  const isSabbath=phase==='during'&&sabbath.active;
  const ui=phase==='before'?{label:'Preparando el camporee',Icon:Tent,pill:null}:phase==='after'?{label:'Camporee finalizado',Icon:PartyPopper,pill:'Finalizado'}:isSabbath?{label:'Feliz sábado',Icon:Sun,pill:'Reposo'}:{label:'Camporee en curso',Icon:Flame,pill:'En vivo'};
  const start=camporeeMidnightEpoch(camporee.starts_on,zone);
  const endDate=new Date(Date.parse(`${camporee.ends_on}T12:00:00Z`)+86400000).toISOString().slice(0,10);
  const end=camporeeMidnightEpoch(endDate,zone);
  const countdown=splitDuration(start-now);
  const endsIn=splitDuration(end-now);
  const day=camporeeDayWindow(camporee.starts_on,camporee.ends_on,clock.date);
  const live=liveSchedule(data.schedule,now,zone);
  const featured=live.current??live.upcoming[0];
  const later=(live.current?live.upcoming:live.upcoming.slice(1)).slice(0,3);
  const pending=data.tasks.filter(task=>!completed.includes(task.id)).slice(0,1);
  const localDone=data.tasks.filter(task=>completed.includes(task.id)).length;
  const done=Math.min(preparation.total,preparation.completed+localDone);
  const pct=preparation.total?Math.round(done/preparation.total*100):0;
  const headline=pct===0?'¡Vamos a prepararnos!':pct<50?'¡Buen comienzo!':pct<100?'¡Ya casi estamos!':'¡Listos para acampar!';
  const formatTime=(date:string|number)=>new Intl.DateTimeFormat('es-DO',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(date));
  const dates=camporee.starts_on===camporee.ends_on?formatCamporeeDate(camporee.starts_on):camporee.starts_on.slice(0,7)===camporee.ends_on.slice(0,7)?`${Number(camporee.starts_on.slice(-2))} – ${formatCamporeeDate(camporee.ends_on)}`:`${formatCamporeeDate(camporee.starts_on)} – ${formatCamporeeDate(camporee.ends_on)}`;

  async function completeTask(id:string){
    if(!data.canEditTasks||savingTask||completed.includes(id))return;
    setSavingTask(id);setNotice('');setError('');
    try{
      const result=await createClient().from('tasks').update({status:'done'}).eq('camporee_id',camporee.id).eq('id',id).eq('phase','before').neq('status','cancelled').select('id');
      const problem=mutationProblem(result,[id]);
      if(problem){setError(reportMutationError(problem,'No se pudo completar la tarea.'));return;}
      setCompleted(previous=>[...previous,id]);
      const message=mutationNotice(result.status,'Tarea completada.');setNotice(message);reportMutationSuccess(message);
      if(result.status!==202)router.refresh();
    }catch(err){setError(reportMutationError(err,'No se pudo completar la tarea.'));}finally{setSavingTask(null);}
  }

  return <div id='camporee-card' className='camporee-polymet-card'>
    <article className='w-full overflow-hidden rounded-[28px] border border-border/60 bg-card text-card-foreground shadow-[0_20px_50px_-24px_hsl(var(--primary)/0.45)]' aria-label={phase==='before'?'Preparación del camporee':phase==='after'?'Resumen final del camporee':isSabbath?'Camporee en sábado':'Camporee en curso'} data-phase={isSabbath?'sabbath':phase}>
      <div className='relative'>
        <CamporeeScene hour={clock.hour} festive={phase==='during'&&!isSabbath} sabbath={isSabbath} className='h-[180px]'/>
        <div className='absolute inset-x-3 top-3 flex items-start justify-between gap-2'>
          <div className='flex items-center gap-2 whitespace-nowrap rounded-full bg-card/90 py-1.5 pl-1.5 pr-3.5 shadow-sm backdrop-blur'><span className='flex size-6 items-center justify-center rounded-full bg-accent text-accent-foreground'><ui.Icon className='size-3.5'/></span><span className='text-xs font-semibold text-foreground'>{ui.label}</span></div>
          {ui.pill?<span className='flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-card/80 px-2.5 py-1 text-[11px] font-semibold text-foreground backdrop-blur'>{isSabbath?<Church className='size-3 text-primary'/>:phase==='after'?<Check className='size-3 text-primary'/>:<span className='size-1.5 rounded-full bg-chart-2'/>}{ui.pill}</span>:null}
        </div>
      </div>
      <div className='relative -mt-10 px-3'>
        {phase==='before'?<div className='grid grid-cols-4 gap-2' aria-label='Tiempo hasta el camporee'><CountdownUnit value={countdown.days} label='Días'/><CountdownUnit value={countdown.hours} label='Horas'/><CountdownUnit value={countdown.minutes} label='Min'/><CountdownUnit value={countdown.seconds} label='Seg' highlight/></div>:phase==='after'?<div className='grid grid-cols-3 gap-2'><CountdownUnit value={day.totalDays} label='Días'/><CountdownUnit value={presentParticipants} label='Asistentes'/><CountdownUnit value={programCount} label='Actividades'/></div>:<div className='flex items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3 shadow-[0_6px_20px_-10px_hsl(var(--primary)/0.35)]'>
          <div className='shrink-0 text-center'><span className='block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground'>Día</span><span className='text-[28px] font-bold leading-8 tracking-tight text-primary tabular-nums'>{day.currentDay}<span className='text-lg font-semibold text-muted-foreground/70'>/{day.totalDays}</span></span></div><div className='h-12 w-px shrink-0 bg-border'/>
          <div className='min-w-0 flex-1'><div className='grid grid-cols-[repeat(var(--camporee-days),minmax(0,1fr))] gap-1.5' style={{'--camporee-days':day.days.length} as React.CSSProperties}>{day.days.map(item=><div key={item.number} className='flex flex-col items-center gap-1.5'><div className='h-2 w-full overflow-hidden rounded-full bg-muted'><div className={`h-full rounded-full ${item.sabbath?'bg-amber-400':'bg-primary'}`} style={{width:`${item.number<day.currentDay?100:item.number===day.currentDay?clock.hour/24*100:0}%`}}/></div><span className={`flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wide ${item.number===day.currentDay?'text-primary':'text-muted-foreground/80'}`}>{item.sabbath?<Sun className='size-2.5'/>:null}{item.label}</span></div>)}</div><p className='mt-1.5 text-xs text-muted-foreground'>Termina en <span className='font-semibold tabular-nums text-foreground'>{endsIn.days?`${endsIn.days}d `:''}{String(endsIn.hours).padStart(2,'0')}h {String(endsIn.minutes).padStart(2,'0')}m</span></p></div>
        </div>}
      </div>
      <div className='space-y-2 p-3 pt-3'>
        {regionalSunset?<DailySunset sunset={sunset}/>:null}
        {phase==='before'?<>
          <section className={panelClass}><div className='flex items-center gap-3'><ProgressRing value={pct} size={64} strokeWidth={7}/><div className='min-w-0'><h3 className='text-base font-bold leading-tight text-foreground'>{headline}</h3><p className='mt-0.5 text-[13px] text-muted-foreground'><span className='font-semibold text-secondary-foreground'>{done} de {preparation.total}</span> tareas de preparación completadas</p></div></div>
            {pending.length?<ul className='mt-3 space-y-1.5'>{pending.map(task=><li key={task.id}>{data.canEditTasks?<button type='button' aria-label={`Completar ${task.title}`} disabled={Boolean(savingTask)} onClick={()=>void completeTask(task.id)} className='group flex min-h-11 w-full items-center gap-3 rounded-xl border-0 bg-card/70 px-3 py-2 text-left transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60'><span className='flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-chart-2/50'><Check className='size-3 text-chart-2 opacity-0 group-hover:opacity-100'/></span><span className='flex-1 truncate text-[13px] font-medium text-foreground'>{task.title}</span><span className='shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-secondary-foreground/80'>{task.areas?.name||'Preparación'}</span></button>:<Link href='/tasks?phase=before' className='flex min-h-11 items-center gap-3 rounded-xl bg-card/70 px-3 py-2 text-[13px] font-medium text-foreground'><span className='size-5 shrink-0 rounded-full border-2 border-chart-2/50'/><span className='flex-1 truncate'>{task.title}</span><span className='max-w-[32%] shrink-0 truncate rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-secondary-foreground/80'>{task.areas?.name||'Preparación'}</span></Link>}</li>)}</ul>:<div className='mt-3 flex items-center gap-2 rounded-xl bg-card/70 px-3 py-2.5 text-[13px] font-medium text-foreground'><PartyPopper className='size-4 text-primary'/>{preparation.total===0?'Añade las tareas de preparación para empezar.':done===preparation.total?'Todo listo. ¡Nos vemos en el campamento!':'Revisa todas las tareas de preparación.'}</div>}
            {error?<p role='alert' className='mt-3 text-[13px] text-red-700 dark:text-red-300'>{error}</p>:null}{notice?<p role='status' className='mt-3 text-xs text-secondary-foreground'>{notice}</p>:null}
            <div className='mt-3 flex items-center justify-between gap-2'><Link href='/tasks?phase=before' className={actionClass}>{preparation.total>done?`Ver pendientes (${preparation.total-done})`:'Ver checklist'}<ArrowRight className='size-4'/></Link>{done>0?<span className='flex items-center gap-1 text-xs font-medium text-muted-foreground'><Check className='size-3.5 text-chart-2'/>{done} hechas</span>:null}</div>
          </section>
        </>:phase==='during'?<>
          {isSabbath?(sabbath.endsAt!==null?<SabbathBanner sunset={formatTime(sabbath.endsAt)} endsIn={splitDuration(sabbath.endsAt-now)}/>:<div className='relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-100 via-orange-50 to-amber-50 p-4 dark:from-amber-950/60 dark:via-stone-900 dark:to-amber-950/30'><Sun className='absolute -right-6 -top-6 size-28 text-amber-300/40' aria-hidden='true'/><div className='relative'><p className='text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300'>Día de reposo</p><h3 className='mt-1 text-base font-bold leading-tight text-foreground'>¡Feliz sábado!</h3><p className='mt-0.5 max-w-[85%] text-[13px] text-muted-foreground'>Un día para adorar, descansar y disfrutar la creación juntos.</p><Link href='/program' className='mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-card/80 px-3 text-xs text-foreground shadow-sm'><Sunset className='size-4 text-primary'/>Ver programa del sábado</Link></div></div>):null}
          <section className={panelClass}><div className='mb-2.5 flex items-center gap-2'><span className={`size-2 rounded-full ${isSabbath?'bg-amber-400':'bg-chart-2'}`}/><span className='text-[11px] font-bold uppercase tracking-[0.16em]'>{live.current?'Ahora':featured?'A continuación':'Por hoy'}</span></div>
            {featured?<div className='rounded-2xl bg-card p-3 shadow-sm'><div className='flex items-center gap-3'><span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${isSabbath?'bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400':'bg-accent text-primary'}`}><CalendarDays className='size-5'/></span><div className='min-w-0 flex-1'><h3 className='text-base font-bold leading-tight text-foreground'>{featured.title}</h3><p className='mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground'><span className='font-semibold tabular-nums text-foreground/80'>{formatTime(featured.starts_at)}{featured.ends_at?` – ${formatTime(featured.ends_at)}`:''}</span>{featured.location?<><span aria-hidden='true'>·</span><MapPin className='size-3 shrink-0'/><span>{featured.location}</span></>:null}</p></div></div>{live.current?<div className='mt-3 h-1.5 overflow-hidden rounded-full bg-muted'><div className={`h-full rounded-full ${isSabbath?'bg-amber-400':'bg-chart-2'}`} style={{width:`${live.progress}%`}}/></div>:null}</div>:<div className='flex items-center gap-3 rounded-2xl bg-card/70 p-3 text-[13px] font-medium text-foreground'><MoonStar className='size-5 shrink-0 text-primary'/>{programCount?'Hora de descansar. ¡Mañana hay más aventura!':'El programa aún no tiene actividades registradas.'}</div>}
            {later.length?<div className='mt-3'><p className='mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.16em] text-secondary-foreground/70'>Más tarde hoy</p><ol className='space-y-1'>{later.map((event,index)=><li key={event.id} className='flex items-center gap-3 rounded-xl px-1 py-1.5'><span className='w-11 shrink-0 text-right text-xs font-semibold tabular-nums text-secondary-foreground'>{formatTime(event.starts_at)}</span><span className='relative flex size-2.5 shrink-0 items-center justify-center'><span className='size-2.5 rounded-full border-2 border-chart-2 bg-secondary'/>{index<later.length-1?<span className='absolute left-1/2 top-3 h-6 w-px -translate-x-1/2 bg-chart-2/30'/>:null}</span><span className='min-w-0 flex-1 text-[13px] font-medium text-foreground'>{event.title}</span><CalendarDays className='size-4 shrink-0 text-secondary-foreground/60'/></li>)}</ol></div>:null}
            <Link href='/program' className={`${actionClass} mt-3`}>Ver programa completo<ArrowRight className='size-4'/></Link>
          </section>
          <CamporeeClubStrip icon={isSabbath?BookOpen:Trophy} tone={isSabbath?'default':'gold'} title={isSabbath?'Un sábado para compartir':data.organizationName} subtitle={isSabbath?'Sigue el programa de tu camporee':`${presentParticipants} de ${participants} participantes presentes`}/>
        </>:<>
          <section className={panelClass}><div className='flex items-center gap-3'><div className='relative flex size-[60px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-orange-500 shadow-[0_8px_20px_-8px_hsl(var(--primary)/0.7)] ring-4 ring-card'><Award className='size-8 text-white'/><span className='absolute -bottom-1.5 rounded-full bg-card px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-primary shadow-sm'>Recuerdo</span></div><div className='min-w-0'><h3 className='text-base font-bold leading-tight text-foreground'>¡Felicidades, {firstName}!</h3><p className='mt-0.5 text-[13px] text-muted-foreground'>Compartimos {day.totalDays} días de fe y aventura. ¡Hasta el próximo camporee!</p></div></div>
            <div className='mt-3'><p className='mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.16em] text-secondary-foreground/70'>Resultados registrados</p>{data.results.length?<ul className='grid grid-cols-3 gap-2'>{data.results.map(result=><li key={result.id}><Link href='/more/activities?from=home' className='flex h-full min-h-11 flex-col items-center gap-1.5 rounded-2xl bg-card/70 px-1.5 py-3 text-center'><span className='flex size-10 items-center justify-center rounded-full border-2 border-dashed border-chart-2/50 bg-card text-chart-2'>{result.activity_type==='honor'?<Award className='size-[18px]'/>:<Trophy className='size-[18px]'/>}</span><span className='text-[11px] font-semibold leading-tight text-foreground'>{result.title}</span>{result.result?<span className='text-[10px] text-muted-foreground'>{result.result}</span>:null}</Link></li>)}</ul>:<p className='rounded-2xl bg-card/70 p-3 text-[13px] text-muted-foreground'>Los resultados de tu club aparecerán aquí cuando se registren.</p>}</div>
            <div className='mt-3 flex flex-wrap items-center gap-2'><Link href='/more/documents?from=home' className={`${actionClass} flex-1`}><FileText className='size-4'/>Documentos</Link><Link href='/more/notes?from=home' className={`${actionClass} flex-1`}><NotebookPen className='size-4'/>Recuerdos</Link></div>
          </section>
          <CamporeeClubStrip icon={Trophy} tone='gold' title={data.organizationName} subtitle={`${data.resultCount} resultados registrados`} trailing={<Link href='/more/activities?from=home' aria-label='Ver resultados del camporee' className='flex size-11 items-center justify-center rounded-full text-primary'><ArrowRight className='size-4'/></Link>}/>
        </>}
        {data.loadError?<p role='status' className='text-xs text-muted-foreground'>Algunos datos no se pudieron cargar. Abre el módulo para revisarlos.</p>:null}
        <footer className='space-y-1 pb-1 pt-1 text-center text-xs text-muted-foreground'><p className='flex flex-wrap items-center justify-center gap-x-3 gap-y-1'><span className='inline-flex items-center gap-1.5'><CalendarDays className='size-3.5 text-primary'/>{dates}</span>{camporee.location?<span className='inline-flex items-center gap-1.5'><MapPin className='size-3.5 shrink-0 text-primary'/>{camporee.location}</span>:null}</p><p className='text-[11px] text-muted-foreground/80'>{data.organizationName}</p></footer>
      </div>
    </article>
  </div>;
}
