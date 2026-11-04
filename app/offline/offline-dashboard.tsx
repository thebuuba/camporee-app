'use client';

import {useEffect,useState} from 'react';
import {CloudOff,RefreshCw} from 'lucide-react';
import {createClient} from '@/lib/supabase/client';
import {formatCamporeeTime} from '@/lib/camporee-locale';
import {dateKeyInTimeZone} from '@/lib/date';
import {parseTenantPath,tenantPath} from '@/lib/tenant-context';
import {queueOfflineCheck,readLocalMutations} from '@/lib/offline-fetch';
import {downloadProgramCalendar} from '@/lib/program-calendar';
import {applyOfflineMutations,currentOfflineIdentity,listOfflineSnapshots,updateOfflineSnapshot,type OfflineSnapshot} from '@/lib/offline-snapshot';
import styles from './offline-dashboard.module.css';

type Panel='program'|'meals'|'tasks'|'lists';
const panels:{id:Panel;label:string;path:string}[]=[
  {id:'program',label:'Programa',path:'/program'},
  {id:'meals',label:'Comidas',path:'/more/meals'},
  {id:'tasks',label:'Tareas',path:'/tasks'},
  {id:'lists',label:'Listas',path:'/more/lists'},
];
const formatDay=(value:string)=>new Intl.DateTimeFormat('es-DO',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(`${value.slice(0,10)}T12:00:00Z`));
const mealLabel=(value:string)=>({breakfast:'Desayuno',lunch:'Almuerzo',snack:'Merienda',dinner:'Cena'}[value]??value);
const mealTime=(value:string)=>new Intl.DateTimeFormat('es-DO',{hour:'numeric',minute:'2-digit',hour12:true,timeZone:'UTC'}).format(new Date(`1970-01-01T${value.slice(0,5)}:00Z`)).replace(/a\.\s*m\./i,'am').replace(/p\.\s*m\./i,'pm');

