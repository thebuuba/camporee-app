'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Phone, Plus, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { confirmRemoval, reportMutationError, reportMutationSuccess } from '@/lib/client-ui';

export default function EmergencyManager({ camporeeId, canEdit, initialContacts }: { camporeeId: string; canEdit: boolean; initialContacts: any[] }) {
  const [contacts, setContacts] = useState(initialContacts);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError,setFormError] = useState('');
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => { setContacts(initialContacts); }, [initialContacts]);

  async function addContact(formData: FormData) {
    if (!canEdit || saving) return;
    const name = String(formData.get('name') || '').trim();
    if (!name){setFormError('Escribe el nombre o la institución.');return;}
    setSaving(true);setFormError('');
    try{
      const payload = { camporee_id: camporeeId, name, role: String(formData.get('role') || '').trim() || null, phone: String(formData.get('phone') || '').trim() || null, notes: String(formData.get('notes') || '').trim() || null, priority: Number(formData.get('priority') || 0) };
      const { data, error } = await supabase.from('emergency_contacts').insert(payload).select('*').single();
      if(error||!data){const message=reportMutationError(error,'No se pudo guardar el contacto.');setFormError(message);return;}
      setContacts((current) => [...current, data].sort((a,b) => (a.priority ?? 0) - (b.priority ?? 0))); setOpen(false); reportMutationSuccess('Contacto guardado.'); router.refresh();
    }catch(error){const message=reportMutationError(error,'No se pudo guardar el contacto.');setFormError(message)}finally{setSaving(false)}
  }

  async function removeContact(id: string) {
    if (!canEdit || !confirmRemoval('este contacto')) return;
    const previous = contacts;
    setContacts((current) => current.filter((item) => item.id !== id));
    const { error } = await supabase.from('emergency_contacts').delete().eq('id', id);
    if (error){setContacts(previous);reportMutationError(error,'No se pudo eliminar el contacto.');}else{reportMutationSuccess('Contacto eliminado.');router.refresh();}
  }

  return <>
    {canEdit ? <button type='button' className='panel-add' onClick={() => {setFormError('');setOpen(true)}}><Plus size={18}/> Nuevo contacto</button> : null}
    {open ? <div className='sheet-backdrop' onClick={() => {if(!saving)setOpen(false)}}><section className='sheet-card' role='dialog' aria-modal='true' onClick={(e) => e.stopPropagation()}><div className='sheet-handle'/><h2>Contacto de emergencia</h2><form onSubmit={(event)=>{event.preventDefault();void addContact(new FormData(event.currentTarget));}} className='panel-form'>{formError?<div className='auth-alert error' role='alert'>{formError}</div>:null}<input name='name' placeholder='Nombre o institución' required/><input name='role' placeholder='Rol: Primeros auxilios, hospital, director…'/><input name='phone' type='tel' placeholder='Teléfono'/><textarea name='notes' placeholder='Indicaciones o información importante'/><select name='priority' defaultValue='0'><option value='0'>Prioridad principal</option><option value='1'>Prioridad secundaria</option><option value='2'>Referencia adicional</option></select><button type='submit' className='primary-btn' disabled={saving}>{saving ? 'Guardando…' : 'Guardar contacto'}</button></form></section></div> : null}
    <section className='panel-list'>{contacts.length ? contacts.map((contact) => <article className='panel-row ios-card' key={contact.id}><span className='stat-icon stat-red'><Phone size={18}/></span><div className='panel-row-copy'><strong>{contact.name}</strong><small>{contact.role || 'Contacto de emergencia'}{contact.phone ? ` · ${contact.phone}` : ''}</small>{contact.notes ? <small>{contact.notes}</small> : null}</div>{contact.phone ? <a className='row-icon-btn' href={`tel:${contact.phone.replace(/[^+\d]/g,'')}`} aria-label={`Llamar a ${contact.name}`}><Phone size={16}/></a> : null}{canEdit ? <button type='button' className='row-icon-btn danger' onClick={() => removeContact(contact.id)} aria-label='Eliminar'><Trash2 size={17}/></button> : null}</article>) : <div className='empty compact'>Agrega los contactos clave para cualquier emergencia durante el camporee.</div>}</section>
  </>;
}
