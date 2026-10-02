'use client';

import BottomSheet from '@/app/components/bottom-sheet';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Circle, ListChecks, Pencil, Plus, Search, Trash2, UserRound } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { confirmRemoval, reportMutationError, reportMutationSuccess } from '@/lib/client-ui';

const toLocalInput=(value?:string|null)=>{if(!value)return'';const d=new Date(value);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10)};
const toIso=(value:string)=>value?new Date(value+'T00:00:00').toISOString():null;

export default function TaskManager({ camporeeId, userId, canEdit, initialTasks, areas, assignees }: { camporeeId: string; userId: string; canEdit: boolean; initialTasks: any[]; areas: any[]; assignees:any[] }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any|null>(null);
  const [checklistFor, setChecklistFor] = useState<any|null>(null);
  const [saving, setSaving] = useState(false);
  const [formError,setFormError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all'|'done'|'mine'>('all');
  const [phaseFilter, setPhaseFilter] = useState('all');
  const supabase = createClient();
  const router = useRouter();
  const assigneeMap = useMemo(() => new Map(assignees.map((person:any)=>[person.id, person.full_name || person.email || 'Usuario'])), [assignees]);

  useEffect(() => { setTasks(initialTasks); }, [initialTasks]);

  const visible = useMemo(() => {
    return tasks.filter((task) => {
      const responsible = task.assigned_to ? assigneeMap.get(task.assigned_to) ?? '' : '';
      const textOk = `${task.title} ${task.description ?? ''} ${responsible}`.toLowerCase().includes(query.toLowerCase());
      const filterOk = filter === 'all' ? task.status !== 'done' && task.status !== 'cancelled' : filter === 'done' ? task.status === 'done' : task.assigned_to === userId;
      return textOk && filterOk && (phaseFilter === 'all' || task.phase === phaseFilter);
    });
  }, [tasks, query, filter, phaseFilter, assigneeMap, userId]);

  function openTask(task?:any){setEditing(task??null);setFormError('');setOpen(true)}
  function closeTask(){if(saving)return;setOpen(false);setEditing(null);setFormError('')}

  async function saveTask(formData: FormData) {
    if (!canEdit || saving) return;
    const title = String(formData.get('title') || '').trim();
    if (!title){setFormError('Escribe el nombre de la tarea.');return;}
    setSaving(true);setFormError('');
    try{
      const dueLocal=String(formData.get('due_at')||'');
      const payload:any = { camporee_id:camporeeId, title, description:String(formData.get('description')||'').trim()||null, area_id:String(formData.get('area_id')||'')||null, priority:String(formData.get('priority')||'normal'), due_at:dueLocal===toLocalInput(editing?.due_at)?editing?.due_at??null:toIso(dueLocal), phase:String(formData.get('phase')||'before'), assigned_to:String(formData.get('assigned_to')||'')||null };
      if (!editing) { payload.created_by = userId; payload.status = 'pending'; }
      const queryBuilder = editing ? supabase.from('tasks').update({...payload,updated_at:new Date().toISOString()}).eq('id',editing.id) : supabase.from('tasks').insert(payload);
      const { data, error } = await queryBuilder.select('id,title,description,status,priority,due_at,area_id,phase,assigned_to').single();
      if(error||!data){const message=reportMutationError(error,'No se pudo guardar la tarea.');setFormError(message);return;}
      const hydrated = editing ? {...editing,...data} : {...data,task_checklist_items:[]};
      setTasks((current)=> editing ? current.map((item)=>item.id===data.id?hydrated:item) : [hydrated,...current]);
      reportMutationSuccess(editing?'Tarea actualizada.':'Tarea creada.');setOpen(false);setEditing(null);setFormError('');router.refresh();
    }catch(error){const message=reportMutationError(error,'No se pudo guardar la tarea.');setFormError(message)}finally{setSaving(false)}
  }

  async function toggleTask(task:any){if(!canEdit)return;const next=task.status==='done'?'pending':'done';const{error}=await supabase.from('tasks').update({status:next,updated_at:new Date().toISOString()}).eq('id',task.id);if(error){reportMutationError(error,'No se pudo actualizar la tarea.');return;}setTasks((cur)=>cur.map((item)=>item.id===task.id?{...item,status:next}:item));router.refresh()}
  async function removeTask(id:string){if(!canEdit||!confirmRemoval('esta tarea'))return;const{error}=await supabase.from('tasks').delete().eq('id',id);if(error){reportMutationError(error,'No se pudo eliminar la tarea.');return;}setTasks((cur)=>cur.filter((item)=>item.id!==id));reportMutationSuccess('Tarea eliminada.');router.refresh()}
  async function addChecklistItem(formData:FormData){if(!canEdit||!checklistFor)return;const label=String(formData.get('label')||'').trim();if(!label)return;const{data,error}=await supabase.from('task_checklist_items').insert({task_id:checklistFor.id,label}).select('id,label,is_done,sort_order').single();if(error||!data){reportMutationError(error,'No se pudo agregar el paso.');return;}setTasks((cur)=>cur.map((task)=>task.id===checklistFor.id?{...task,task_checklist_items:[...(task.task_checklist_items||[]),data]}:task));setChecklistFor((cur:any)=>({...cur,task_checklist_items:[...(cur.task_checklist_items||[]),data]}));reportMutationSuccess('Paso agregado.');router.refresh()}
  async function toggleChecklist(taskId:string,item:any){if(!canEdit)return;const next=!item.is_done;const{error}=await supabase.from('task_checklist_items').update({is_done:next}).eq('id',item.id);if(error){reportMutationError(error,'No se pudo actualizar el checklist.');return;}setTasks((cur)=>cur.map((task)=>task.id===taskId?{...task,task_checklist_items:(task.task_checklist_items||[]).map((it:any)=>it.id===item.id?{...it,is_done:next}:it)}:task));setChecklistFor((cur:any)=>cur?{...cur,task_checklist_items:(cur.task_checklist_items||[]).map((it:any)=>it.id===item.id?{...it,is_done:next}:it)}:cur);router.refresh()}
  async function removeChecklist(taskId:string,itemId:string){if(!canEdit||!confirmRemoval('este paso'))return;const{error}=await supabase.from('task_checklist_items').delete().eq('id',itemId);if(error){reportMutationError(error,'No se pudo eliminar el paso.');return;}setTasks((cur)=>cur.map((task)=>task.id===taskId?{...task,task_checklist_items:(task.task_checklist_items||[]).filter((it:any)=>it.id!==itemId)}:task));setChecklistFor((cur:any)=>cur?{...cur,task_checklist_items:(cur.task_checklist_items||[]).filter((it:any)=>it.id!==itemId)}:cur);router.refresh()}

  return <>
    <section className='polymet-task-progress'><div><strong>Progreso general</strong><b>{tasks.length ? Math.round(tasks.filter((task)=>task.status==='done').length/tasks.length*100) : 0}%</b></div><span><i style={{width:`${tasks.length ? Math.round(tasks.filter((task)=>task.status==='done').length/tasks.length*100) : 0}%`}}/></span></section>
    <div className='panel-tools polymet-task-tools'><label className='panel-search'><Search size={17}/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder='Buscar tareas o responsable'/>{query?<button type='button' onClick={()=>setQuery('')}>×</button>:null}</label><div className='filter-chips'>{[['all','Pendientes',tasks.filter((task)=>task.status!=='done'&&task.status!=='cancelled').length],['done','Completadas',tasks.filter((task)=>task.status==='done').length],['mine','Mis tareas',tasks.filter((task)=>task.assigned_to===userId).length]].map(([key,label,count])=><button type='button' key={key} className={filter===key?'active':''} onClick={()=>setFilter(key as 'all'|'done'|'mine')}>{label} <span>{count}</span></button>)}</div><div className='filter-chips polymet-task-phases'>{[['all','Todas las etapas'],['before','Antes'],['during','Durante'],['after','Después']].map(([key,label])=><button type='button' key={key} className={phaseFilter===key?'active':''} onClick={()=>setPhaseFilter(key)}>{label}</button>)}</div>{canEdit?<button type='button' className='panel-add' onClick={()=>openTask()}><Plus size={18}/> Tarea</button>:null}</div>
    <BottomSheet open={Boolean(open)} onClose={closeTask} title={<>{editing?'Editar tarea':'Nueva tarea'}</>} busy={saving}><form onSubmit={(event)=>{event.preventDefault();void saveTask(new FormData(event.currentTarget));}} className="panel-form task-edit-form pm-sheet-form"><div className="pm-sheet-fields">{formError?<div className='auth-alert error' role='alert'>{formError}</div>:null}<label className="pm-field"><span>Tarea <b className="pm-required">*</b></span><input name='title' defaultValue={editing?.title??''}  required/></label><label className="pm-field"><span>Descripción</span><textarea name='description' defaultValue={editing?.description??''} /></label><input type="hidden" name="area_id" value={editing?.area_id??''}/><label className="pm-field"><span>Responsable</span><select name='assigned_to' defaultValue={editing?.assigned_to??''}><option value=''>Sin responsable</option>{assignees.map((person:any)=><option key={person.id} value={person.id}>{person.full_name || person.email || 'Usuario'}</option>)}</select></label><div className='form-two'><label className="pm-field"><span>Prioridad</span><select name='priority' defaultValue={editing?.priority??'normal'}><option value='low'>Baja</option><option value='normal'>Media</option><option value='high'>Alta</option><option value='urgent'>Urgente</option></select></label><label className="pm-field"><span>Etapa</span><select name='phase' defaultValue={editing?.phase??'before'}><option value='before'>Preparación</option><option value='during'>Durante</option><option value='after'>Cierre</option></select></label></div><label className='pm-field'><span>Fecha límite</span><input name='due_at' type='date' defaultValue={toLocalInput(editing?.due_at)}/></label></div><div className="pm-sheet-footer"><button type='submit' className='primary-btn' disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button></div></form></BottomSheet>
    <BottomSheet open={Boolean(checklistFor)} onClose={()=>setChecklistFor(null)} title={<>{checklistFor?.title || ""}</>} busy={saving}><div className='panel-list'>{(checklistFor?.task_checklist_items||[]).map((item:any)=><article className={'panel-row '+(item.is_done?'is-done':'')} key={item.id}><button type='button' className='status-btn' onClick={()=>toggleChecklist(checklistFor.id,item)}>{item.is_done?<Check size={17}/>:<Circle size={17}/>}</button><div className='panel-row-copy'><strong>{item.label}</strong></div>{canEdit?<button type='button' className='row-icon-btn danger' onClick={()=>removeChecklist(checklistFor.id,item.id)}><Trash2 size={15}/></button>:null}</article>)}</div>{canEdit?<form onSubmit={(event)=>{event.preventDefault();void addChecklistItem(new FormData(event.currentTarget));event.currentTarget.reset();}} className='panel-form' style={{marginTop:12}}><div className='inline-add'><label className="pm-field"><span>Elemento <b className="pm-required">*</b></span><input name='label'  required/></label><button type='submit' className='primary-btn'>Agregar</button></div></form>:null}</BottomSheet>
    <section className='panel-list polymet-task-list'>{visible.length?visible.map((task)=>{const done=(task.task_checklist_items||[]).filter((it:any)=>it.is_done).length;const total=(task.task_checklist_items||[]).length;const responsible=task.assigned_to?assigneeMap.get(task.assigned_to):null;return <article className={'panel-row ios-card polymet-task-row '+(task.status==='done'?'is-done':'')} key={task.id}><button type='button' className='status-btn' onClick={()=>toggleTask(task)} disabled={!canEdit} aria-label={task.status==='done'?'Marcar pendiente':'Completar tarea'}>{task.status==='done'?<Check size={18}/>:null}</button><div className='panel-row-copy' role='button' tabIndex={0} onClick={()=>setChecklistFor(task)} onKeyDown={(event)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();setChecklistFor(task)}}}><strong>{task.title}</strong><div className='polymet-task-tags'><span className={`polymet-task-priority ${task.priority}`}>{task.priority==='urgent'?'Urgente':task.priority==='high'?'Alta':task.priority==='low'?'Baja':'Media'}</span><span>{task.phase==='during'?'En curso':task.phase==='after'?'Después':'Preparación'}</span>{total?<span className='polymet-task-checks'><ListChecks size={12}/>{done}/{total}</span>:null}</div><div className='polymet-task-meta'>{responsible?<small><UserRound size={12}/>{responsible}</small>:null}{task.due_at?<small>{new Date(task.due_at).toLocaleDateString('es-DO',{day:'numeric',month:'short'})}</small>:null}</div></div><div className='row-actions'>{canEdit?<button type='button' className='row-icon-btn' onClick={()=>openTask(task)} aria-label='Editar'><Pencil size={16}/></button>:null}<button type='button' className='row-icon-btn' onClick={()=>setChecklistFor(task)} aria-label='Checklist'><ListChecks size={16}/></button>{canEdit?<button type='button' className='row-icon-btn danger' onClick={()=>removeTask(task.id)} aria-label='Eliminar'><Trash2 size={17}/></button>:null}</div></article>}) : <div className='empty compact'>No hay tareas en este filtro.</div>}</section>
  </>;
}
