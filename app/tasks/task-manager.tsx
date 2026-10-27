'use client';

import BottomSheet from '@/app/components/bottom-sheet';
import { mutationProblem, mutationNotice } from '@/lib/mutation-result';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Circle, ListChecks, Pencil, Plus, Search, Trash2, UserRound } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { confirmRemoval, reportMutationError, reportMutationSuccess } from '@/lib/client-ui';

import { camporeeDateTimeInput, camporeeDateTimeIso } from '@/lib/camporee-locale';

export function TaskSwipeRow({title,opened,onOpenChange,onEdit,onDetails,onDelete,children}:{
  title:string;opened:boolean;onOpenChange:(opened:boolean)=>void;onEdit?:()=>void;onDetails:()=>void;onDelete?:()=>void;children:ReactNode;
}){
  const width=onEdit?168:56;
  const root=useRef<HTMLDivElement>(null);
  const gesture=useRef<{x:number;y:number;start:number;last:number;horizontal:boolean}|null>(null);
  const ignoreClickUntil=useRef(0);
  const [dragOffset,setDragOffset]=useState<number|null>(null);
  const offset=dragOffset??(opened?width:0);
  useEffect(()=>{
    if(!opened)return;
    const outside=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))onOpenChange(false);};
    document.addEventListener('pointerdown',outside);
    return()=>document.removeEventListener('pointerdown',outside);
  },[opened,onOpenChange]);
  function start(event:ReactPointerEvent<HTMLDivElement>){
    if(!event.isPrimary||event.button!==0||(event.target as Element).closest('button,a,input,select,textarea'))return;
    gesture.current={x:event.clientX,y:event.clientY,start:offset,last:offset,horizontal:false};
  }
  function move(event:ReactPointerEvent<HTMLDivElement>){
    if(!event.isPrimary)return;
    const drag=gesture.current;if(!drag)return;
    const dx=drag.x-event.clientX,dy=event.clientY-drag.y;
    if(!drag.horizontal){
      if(Math.max(Math.abs(dx),Math.abs(dy))<8)return;
      if(Math.abs(dy)>=Math.abs(dx)){gesture.current=null;return;}
      drag.horizontal=true;event.currentTarget.setPointerCapture(event.pointerId);
    }
    drag.last=Math.min(width,Math.max(0,drag.start+dx));
    ignoreClickUntil.current=Date.now()+400;setDragOffset(drag.last);
  }
  function finish(event:ReactPointerEvent<HTMLDivElement>,cancelled=false){
    if(!event.isPrimary)return;
    const drag=gesture.current;gesture.current=null;
    if(drag?.horizontal){
      ignoreClickUntil.current=Date.now()+400;
      if(!cancelled)onOpenChange(drag.last>=width*.4);
      if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragOffset(null);
  }
  function action(callback:()=>void){onOpenChange(false);root.current?.querySelector<HTMLElement>('.task-swipe-surface')?.focus({preventScroll:true});callback();}
  return <div ref={root} className='task-swipe-row' data-open={opened} data-dragging={dragOffset!==null} style={{'--task-swipe-width':`${width}px`,'--task-swipe-offset':`${offset}px`} as CSSProperties}
    onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))onOpenChange(false);}}
    onKeyDown={event=>{
      if(event.key==='ArrowLeft'){event.preventDefault();onOpenChange(true);requestAnimationFrame(()=>root.current?.querySelector<HTMLElement>('.task-swipe-actions button')?.focus({preventScroll:true}));}
      else if(event.key==='ArrowRight'||event.key==='Escape'){event.preventDefault();onOpenChange(false);root.current?.querySelector<HTMLElement>('.task-swipe-surface')?.focus();}
    }}>
    <div className={`task-swipe-surface${dragOffset!==null?' is-dragging':''}`} style={{transform:`translateX(${-offset}px)`}}
      role='group' tabIndex={0} aria-label={`Acciones de ${title}. Desliza hacia la izquierda o usa la flecha izquierda.`}
      onPointerDown={start} onPointerMove={move} onPointerUp={event=>finish(event)} onPointerCancel={event=>finish(event,true)}
      onContextMenu={event=>{event.preventDefault();ignoreClickUntil.current=Date.now()+400;onOpenChange(true);}}
      onClickCapture={event=>{if(Date.now()<ignoreClickUntil.current||opened){event.preventDefault();event.stopPropagation();if(Date.now()>=ignoreClickUntil.current)onOpenChange(false);}}}>
      {children}
    </div>
    <div className='task-swipe-actions' aria-hidden={!opened} inert={!opened}>
      {onEdit?<button type='button' className='task-swipe-action task-swipe-edit' aria-label='Editar' onClick={()=>action(onEdit)}><Pencil size={18}/><span>Editar</span></button>:null}
      <button type='button' className='task-swipe-action task-swipe-details' aria-label='Checklist' onClick={()=>action(onDetails)}><ListChecks size={18}/><span>Checklist</span></button>
      {onDelete?<button type='button' className='task-swipe-action task-swipe-delete' aria-label='Eliminar' onClick={()=>action(onDelete)}><Trash2 size={18}/><span>Eliminar</span></button>:null}
    </div>
  </div>;
}