export default function OfflineDashboard() {
  const [copies,setCopies]=useState<OfflineSnapshot[]>([]);
  const [selected,setSelected]=useState('');
  const [panel,setPanel]=useState<Panel>('program');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState('');
  const [online,setOnline]=useState(false);
  const snapshot=copies.find(row=>row.key===selected);

  useEffect(()=>{
    let active=true;
    const load=async()=>{
      try {
        const owner=currentOfflineIdentity();
        if(!owner){if(active)setLoading(false);return;}
        // A live session belonging to another account must never see this copy.
        const sessionOwner=await Promise.race([
          createClient().auth.getSession().then((result:{data:{session:{user:{id:string}}|null}})=>result.data.session?.user.id??null).catch(()=>null),
          new Promise<null>(resolve=>setTimeout(()=>resolve(null),2500)),
        ]);
        if(sessionOwner && sessionOwner!==owner){if(active){setCopies([]);setLoading(false);}return;}
        const rows=await listOfflineSnapshots(owner);
        const current=await Promise.all(rows.map(async row=>applyOfflineMutations(row,await readLocalMutations(row).catch(()=>[]))));
        if(!active)return;
        const from=new URLSearchParams(location.search).get('from')??location.pathname;
        const scope=parseTenantPath(from);
        const preferred=scope?current.find(row=>row.organizationId===scope.organizationId&&row.camporeeId===scope.camporeeId):undefined;
        const wanted=panels.find(item=>from.endsWith(item.path))?.id;
        setCopies(current);setSelected(preferred?.key??current[0]?.key??'');
        if(wanted)setPanel(wanted);
      }catch{if(active)setError('No se pudo leer la copia de este dispositivo.');}
      finally{if(active)setLoading(false);}
    };
    setOnline(navigator.onLine);
    void load();
    const onConnection=()=>setOnline(navigator.onLine);
    const onAccountChange=()=>{if(currentOfflineIdentity()!==copies[0]?.ownerId){setCopies([]);setSelected('');}};
    window.addEventListener('online',onConnection);
    window.addEventListener('offline',onConnection);
    window.addEventListener('storage',onAccountChange);
    return()=>{active=false;window.removeEventListener('online',onConnection);window.removeEventListener('offline',onConnection);window.removeEventListener('storage',onAccountChange);};
  },[]);

  useEffect(()=>{
    if(!snapshot)return;
    const resume=()=>{if(navigator.onLine)window.location.assign(tenantPath(snapshot,panels.find(item=>item.id===panel)!.path));};
    window.addEventListener('online',resume);
    return()=>window.removeEventListener('online',resume);
  },[snapshot,panel]);

  async function toggle(table:'tasks'|'list_items',id:string,value:boolean) {
    if(!snapshot||busy||online||currentOfflineIdentity()!==snapshot.ownerId)return;
    setBusy(id);setError('');
    try {
      await queueOfflineCheck(snapshot,table,id,value);
      const updated:OfflineSnapshot=table==='tasks'
        ? {...snapshot,tasks:snapshot.tasks.map(task=>task.id===id?{...task,status:value?'done':'pending'}:task)}
        : {...snapshot,lists:snapshot.lists.map(list=>({...list,list_items:list.list_items.map(item=>item.id===id?{...item,is_done:value}:item)}))};
      await updateOfflineSnapshot(updated);
      setCopies(rows=>rows.map(row=>row.key===updated.key?updated:row));
    }catch{setError('No se pudo guardar el cambio en este dispositivo. Inténtalo de nuevo.');}
    finally{setBusy('');}
  }

  if(loading)return <p className={styles.message}>Abriendo la copia guardada…</p>;
  if(!snapshot)return <section className={styles.empty}><CloudOff size={28}/><h2>Sin copia disponible</h2><p>{error||'Abre Camporee con internet y entra a tu camporee una vez para preparar Programa, Comidas, Tareas y Listas en este dispositivo.'}</p><a href="/" className="primary-btn auth-link-btn">Intentar de nuevo</a></section>;
  const target=tenantPath(snapshot,panels.find(item=>item.id===panel)!.path);
  return <div className={styles.dashboard}>
    <header className={styles.header}><span className="auth-kicker"><CloudOff size={13}/> COPIA EN ESTE DISPOSITIVO</span><h1>{snapshot.camporeeName}</h1><p>Guardada el {new Intl.DateTimeFormat('es-DO',{dateStyle:'medium',timeStyle:'short',timeZone:snapshot.timeZone}).format(snapshot.savedAt)}. Los cambios nuevos de otras personas aparecerán cuando tengas conexión.</p></header>
    {copies.length>1?<label className={styles.selector}>Camporee <select value={selected} onChange={event=>setSelected(event.target.value)}>{copies.map(row=><option key={row.key} value={row.key}>{row.camporeeName}</option>)}</select></label>:null}
    <nav className={styles.tabs} aria-label="Paneles guardados">{panels.map(item=><button key={item.id} type="button" aria-pressed={panel===item.id} className={panel===item.id?styles.active:''} onClick={()=>setPanel(item.id)}>{item.label}</button>)}</nav>
    {error?<p role="alert" className="auth-alert error">{error}</p>:null}
    {online?<a className="primary-btn auth-link-btn" href={target}><RefreshCw size={16}/> Abrir panel actualizado</a>:<p className={styles.hint}>Sin internet · Los cambios marcados aquí se sincronizarán cuando vuelvas a abrir el camporee con conexión.</p>}
    {panel==='program'&&snapshot.program.length?<div><button type="button" className="secondary-btn" onClick={()=>downloadProgramCalendar(snapshot.program,snapshot.camporeeName)}>Descargar calendario (.ics)</button><p className={styles.hint}>Importa el archivo en tu calendario y comprueba que sus avisos estén activos.</p></div>:null}
    <section className={styles.rows} aria-label={panels.find(item=>item.id===panel)?.label}>
      {panel==='program'&&(snapshot.program.length?snapshot.program.map(event=><article className={styles.row} key={event.id}><small>{formatDay(dateKeyInTimeZone(event.starts_at,snapshot.timeZone))} · {formatCamporeeTime(event.starts_at,snapshot.timeZone)}</small><strong>{event.title}</strong>{event.description?<p>{event.description}</p>:null}{event.location?<small>{event.location}</small>:null}</article>):<p className={styles.message}>No hay actividades guardadas.</p>)}
      {panel==='meals'&&(snapshot.meals.length?snapshot.meals.map(meal=><article className={styles.row} key={meal.id}><small>{formatDay(meal.meal_date)} · {mealLabel(meal.meal_type)}{meal.meal_time?` · ${mealTime(meal.meal_time)}`:''}</small><strong>{meal.menu}</strong>{meal.notes?<p>{meal.notes}</p>:null}</article>):<p className={styles.message}>No hay comidas guardadas.</p>)}
      {panel==='tasks'&&(snapshot.tasks.length?snapshot.tasks.map(task=><article className={styles.row} key={task.id}><label className={styles.check}><input type="checkbox" checked={task.status==='done'} disabled={!snapshot.canEditTasks||online||Boolean(busy)} onChange={event=>void toggle('tasks',task.id,event.target.checked)}/><strong>{task.title}</strong></label>{task.description?<p>{task.description}</p>:null}{task.due_at?<small>Fecha límite: {new Intl.DateTimeFormat('es-DO',{dateStyle:'medium',timeStyle:'short',timeZone:snapshot.timeZone}).format(new Date(task.due_at))}</small>:null}</article>):<p className={styles.message}>No hay tareas guardadas.</p>)}
      {panel==='lists'&&(snapshot.lists.length?snapshot.lists.map(list=><article className={styles.row} key={list.id}><strong>{list.title}</strong>{list.category?<small>{list.category}</small>:null}<div className={styles.items}>{list.list_items.map(item=><label className={styles.check} key={item.id}><input type="checkbox" checked={item.is_done} disabled={!snapshot.canEditLists||online||Boolean(busy)} onChange={event=>void toggle('list_items',item.id,event.target.checked)}/><span>{item.label}{item.quantity?` · ${item.quantity} ${item.unit??''}`:''}</span></label>)}</div></article>):<p className={styles.message}>No hay listas guardadas.</p>)}
    </section>
  </div>;
}
