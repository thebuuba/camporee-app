'use client';

import { useEffect, useMemo, useState } from 'react';
import { Award, CalendarCheck, MapPin, Medal, Pencil, Plus, Search, Trash2, Trophy, Users, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { confirmRemoval, reportMutationError, reportMutationSuccess } from '@/lib/client-ui';

const activityTypes = [
  ['competition','Competencia'],['honor','Especialidad'],['sport','Deporte'],['march','Marcha'],['talent','Talento'],['other','Otra'],
] as const;
const typeLabel = (value:string) => activityTypes.find(([key]) => key === value)?.[1] ?? 'Actividad';
const localInputValue = (value?:string|null) => {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0,16);
};

export default function ActivityManager({ camporeeId, canEdit, initialActivities, participants }: { camporeeId:string; canEdit:boolean; initialActivities:any[]; participants:any[] }) {
  const [activities,setActivities] = useState(initialActivities);
  const [open,setOpen] = useState(false);
  const [editing,setEditing] = useState<any|null>(null);
  const [saving,setSaving] = useState(false);
  const [query,setQuery] = useState('');
  const [filter,setFilter] = useState('all');
  const [formError,setFormError] = useState('');
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => { setActivities(initialActivities); }, [initialActivities]);

  const visible = useMemo(() => activities.filter((activity) => {
    const participantNames = (activity.camporee_activity_participants || []).map((row:any) => participants.find((p) => p.id === row.participant_id)?.full_name || '').join(' ');
    const text = `${activity.title} ${activity.location || ''} ${activity.responsible_name || ''} ${participantNames}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (filter === 'all' || activity.activity_type === filter);
  }), [activities,participants,query,filter]);

  function closeSheet(){ if(saving)return; setOpen(false); setEditing(null); setFormError(''); }
  function openNew(){ setEditing(null); setFormError(''); setOpen(true); }
  function openEdit(activity:any){ setEditing(activity); setFormError(''); setOpen(true); }

  async function saveActivity(formData:FormData){
    if(!canEdit || saving) return;
    const title=String(formData.get('title')||'').trim();
    if(!title){ setFormError('Escribe el nombre de la actividad.'); return; }
    const startsValue=String(formData.get('starts_at')||'');
    const startsDate=startsValue ? new Date(startsValue) : null;
    if(startsDate && Number.isNaN(startsDate.getTime())){ setFormError('La fecha y hora no son válidas.'); return; }
    const startsAt=startsDate ? startsDate.toISOString() : null;
    const scoreRaw=String(formData.get('score')||'').trim();
    const score=scoreRaw ? Number(scoreRaw) : null;
    if(scoreRaw && !Number.isFinite(score)){ setFormError('La puntuación no es válida.'); return; }

    setSaving(true);
    setFormError('');
    try {
      const syncProgram=formData.get('sync_program')==='on' && Boolean(startsAt);
      const payload={
        camporee_id:camporeeId,
        title,
        activity_type:String(formData.get('activity_type')||'competition'),
        starts_at:startsAt,
        location:String(formData.get('location')||'').trim()||null,
        responsible_name:String(formData.get('responsible_name')||'').trim()||null,
        materials:String(formData.get('materials')||'').trim()||null,
        result:String(formData.get('result')||'').trim()||null,
        score,
        notes:String(formData.get('notes')||'').trim()||null,
      };
      const request=editing ? supabase.from('camporee_activities').update(payload).eq('id',editing.id) : supabase.from('camporee_activities').insert(payload);
      const {data,error}=await request.select('id,title,activity_type,starts_at,location,responsible_name,materials,result,score,notes,schedule_event_id').single();
      if(error || !data){
        const message=reportMutationError(error,'No se pudo guardar la actividad. Revisa tu conexión y permisos e inténtalo otra vez.');
        setFormError(message);
        return;
      }

      let scheduleEventId=data.schedule_event_id || editing?.schedule_event_id || null;
      let secondaryWarning='';
      if(syncProgram && startsAt){
        const eventPayload={camporee_id:camporeeId,title,description:payload.notes,location:payload.location,responsible_name:payload.responsible_name,starts_at:startsAt,ends_at:null};
        if(scheduleEventId){
          const {error:eventError}=await supabase.from('schedule_events').update(eventPayload).eq('id',scheduleEventId);
          if(eventError){ secondaryWarning='La actividad se guardó, pero no se pudo actualizar en Programa.'; reportMutationError(eventError,secondaryWarning); }
        }else{
          const {data:eventData,error:eventError}=await supabase.from('schedule_events').insert(eventPayload).select('id').single();
          if(eventError||!eventData){
            secondaryWarning='La actividad se guardó, pero no se pudo agregar a Programa.';
            reportMutationError(eventError,secondaryWarning);
          }else{
            scheduleEventId=eventData.id;
            const {error:linkError}=await supabase.from('camporee_activities').update({schedule_event_id:scheduleEventId}).eq('id',data.id);
            if(linkError){ secondaryWarning='La actividad se guardó, pero no se pudo vincular con Programa.'; reportMutationError(linkError,secondaryWarning); }
          }
        }
      }else if(scheduleEventId){
        const {error:unlinkError}=await supabase.from('camporee_activities').update({schedule_event_id:null}).eq('id',data.id);
        const {error:deleteEventError}=await supabase.from('schedule_events').delete().eq('id',scheduleEventId);
        if(unlinkError||deleteEventError){
          secondaryWarning='La actividad se guardó, pero hubo un problema al quitarla de Programa.';
          reportMutationError(unlinkError||deleteEventError,secondaryWarning);
        }else scheduleEventId=null;
      }

      const selected=formData.getAll('participants').map(String);
      const {error:clearParticipantsError}=await supabase.from('camporee_activity_participants').delete().eq('activity_id',data.id);
      let participantError=clearParticipantsError;
      if(!participantError && selected.length){
        const result=await supabase.from('camporee_activity_participants').insert(selected.map((participant_id)=>({activity_id:data.id,participant_id})));
        participantError=result.error;
      }
      if(participantError){
        secondaryWarning=secondaryWarning || 'La actividad se guardó, pero no se pudieron actualizar todos los participantes.';
        reportMutationError(participantError,secondaryWarning);
      }

      const hydrated={...data,schedule_event_id:scheduleEventId,camporee_activity_participants:selected.map((participant_id)=>({participant_id}))};
      setActivities((current)=>(editing ? current.map((item)=>item.id===data.id?hydrated:item) : [...current,hydrated]).sort((a,b)=>(a.starts_at||'9999').localeCompare(b.starts_at||'9999')));
      setOpen(false);
      setEditing(null);
      setFormError('');
      if(!secondaryWarning) reportMutationSuccess(editing?'Actividad actualizada.':'Actividad guardada.');
      router.refresh();
    } catch(error) {
      const message=reportMutationError(error,'Ocurrió un error al guardar la actividad. Inténtalo otra vez.');
      setFormError(message);
    } finally {
      setSaving(false);
    }
  }

  async function removeActivity(activity:any){
    if(!canEdit || !confirmRemoval('esta competencia o actividad')) return;
    try {
      const linkedEventId=activity.schedule_event_id || null;
      const {error}=await supabase.from('camporee_activities').delete().eq('id',activity.id);
      if(error) throw error;
      setActivities((current)=>current.filter((item)=>item.id!==activity.id));
      let cleanupWarning=false;
      if(linkedEventId){
        const {error:eventError}=await supabase.from('schedule_events').delete().eq('id',linkedEventId);
        if(eventError){
          cleanupWarning=true;
          reportMutationError(eventError,'La actividad se eliminó, pero no se pudo quitar su entrada del Programa.');
        }
      }
      if(!cleanupWarning) reportMutationSuccess('Actividad eliminada.');
      router.refresh();
    } catch(error){ reportMutationError(error,'No se pudo eliminar la actividad.'); }
  }

  return <>
    <div className='panel-tools'>
      <label className='panel-search'><Search size={18}/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder='Buscar competencia o participante'/>{query?<button type='button' onClick={()=>setQuery('')} aria-label='Limpiar'><X size={16}/></button>:null}</label>
      <div className='activity-filter-row'><button type='button' className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>Todas</button>{activityTypes.map(([value,label])=><button type='button' key={value} className={filter===value?'active':''} onClick={()=>setFilter(value)}>{label}</button>)}</div>
      {canEdit?<button type='button' className='panel-add' onClick={openNew}><Plus size={18}/> Agregar actividad</button>:null}
    </div>

    {open?<div className='sheet-backdrop' onClick={closeSheet}><section className='sheet-card activity-sheet' role='dialog' aria-modal='true' onClick={(e)=>e.stopPropagation()}><div className='sheet-handle'/><h2>{editing?'Editar actividad':'Nueva actividad'}</h2><form onSubmit={(event)=>{event.preventDefault();void saveActivity(new FormData(event.currentTarget));}} className='panel-form'>{formError?<div className='auth-alert error' role='alert'>{formError}</div>:null}<input name='title' placeholder='Ej. Competencia de nudos' defaultValue={editing?.title||''} required/><div className='form-two'><select name='activity_type' defaultValue={editing?.activity_type||'competition'}>{activityTypes.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><input name='starts_at' type='datetime-local' defaultValue={localInputValue(editing?.starts_at)}/></div><label className='program-sync-option'><input type='checkbox' name='sync_program' defaultChecked={editing ? Boolean(editing.schedule_event_id) : true}/><span><CalendarCheck size={17}/><b>Mostrar también en Programa</b><small>Si tiene fecha y hora, aparecerá automáticamente en el programa del camporee.</small></span></label><input name='location' placeholder='Lugar' defaultValue={editing?.location||''}/><input name='responsible_name' placeholder='Responsable del club' defaultValue={editing?.responsible_name||''}/><textarea name='materials' placeholder='Materiales necesarios' defaultValue={editing?.materials||''}/><div className='participant-picker'><strong>Participantes</strong><small>Selecciona quiénes representarán al club.</small><div>{participants.map((person)=>{const checked=(editing?.camporee_activity_participants||[]).some((row:any)=>row.participant_id===person.id);return <label key={person.id}><input type='checkbox' name='participants' value={person.id} defaultChecked={checked}/><span><b>{person.full_name}</b><small>{person.unit_name||'Sin unidad'}</small></span></label>})}</div></div><div className='form-two'><input name='result' placeholder='Resultado / posición' defaultValue={editing?.result||''}/><input name='score' type='number' step='0.01' placeholder='Puntuación' defaultValue={editing?.score??''}/></div><textarea name='notes' placeholder='Notas' defaultValue={editing?.notes||''}/><button type='submit' className='primary-btn' disabled={saving}>{saving?'Guardando…':editing?'Guardar cambios':'Guardar actividad'}</button></form></section></div>:null}

    <section className='panel-list activity-list'>{visible.length?visible.map((activity)=>{const selected=(activity.camporee_activity_participants||[]).map((row:any)=>participants.find((p)=>p.id===row.participant_id)).filter(Boolean);return <article className='section-card ios-card activity-card' key={activity.id}><div className='activity-card-head'><span className='stat-icon stat-gold'>{activity.activity_type==='honor'?<Award size={18}/>:activity.result?<Medal size={18}/>:<Trophy size={18}/>}</span><div className='panel-row-copy'><span className='activity-type'>{typeLabel(activity.activity_type)}</span><strong>{activity.title}</strong>{activity.starts_at?<small>{new Date(activity.starts_at).toLocaleString('es-DO',{dateStyle:'medium',timeStyle:'short'})}</small>:null}{activity.schedule_event_id?<small className='activity-program-link'><CalendarCheck size={12}/> En Programa</small>:null}</div>{canEdit?<div className='row-actions'><button type='button' className='row-icon-btn' onClick={()=>openEdit(activity)} aria-label='Editar'><Pencil size={16}/></button><button type='button' className='row-icon-btn danger' onClick={()=>removeActivity(activity)} aria-label='Eliminar'><Trash2 size={16}/></button></div>:null}</div>{activity.location?<div className='activity-detail'><MapPin size={14}/><span>{activity.location}</span></div>:null}{selected.length?<div className='activity-detail'><Users size={14}/><span>{selected.map((p:any)=>p.full_name).join(', ')}</span></div>:null}{activity.materials?<div className='activity-materials'><strong>Materiales</strong><span>{activity.materials}</span></div>:null}{activity.result||activity.score!==null&&activity.score!==undefined?<div className='activity-result'><Medal size={17}/><div><strong>{activity.result||'Resultado registrado'}</strong>{activity.score!==null&&activity.score!==undefined?<small>{activity.score} puntos</small>:null}</div></div>:null}{activity.responsible_name?<small className='activity-responsible'>Responsable: {activity.responsible_name}</small>:null}</article>}) : <div className='empty compact'><Trophy size={22}/> Todavía no hay competencias o actividades registradas.</div>}</section>
  </>;
}