export default function TaskManager({ camporeeId, userId, canEdit, initialTasks, areas, assignees, participants: initialParticipants, initialPhase = 'all', timeZone = 'America/Santo_Domingo' }: { camporeeId: string; userId: string; canEdit: boolean; initialTasks: any[]; areas: any[]; assignees:any[]; participants:any[]; initialPhase?: string; timeZone?: string }) {
  const toLocalInput=(value?:string|null)=>camporeeDateTimeInput(value,timeZone).slice(0,16);
  const toIso=(value:string)=>value?camporeeDateTimeIso(value,timeZone):null;
  const [tasks, setTasks] = useState(initialTasks);
  const [participants,setParticipants] = useState(initialParticipants);
  const [addingPerson,setAddingPerson] = useState(false);
  const [personName,setPersonName] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any|null>(null);
  const [checklistFor, setChecklistFor] = useState<any|null>(null);
  const [saving, setSaving] = useState(false);
  const [formError,setFormError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all'|'done'|'mine'>('all');
  const [phaseFilter, setPhaseFilter] = useState(initialPhase);
  const [swipedTaskId,setSwipedTaskId]=useState<string|null>(null);
  const supabase = createClient();
  const router = useRouter();
  const assigneeMap = useMemo(() => new Map(assignees.map((person:any)=>[person.id, `${person.full_name || person.email || 'Usuario'}${person.directive_role ? ` · ${person.directive_role}` : ''}`])), [assignees]);

  useEffect(() => { setTasks(initialTasks); }, [initialTasks]);
  useEffect(() => { setPhaseFilter(initialPhase); }, [initialPhase]);
  useEffect(()=>{setSwipedTaskId(null);},[initialTasks,query,filter,phaseFilter]);

  const visible = useMemo(() => {
    return tasks.filter((task) => {
      const responsible = task.assigned_participant_id ? participants.find((p:any)=>p.id===task.assigned_participant_id)?.full_name??'' : task.assigned_to ? assigneeMap.get(task.assigned_to) ?? '' : '';
      const textOk = `${task.title} ${task.description ?? ''} ${responsible}`.toLowerCase().includes(query.toLowerCase());
      const filterOk = filter === 'all' ? task.status !== 'done' && task.status !== 'cancelled' : filter === 'done' ? task.status === 'done' : task.assigned_to === userId;
      return textOk && filterOk && (phaseFilter === 'all' || task.phase === phaseFilter);
    });
  }, [tasks, query, filter, phaseFilter, assigneeMap, userId, participants]);

  function openTask(task?:any){setEditing(task??null);setFormError('');setOpen(true)}
  function closeTask(){if(saving)return;setOpen(false);setEditing(null);setFormError('')}

  async function saveTask(formData: FormData) {
    if (!canEdit || saving) return;
    const title = String(formData.get('title') || '').trim();
    if (!title){setFormError('Escribe el nombre de la tarea.');return;}
    setSaving(true);setFormError('');
    try{
      const dueLocal=String(formData.get('due_at')||'');
      const payload:any = { camporee_id:camporeeId, title, description:String(formData.get('description')||'').trim()||null, area_id:String(formData.get('area_id')||'')||null, priority:String(formData.get('priority')||'normal'), due_at:dueLocal===toLocalInput(editing?.due_at)?editing?.due_at??null:toIso(dueLocal), phase:String(formData.get('phase')||'before'), assigned_to:String(formData.get('assigned_to')||'').startsWith('user:')?String(formData.get('assigned_to')).slice(5):null, assigned_participant_id:String(formData.get('assigned_to')||'').startsWith('person:')?String(formData.get('assigned_to')).slice(7):null };
      if (!editing) { payload.created_by = userId; payload.status = 'pending'; }
      const queryBuilder = editing ? supabase.from('tasks').update({...payload,updated_at:new Date().toISOString()}).eq('id',editing.id).eq('camporee_id',camporeeId) : supabase.from('tasks').insert(payload);
      const result = await queryBuilder.select('id,title,description,status,priority,due_at,area_id,phase,assigned_to,assigned_participant_id').single(); const { data, status } = result; const error = mutationProblem(result, editing ? [editing.id] : undefined);
      if(error||!data){const message=reportMutationError(error,'No se pudo guardar la tarea.');setFormError(message);return;}
      const hydrated = editing ? {...editing,...data} : {...data,task_checklist_items:[]};
      setTasks((current)=> editing ? current.map((item)=>item.id===data.id?hydrated:item) : [hydrated,...current]);
      reportMutationSuccess(mutationNotice(status, editing?'Tarea actualizada.':'Tarea creada.'));setOpen(false);setEditing(null);setFormError('');if(status!==202)router.refresh();
    }catch(error){const message=reportMutationError(error,'No se pudo guardar la tarea.');setFormError(message)}finally{setSaving(false)}
  }

  async function toggleTask(task:any){if(!canEdit)return;const next=task.status==='done'?'pending':'done';const result=await supabase.from('tasks').update({status:next,updated_at:new Date().toISOString()}).eq('id',task.id).eq('camporee_id',camporeeId).select('id').single();const error=mutationProblem(result,[task.id]);const status=result.status;if(error){reportMutationError(error,'No se pudo actualizar la tarea.');return;}setTasks((cur)=>cur.map((item)=>item.id===task.id?{...item,status:next}:item));if(status===202)reportMutationSuccess(mutationNotice(status,''));else router.refresh()}
  async function removeTask(id:string){if(!canEdit||!confirmRemoval('esta tarea'))return;const result=await supabase.from('tasks').delete().eq('id',id).eq('camporee_id',camporeeId).select('id').single();const error=mutationProblem(result,[id]);const status=result.status;if(error){reportMutationError(error,'No se pudo eliminar la tarea.');return;}setTasks((cur)=>cur.filter((item)=>item.id!==id));reportMutationSuccess(mutationNotice(status, 'Tarea eliminada.'));if(status!==202)router.refresh()}
  async function toggleChecklist(taskId:string,item:any){if(!canEdit)return;const next=!item.is_done;const result=await supabase.from('task_checklist_items').update({is_done:next}).eq('id',item.id).eq('task_id',taskId).select('id').single();const error=mutationProblem(result,[item.id]);const status=result.status;if(error){reportMutationError(error,'No se pudo actualizar el checklist.');return;}setTasks((cur)=>cur.map((task)=>task.id===taskId?{...task,task_checklist_items:(task.task_checklist_items||[]).map((it:any)=>it.id===item.id?{...it,is_done:next}:it)}:task));setChecklistFor((cur:any)=>cur?{...cur,task_checklist_items:(cur.task_checklist_items||[]).map((it:any)=>it.id===item.id?{...it,is_done:next}:it)}:cur);if(status===202)reportMutationSuccess(mutationNotice(status,''));else router.refresh()}
  async function removeChecklist(taskId:string,itemId:string){if(!canEdit||!confirmRemoval('este paso'))return;const result=await supabase.from('task_checklist_items').delete().eq('id',itemId).eq('task_id',taskId).select('id').single();const error=mutationProblem(result,[itemId]);const status=result.status;if(error){reportMutationError(error,'No se pudo eliminar el paso.');return;}setTasks((cur)=>cur.map((task)=>task.id===taskId?{...task,task_checklist_items:(task.task_checklist_items||[]).filter((it:any)=>it.id!==itemId)}:task));setChecklistFor((cur:any)=>cur?{...cur,task_checklist_items:(cur.task_checklist_items||[]).filter((it:any)=>it.id!==itemId)}:cur);if(status===202)reportMutationSuccess(mutationNotice(status,''));else router.refresh()}

  return <>
    <section className='polymet-task-progress'><div><strong>Progreso general</strong><b>{tasks.length ? Math.round(tasks.filter((task)=>task.status==='done').length/tasks.length*100) : 0}%</b></div><span><i style={{width:`${tasks.length ? Math.round(tasks.filter((task)=>task.status==='done').length/tasks.length*100) : 0}%`}}/></span></section>
    <div className='panel-tools polymet-task-tools'><label className='panel-search'><Search size={17}/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder='Buscar tareas o responsable'/>{query?<button type='button' onClick={()=>setQuery('')}>×</button>:null}</label><div className='filter-chips'>{[['all','Pendientes',tasks.filter((task)=>task.status!=='done'&&task.status!=='cancelled').length],['done','Completadas',tasks.filter((task)=>task.status==='done').length],['mine','Mis tareas',tasks.filter((task)=>task.assigned_to===userId).length]].map(([key,label,count])=><button type='button' key={key} className={filter===key?'active':''} onClick={()=>setFilter(key as 'all'|'done'|'mine')}>{label} <span>{count}</span></button>)}</div><div className='filter-chips polymet-task-phases'>{[['all','Todas las etapas'],['before','Antes'],['during','Durante'],['after','Después']].map(([key,label])=><button type='button' key={key} className={phaseFilter===key?'active':''} onClick={()=>setPhaseFilter(key)}>{label}</button>)}</div>{canEdit?<button type='button' className='panel-add' onClick={()=>openTask()}><Plus size={18}/> Tarea</button>:null}</div>
    <BottomSheet open={Boolean(open)} onClose={closeTask} title={<>{editing?'Editar tarea':'Nueva tarea'}</>} busy={saving}><form onSubmit={(event)=>{event.preventDefault();void saveTask(new FormData(event.currentTarget));}} className="panel-form task-edit-form pm-sheet-form"><div className="pm-sheet-fields">{formError?<div className='auth-alert error' role='alert'>{formError}</div>:null}<label className="pm-field"><span>Tarea <b className="pm-required">*</b></span><input name='title' defaultValue={editing?.title??''}  required/></label><label className="pm-field"><span>Descripción</span><textarea name='description' defaultValue={editing?.description??''} /></label><input type="hidden" name="area_id" value={editing?.area_id??''}/><label className="pm-field"><span>Responsable</span><select name='assigned_to' defaultValue={editing?.assigned_participant_id?`person:${editing.assigned_participant_id}`:editing?.assigned_to?`user:${editing.assigned_to}`:''}><option value=''>Sin responsable</option><optgroup label='Participantes del club'>{participants.map((person:any)=><option key={person.id} value={`person:${person.id}`}>{person.full_name}</option>)}</optgroup><optgroup label='Usuarios de la aplicación'>{assignees.map((person:any)=><option key={person.id} value={`user:${person.id}`}>{person.full_name || person.email || 'Usuario'}</option>)}</optgroup></select><button type='button' className='secondary-btn' onClick={()=>setAddingPerson(v=>!v)}>+ Agregar persona</button>{addingPerson?<div className='inline-add'><input aria-label='Nombre del participante' placeholder='Nombre completo' value={personName} onChange={e=>setPersonName(e.target.value)}/><button type='button' className='secondary-btn' onClick={async()=>{const name=personName.trim();if(!name)return;const result = await supabase.from('participants').insert({camporee_id:camporeeId,full_name:name,participant_type:'member',attendance_status:'confirmed'}).select('id,full_name').single(); const { data, status } = result; const error = mutationProblem(result);if(error||!data){reportMutationError(error,'No se pudo agregar.');return;}setParticipants(p=>[...p,data].sort((a,b)=>a.full_name.localeCompare(b.full_name)));setPersonName('');setAddingPerson(false);reportMutationSuccess(mutationNotice(status, 'Participante agregado. Selecciónalo como responsable.'));}}>Agregar</button></div>:null}</label><div className={editing ? 'form-two' : undefined}>{editing ? <label className="pm-field"><span>Prioridad</span><select name='priority' defaultValue={editing?.priority??'normal'}><option value='low'>Baja</option><option value='normal'>Media</option><option value='high'>Alta</option><option value='urgent'>Urgente</option></select></label> : null}<label className="pm-field"><span>Etapa</span><select name='phase' defaultValue={editing?.phase??'before'}><option value='before'>Preparación</option><option value='during'>Durante</option><option value='after'>Cierre</option></select></label></div><label className='pm-field'><span>Fecha y hora de realización</span><input name='due_at' type='datetime-local' defaultValue={toLocalInput(editing?.due_at)}/></label></div><div className="pm-sheet-footer"><button type='submit' className='primary-btn' disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button></div></form></BottomSheet>
    <BottomSheet open={Boolean(checklistFor)} onClose={()=>setChecklistFor(null)} title={<>{checklistFor?.title || ""}</>} busy={saving}>{checklistFor?.description?.trim()?<p className='polymet-task-desc'>{checklistFor.description}</p>:null}<div className='panel-list'>{(checklistFor?.task_checklist_items||[]).map((item:any)=><article className={'panel-row '+(item.is_done?'is-done':'')} key={item.id}><button type='button' className='status-btn' onClick={()=>toggleChecklist(checklistFor.id,item)}>{item.is_done?<Check size={17}/>:<Circle size={17}/>}</button><div className='panel-row-copy'><strong>{item.label}</strong></div>{canEdit?<button type='button' className='row-icon-btn danger' onClick={()=>removeChecklist(checklistFor.id,item.id)}><Trash2 size={15}/></button>:null}</article>)}</div></BottomSheet>
    <section className='panel-list polymet-task-list'>{visible.length?visible.map((task)=>{const done=(task.task_checklist_items||[]).filter((it:any)=>it.is_done).length;const total=(task.task_checklist_items||[]).length;const responsible=task.assigned_participant_id?participants.find((p:any)=>p.id===task.assigned_participant_id)?.full_name:task.assigned_to?assigneeMap.get(task.assigned_to):null;return <TaskSwipeRow key={task.id} title={task.title} opened={swipedTaskId===task.id} onOpenChange={opened=>setSwipedTaskId(current=>opened?task.id:current===task.id?null:current)} onEdit={canEdit?()=>openTask(task):undefined} onDetails={()=>setChecklistFor(task)} onDelete={canEdit?()=>{void removeTask(task.id);}:undefined}><article className={'panel-row ios-card polymet-task-row '+(task.status==='done'?'is-done':'')}><button type='button' className='status-btn' onClick={()=>toggleTask(task)} disabled={!canEdit} aria-label={task.status==='done'?'Marcar pendiente':'Completar tarea'}>{task.status==='done'?<Check size={18}/>:null}</button><div className='panel-row-copy' role='button' tabIndex={0} onClick={()=>setChecklistFor(task)} onKeyDown={(event)=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();setChecklistFor(task)}}}><strong>{task.title}</strong>{task.description?.trim()?<p className='polymet-task-desc'>{task.description}</p>:null}<div className='polymet-task-tags'><span className={`polymet-task-priority ${task.priority}`}>{task.priority==='urgent'?'Urgente':task.priority==='high'?'Alta':task.priority==='low'?'Baja':'Media'}</span><span>{task.phase==='during'?'En curso':task.phase==='after'?'Después':'Preparación'}</span>{total?<span className='polymet-task-checks'><ListChecks size={12}/>{done}/{total}</span>:null}</div><div className='polymet-task-meta'>{responsible?<small><UserRound size={12}/>{responsible}</small>:null}{task.due_at?<small>{new Date(task.due_at).toLocaleDateString('es-DO',{day:'numeric',month:'short',timeZone})}</small>:null}</div></div></article></TaskSwipeRow>}) : <div className='empty compact'>No hay tareas en este filtro.</div>}</section>
  </>;
}
