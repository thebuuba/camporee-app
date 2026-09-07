'use client';

import { useState } from 'react';
import { Check, Circle, Plus, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function TaskManager({ camporeeId, userId, canEdit, initialTasks, areas }: { camporeeId: string; userId: string; canEdit: boolean; initialTasks: any[]; areas: any[] }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  async function addTask(formData: FormData) {
    if (!canEdit || saving) return;
    const title = String(formData.get('title') || '').trim();
    if (!title) return;
    setSaving(true);
    const payload = {
      camporee_id: camporeeId,
      created_by: userId,
      title,
      description: String(formData.get('description') || '').trim() || null,
      area_id: String(formData.get('area_id') || '') || null,
      priority: String(formData.get('priority') || 'normal'),
      due_at: String(formData.get('due_at') || '') || null,
      phase: 'before',
      status: 'pending'
    };
    const { data, error } = await supabase.from('tasks').insert(payload).select('id,title,description,status,priority,due_at,area_id').single();
    setSaving(false);
    if (!error && data) { setTasks((current) => [data, ...current]); setOpen(false); }
  }

  async function toggleTask(task: any) {
    if (!canEdit) return;
    const next = task.status === 'done' ? 'pending' : 'done';
    const { error } = await supabase.from('tasks').update({ status: next, updated_at: new Date().toISOString() }).eq('id', task.id);
    if (!error) setTasks((current) => current.map((item) => item.id === task.id ? { ...item, status: next } : item));
  }

  async function removeTask(id: string) {
    if (!canEdit) return;
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (!error) setTasks((current) => current.filter((item) => item.id !== id));
  }

  return <>
    {canEdit ? <button className='panel-add' onClick={() => setOpen(true)}><Plus size={18}/> Nueva tarea</button> : null}
    {open ? <div className='sheet-backdrop' onClick={() => setOpen(false)}><section className='sheet-card' onClick={(e) => e.stopPropagation()}><div className='sheet-handle'/><h2>Nueva tarea</h2><form action={addTask} className='panel-form'><input name='title' placeholder='¿Qué hay que hacer?' required/><textarea name='description' placeholder='Detalles opcionales'/><select name='area_id' defaultValue=''><option value=''>Sin área</option>{areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select><div className='form-two'><select name='priority' defaultValue='normal'><option value='low'>Baja</option><option value='normal'>Normal</option><option value='high'>Alta</option><option value='urgent'>Urgente</option></select><input name='due_at' type='datetime-local'/></div><button className='primary-btn' disabled={saving}>{saving ? 'Guardando…' : 'Crear tarea'}</button></form></section></div> : null}
    <section className='panel-list'>{tasks.length ? tasks.map((task) => <article className={'panel-row ios-card ' + (task.status === 'done' ? 'is-done' : '')} key={task.id}><button className='status-btn' onClick={() => toggleTask(task)} disabled={!canEdit}>{task.status === 'done' ? <Check size={18}/> : <Circle size={18}/>}</button><div className='panel-row-copy'><strong>{task.title}</strong><small>{task.priority === 'urgent' ? 'Urgente' : task.priority === 'high' ? 'Alta' : task.priority === 'low' ? 'Baja' : 'Normal'}{task.due_at ? ' · ' + new Date(task.due_at).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' }) : ''}</small></div>{canEdit ? <button className='row-icon-btn danger' onClick={() => removeTask(task.id)}><Trash2 size={17}/></button> : null}</article>) : <div className='empty compact'>Todavía no hay tareas. Crea la primera para empezar a organizar el camporee.</div>}</section>
  </>;
}
