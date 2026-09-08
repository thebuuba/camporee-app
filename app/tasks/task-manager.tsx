'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Circle, ListChecks, Pencil, Plus, Search, Trash2, UserRound } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { confirmRemoval } from '@/lib/client-ui';

const toLocalInput=(value?:string|null)=>{if(!value)return'';const d=new Date(value);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)};
const toIso=(value:string)=>value?new Date(value).toISOString():null;
const localDateKey=(value:Date|string)=>{const d=typeof value==='string'?new Date(value):value;const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return`${y}-${m}-${day}`};

export default function TaskManager({ camporeeId, userId, canEdit, initialTasks, areas, assignees }: { camporeeId: string; userId: string; canEdit: boolean; initialTasks: any[]; areas: any[]; assignees:any[] }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any|null>(null);
  const [checklistFor, setChecklistFor] = useState<any|null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all'|'today'|'urgent'|'done'>('all');
  const supabase = createClient();
  const router = useRouter();
  const assigneeMap = useMemo(() => new Map(assignees.map((person:any)=>[person.id, person.full_name || person.email || 'Usuario'])), [assignees]);

  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  const visible = useMemo(() => {
    const today = localDateKey(new Date());
    return tasks.filter((task) => {
      const responsible = task.assigned_to ? assigneeMap.get(task.assigned_to) ?? '' : '';
      const textOk = `${task.title} ${task.description ?? ''} ${responsible}`.toLowerCase().includes(query.toLowerCase());
      const taskDay = task.due_at ? localDateKey(task.due_at) : '';
      const filterOk = filter === 'all' ? task.status !== 'done' : filter === 'done' ? task.status === 'done' : filter === 'urgent' ? task.status !== 'done' && ['urgent','high'].includes(task.priority) : task.status !== 'done' && taskDay === today;
      return textOk && filterOk;
    });
  }, [tasks, query, filter, assigneeMap]);

  async function saveTask(formData: FormData) {
    if (!canEdit || saving) return;
    const title = String(formData.get('title') || '').trim();
    if (!title) return;
    setSaving(true);
    const dueLocal=String(formData.get('due_at')||'');
    const payload:any = { camporee_id:camporeeId, title, description:String(formData.get('description')||'').trim()||null, area_id:String(formData.get('area_id')||'')||null, priority:String(formData.get('priority')||'normal'), due_at:toIso(dueLocal), phase:String(formData.get('phase')||'before'), assigned_to:String(formData.get('assigned_to')||'')||null };
    if (!editing) { payload.created_by = userId; payload.status = 'pending'; }
    const queryBuilder = editing ? supabase.from('tasks').update({...payload,updated_at:new Date().toISOString()}).eq('id',editing.id) : supabase.from('tasks').insert(payload);
    const { data, error } = await queryBuilder.select('id,title,description,status,priority,due_at,area_id,phase,assigned_to').single();
    setSaving(false);
    if (!error && data) {
      const hydrated = editing ? {...editing,...data} : {...data,task_checklist_items:[]};
      setTasks((current)=> editing ? current.map((item)=>item.id===data.id?hydrated:item) : [hydrated,...current]);
      setEditing(null);
      setOpen(false);
      router.refresh();
    }
  }

  async function toggleTask(task:any){ if(!canEdit)return; const next=task.status==='done'?'pending':'done'; const {error}=await supabase.from('tasks').update({status:next,updated_at:new Date().toISOString()}).eq('id',task.id); if(!error){setTasks((cur)=>cur.map((item)=>item.id===task.id?{...item,status:next}:item));router.refresh();} }
  async function removeTask(id:string){ if(!canEdit||!confirmRemoval('esta tarea'))return; const {error}=await supabase.from('tasks').delete().eq('id',id); if(!error){setTasks((cur)=>cur.filter((item)=>item.id!==id));router.refresh();} }
  async function addChecklistItem(formData:FormData){ if(!canEdit||!checklistFor)return; const label=String(formData.get('label')||'').trim(); if(!label)return; const {data,error}=await supabase.from('task_checklist_items').insert({task_id:checklistFor.id,label}).select('id,label,is_done,sort_order').single(); if(!error&&data){setTasks((cur)=>cur.map((task)=>task.id===checklistFor.id?{...task,task_checklist_items:[...(task.task_checklist_items||[]),data]}:task));setChecklistFor((cur:any)=>({...cur,task_checklist_items:[...(cur.task_checklist_items||[]),data]}));router.refresh();}}
  async function toggleChecklist(taskId:string,item:any){if(!canEdit)return;const next=!item.is_done;const{error}=await supabase.from('task_checklist_items').update({is_done:next}).eq('id',item.id);if(!error){setTasks((cur)=>cur.map((task)=>task.id===taskId?{...task,task_checklist_items:(task.task_checklist_items||[]).map((it:any)=>it.id===item.id?{...it,is_done:next}:it)}:task));setChecklistFor((cur:any)=>cur?{...cur,task_checklist_items:(cur.task_checklist_items||[]).map((it:any)=>it.id===item.id?{...it,is_done:next}:it)}:cur);router.refresh();}}
  async function removeChecklist(taskId:string,itemId:string){if(!canEdit||!confirmRemoval('este paso'))return;const{error}=await supabase.from('task_checklist_items').delete().eq('id',itemId);if(!error){setTasks((cur)=>cur.map((task)=>task.id===taskId?{...task,task_checklist_items:(task.task_checklist_items||[]).filter((it:any)=>it.id!==itemId)}:task));setChecklistFor((cur:any)=>cur?{...cur,task_checklist_items:(cur.task_checklist_items||[]).filter((it:any)=>it.id!==itemId)}:cur);router.refresh();}}

  return <>
    <div className='panel-tools'><label className='panel-search'><Search size={17}/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder='Buscar tareas o responsable'/>{query?<button type='button' onClick={()=>setQuery('')}>×</button>:null}</label><div className='filter-chips'>{[['all','Pendientes'],['today','Hoy'],['urgent','Prioridad'],['done','Completadas']].map(([key,label])=><button key={key} className={filter===key?'active':''} onClick={()=>setFilter(key as any)}>{label}</button>)}</div>{canEdit?<button className='panel-add' onClick={()=>{setEditing(null);setOpen(true)}}><Plus size={18}/> Nueva tarea</button>:null}</div>
    {open?<div className='sheet-backdrop' onClick={()=>{setOpen(false);setEditing(null)}}><section className='sheet-card' role='dialog' aria-modal='true' onClick={(e)=>e.stopPropagation()}><div className='sheet-handle'/><h2>{editing?'Editar tarea':'Nueva tarea'}</h2><form action={saveTask} className='panel-form'><input name='title' defaultValue={editing?.title??''} placeholder='¿Qué hay que hacer?' required/><textarea name='description' defaultValue={editing?.description??''} placeholder='Detalles opcionales'/><div className='form-two'><select name='area_id' defaultValue={editing?.area_id??''}><option value=''>Sin área</option>{areas.map((area)=><option key={area.id} value={area.id}>{area.name}</option>)}</select><select name='assigned_to' defaultValue={editing?.assigned_to??''}><option value=''>Sin responsable</option>{assignees.map((person:any)=><option key={person.id} value={person.id}>{person.full_name || person.email || 'Usuario'}</option>)}</select></div><div className='form-two'><select name='priority' defaultValue={editing?.priority??'normal'}><option value='low'>Baja</option><option value='normal'>Normal</option><option value='high'>Alta</option><option value='urgent'>Urgente</option></select><select name='phase' defaultValue={editing?.phase??'before'}><option value='before'>Preparación</option><option value='during'>Durante</option><option value='after'>Regreso</option></select></div><input name='due_at' type='datetime-local' defaultValue={toLocalInput(editing?.due_at)}/><button className='primary-btn' disabled={saving}>{saving?'Guardando…':editing?'Guardar cambios':'Crear tarea'}</button></form></section></div>:null}
    {checklistFor?<div className='sheet-backdrop' onClick={()=>setChecklistFor(null)}><section className='sheet-card' role='dialog' aria-modal='true' onClick={(e)=>e.stopPropagation()}><div className='sheet-handle'/><h2>Checklist · {checklistFor.title}</h2><div className='panel-list'>{(checklistFor.task_checklist_items||[]).map((item:any)=><article className={'panel-row '+(item.is_done?'is-done':'')} key={item.id}><button className='status-btn' onClick={()=>toggleChecklist(checklistFor.id,item)}>{item.is_done?<Check size={17}/>:<Circle size={17}/>}</button><div className='panel-row-copy'><strong>{item.label}</strong></div>{canEdit?<button className='row-icon-btn danger' onClick={()=>removeChecklist(checklistFor.id,item.id)}><Trash2 size={15}/></button>:null}</article>)}</div>{canEdit?<form action={addChecklistItem} className='panel-form' style={{marginTop:12}}><div className='inline-add'><input name='label' placeholder='Nuevo paso o elemento' required/><button className='primary-btn'>Agregar</button></div></form>:null}</section></div>:null}
    <section className='panel-list'>{visible.length?visible.map((task)=>{const done=(task.task_checklist_items||[]).filter((it:any)=>it.is_done).length;const total=(task.task_checklist_items||[]).length;const responsible=task.assigned_to?assigneeMap.get(task.assigned_to):null;return <article className={'panel-row ios-card '+(task.status==='done'?'is-done':'')} key={task.id}><button className='status-btn' onClick={()=>toggleTask(task)} disabled={!canEdit}>{task.status==='done'?<Check size={18}/>:<Circle size={18}/>}</button><div className='panel-row-copy'><strong>{task.title}</strong><small><span className={`priority-dot ${task.priority}`}/>{task.priority==='urgent'?'Urgente':task.priority==='high'?'Alta':task.priority==='low'?'Baja':'Normal'}{task.due_at?' · '+new Date(task.due_at).toLocaleString('es-DO',{dateStyle:'short',timeStyle:'short'}):''}</small>{responsible?<small><UserRound size={12}/>{responsible}</small>:null}{total?<small>{done}/{total} del checklist</small>:null}</div><div className='row-actions'>{canEdit?<button className='row-icon-btn' onClick={()=>{setEditing(task);setOpen(true)}} aria-label='Editar'><Pencil size={16}/></button>:null}<button className='row-icon-btn' onClick={()=>setChecklistFor(task)} aria-label='Checklist'><ListChecks size={16}/></button>{canEdit?<button className='row-icon-btn danger' onClick={()=>removeTask(task.id)} aria-label='Eliminar'><Trash2 size={17}/></button>:null}</div></article>}) : <div className='empty compact'>No hay tareas en este filtro.</div>}</section>
  </>;
}
