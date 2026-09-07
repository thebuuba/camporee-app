'use client';

import { useState } from 'react';
import { ExternalLink, FileText, Plus, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function DocumentManager({ camporeeId, userId, canEdit, initialDocuments }: { camporeeId: string; userId: string; canEdit: boolean; initialDocuments: any[] }) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const supabase = createClient();

  async function addDocument(formData: FormData) {
    if (!canEdit || saving) return;
    const title = String(formData.get('title') || '').trim();
    if (!title) return;
    setSaving(true);
    const payload = {
      camporee_id: camporeeId,
      title,
      document_type: String(formData.get('document_type') || '').trim() || null,
      external_url: String(formData.get('external_url') || '').trim() || null,
      notes: String(formData.get('notes') || '').trim() || null,
      created_by: userId,
    };
    const { data, error } = await supabase.from('camporee_documents').insert(payload).select('*').single();
    setSaving(false);
    if (!error && data) { setDocuments((current) => [data, ...current]); setOpen(false); }
  }

  async function removeDocument(id: string) {
    if (!canEdit) return;
    const { error } = await supabase.from('camporee_documents').delete().eq('id', id);
    if (!error) setDocuments((current) => current.filter((item) => item.id !== id));
  }

  return <>
    {canEdit ? <button className='panel-add' onClick={() => setOpen(true)}><Plus size={18}/> Nuevo documento</button> : null}
    {open ? <div className='sheet-backdrop' onClick={() => setOpen(false)}><section className='sheet-card' onClick={(e) => e.stopPropagation()}><div className='sheet-handle'/><h2>Registrar documento</h2><form action={addDocument} className='panel-form'><input name='title' placeholder='Nombre del documento' required/><select name='document_type' defaultValue=''><option value=''>Tipo de documento</option><option value='reglamento'>Reglamento</option><option value='permiso'>Permiso</option><option value='lista'>Listado</option><option value='mapa'>Mapa</option><option value='recibo'>Recibo</option><option value='otro'>Otro</option></select><input name='external_url' type='url' placeholder='Enlace opcional'/><textarea name='notes' placeholder='Notas o descripción'/><button className='primary-btn' disabled={saving}>{saving ? 'Guardando…' : 'Guardar documento'}</button></form></section></div> : null}
    <section className='panel-list'>{documents.length ? documents.map((document) => <article className='panel-row ios-card' key={document.id}><span className='stat-icon stat-blue'><FileText size={18}/></span><div className='panel-row-copy'><strong>{document.title}</strong><small>{document.document_type || 'Documento'}{document.notes ? ` · ${document.notes}` : ''}</small></div>{document.external_url ? <a className='row-icon-btn' href={document.external_url} target='_blank' rel='noreferrer' aria-label='Abrir documento'><ExternalLink size={17}/></a> : null}{canEdit ? <button className='row-icon-btn danger' onClick={() => removeDocument(document.id)} aria-label='Eliminar'><Trash2 size={17}/></button> : null}</article>) : <div className='empty compact'>Todavía no hay documentos registrados para este camporee.</div>}</section>
  </>;
}
