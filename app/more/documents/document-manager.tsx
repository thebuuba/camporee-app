'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, FileText, Plus, Trash2, Upload } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { confirmRemoval } from '@/lib/client-ui';

export default function DocumentManager({ camporeeId, userId, canEdit, initialDocuments }: { camporeeId: string; userId: string; canEdit: boolean; initialDocuments: any[] }) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => { setDocuments(initialDocuments); }, [initialDocuments]);

  async function addDocument(formData: FormData) {
    if (!canEdit || saving) return;
    const title = String(formData.get('title') || '').trim();
    if (!title) return;
    setSaving(true); setErrorMessage('');
    const file = formData.get('file');
    let filePath: string | null = null;

    if (file instanceof File && file.size > 0) {
      if (file.size > 15 * 1024 * 1024) { setSaving(false); setErrorMessage('El archivo supera el límite de 15 MB.'); return; }
      const safeName = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '-');
      filePath = `${camporeeId}/documents/${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from('camporee-files').upload(filePath, file, { upsert: false, contentType: file.type || undefined });
      if (uploadError) { setSaving(false); setErrorMessage('No se pudo subir el archivo.'); return; }
    }

    const payload = { camporee_id: camporeeId, title, document_type: String(formData.get('document_type') || '').trim() || null, file_path: filePath, external_url: String(formData.get('external_url') || '').trim() || null, notes: String(formData.get('notes') || '').trim() || null, created_by: userId };
    const { data, error } = await supabase.from('camporee_documents').insert(payload).select('*').single();
    if (error && filePath) await supabase.storage.from('camporee-files').remove([filePath]);
    setSaving(false);
    if (!error && data) { setDocuments((current) => [data, ...current]); setOpen(false); router.refresh(); }
    else if (error) setErrorMessage('No se pudo guardar el documento.');
  }

  async function openStoredFile(filePath: string) {
    const { data, error } = await supabase.storage.from('camporee-files').createSignedUrl(filePath, 60 * 10);
    if (!error && data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    else setErrorMessage('No se pudo abrir el archivo.');
  }

  async function removeDocument(document: any) {
    if (!canEdit || !confirmRemoval('este documento')) return;
    const previous = documents;
    setDocuments((current) => current.filter((item) => item.id !== document.id));
    const { error } = await supabase.from('camporee_documents').delete().eq('id', document.id);
    if (error) { setDocuments(previous); setErrorMessage('No se pudo eliminar el documento.'); return; }
    if (document.file_path) await supabase.storage.from('camporee-files').remove([document.file_path]);
    router.refresh();
  }

  return <>
    {errorMessage ? <div className='auth-alert error'>{errorMessage}</div> : null}
    {canEdit ? <button className='panel-add' onClick={() => { setErrorMessage(''); setOpen(true); }}><Plus size={18}/> Nuevo documento</button> : null}
    {open ? <div className='sheet-backdrop' onClick={() => setOpen(false)}><section className='sheet-card' role='dialog' aria-modal='true' onClick={(e) => e.stopPropagation()}><div className='sheet-handle'/><h2>Agregar documento</h2><form action={addDocument} className='panel-form'><input name='title' placeholder='Nombre del documento' required/><select name='document_type' defaultValue=''><option value=''>Tipo de documento</option><option value='reglamento'>Reglamento</option><option value='permiso'>Permiso</option><option value='lista'>Listado</option><option value='mapa'>Mapa</option><option value='recibo'>Recibo</option><option value='otro'>Otro</option></select><label className='file-input'><span><Upload size={16}/> Subir archivo</span><input name='file' type='file'/><small className='file-note'>PDF, imagen, Word u otro archivo. Máximo 15 MB.</small></label><input name='external_url' type='url' placeholder='O agrega un enlace externo'/><textarea name='notes' placeholder='Notas o descripción'/><button className='primary-btn' disabled={saving}>{saving ? 'Guardando…' : 'Guardar documento'}</button></form></section></div> : null}
    <section className='panel-list'>{documents.length ? documents.map((document) => <article className='panel-row ios-card' key={document.id}><span className='stat-icon stat-blue'><FileText size={18}/></span><div className='panel-row-copy'><strong>{document.title}</strong><small>{document.document_type || 'Documento'}{document.notes ? ` · ${document.notes}` : ''}</small></div>{document.file_path ? <button className='row-icon-btn' onClick={() => openStoredFile(document.file_path)} aria-label='Abrir archivo'><FileText size={17}/></button> : null}{document.external_url ? <a className='row-icon-btn' href={document.external_url} target='_blank' rel='noreferrer' aria-label='Abrir enlace'><ExternalLink size={17}/></a> : null}{canEdit ? <button className='row-icon-btn danger' onClick={() => removeDocument(document)} aria-label='Eliminar'><Trash2 size={17}/></button> : null}</article>) : <div className='empty compact'>Todavía no hay documentos registrados para este camporee.</div>}</section>
  </>;
}
