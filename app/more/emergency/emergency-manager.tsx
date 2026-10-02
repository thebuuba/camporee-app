'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Phone, Plus, Trash2, Pencil, Siren } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { confirmRemoval, reportMutationError, reportMutationSuccess } from '@/lib/client-ui';

export default function EmergencyManager({ camporeeId, canEdit, initialContacts }: { camporeeId: string; canEdit: boolean; initialContacts: any[] }) {
  const [contacts, setContacts] = useState(initialContacts);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
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
      const { data, error } = await (editing ? supabase.from('emergency_contacts').update(payload).eq('id',editing.id) : supabase.from('emergency_contacts').insert(payload)).select('*').single();
      if(error||!data){const message=reportMutationError(error,'No se pudo guardar el contacto.');setFormError(message);return;}
      setContacts((current) => (editing ? current.map((item) => item.id === data.id ? data : item) : [...current, data]).sort((a,b) => (a.priority ?? 0) - (b.priority ?? 0))); setOpen(false); setEditing(null); reportMutationSuccess('Contacto guardado.'); router.refresh();
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
    <section className='polymet-911'><Siren size={28}/><h2>Emergencias 911</h2><p>Sistema nacional</p><a href='tel:911'><Phone size={16}/> Llamar 911</a></section>
    {canEdit ? <button type='button' className='panel-add' onClick={() => {setEditing(null);setFormError('');setOpen(true)}}><Plus size={18}/> Contacto</button> : null}
    {open ? <div className='sheet-backdrop' onClick={() => {if(!saving){setOpen(false);setEditing(null)}}}><section className='sheet-card' role='dialog' aria-modal='true' onClick={(e) => e.stopPropagation()}><div className='sheet-handle'/><h2>{editing ? 'Editar contacto' : 'Contacto de emergencia'}</h2><form key={editing?.id || 'new'} onSubmit={(event)=>{event.preventDefault();void addContact(new FormData(event.currentTarget));}} className='panel-form'>{formError?<div className='auth-alert error' role='alert'>{formError}</div>:null}<input name='name' placeholder='Nombre o institución' defaultValue={editing?.name || ''} required/><input name='role' placeholder='Rol: Primeros auxilios, hospital, director…' defaultValue={editing?.role || ''}/><input name='phone' type='tel' placeholder='Teléfono' defaultValue={editing?.phone || ''}/><textarea name='notes' placeholder='Indicaciones o información importante' defaultValue={editing?.notes || ''}/><select name='priority' defaultValue={String(editing?.priority ?? 0)}><option value='0'>Prioridad principal</option><option value='1'>Prioridad secundaria</option><option value='2'>Referencia adicional</option></select><button type='submit' className='primary-btn' disabled={saving}>{saving ? 'Guardando…' : 'Guardar contacto'}</button></form></section></div> : null}
    {contacts.length ? <><div className='polymet-contact-heading'>Prioridad alta</div><section className='polymet-contact-list'>{contacts.filter((contact) => (contact.priority ?? 0) === 0).map((contact) => <ContactRow key={contact.id} contact={contact} canEdit={canEdit} onEdit={() => {setEditing(contact);setFormError('');setOpen(true)}} onRemove={() => removeContact(contact.id)}/>)}</section><div className='polymet-contact-heading other'>Otros contactos</div><section className='polymet-contact-list'>{contacts.filter((contact) => (contact.priority ?? 0) !== 0).map((contact) => <ContactRow key={contact.id} contact={contact} canEdit={canEdit} onEdit={() => {setEditing(contact);setFormError('');setOpen(true)}} onRemove={() => removeContact(contact.id)}/>)}</section></> : <div className='empty compact'>Agrega los contactos clave para cualquier emergencia durante el camporee.</div>}
  </>;
}

function ContactRow({contact,canEdit,onEdit,onRemove}:{contact:any;canEdit:boolean;onEdit:()=>void;onRemove:()=>void}) {
  return <article className='polymet-contact-row'><div><strong>{contact.name}</strong><small>{contact.role || 'Contacto de emergencia'}{contact.phone ? ` · ${contact.phone}` : ''}</small>{contact.notes ? <small>{contact.notes}</small> : null}</div>{canEdit ? <button type='button' onClick={onEdit} aria-label={`Editar ${contact.name}`}><Pencil size={16}/></button> : null}{contact.phone ? <a href={`tel:${contact.phone.replace(/[^+\d]/g,'')}`} aria-label={`Llamar a ${contact.name}`}><Phone size={20}/></a> : null}{canEdit ? <button type='button' className='contact-delete' onClick={onRemove} aria-label={`Eliminar ${contact.name}`}><Trash2 size={15}/></button> : null}</article>;
}
