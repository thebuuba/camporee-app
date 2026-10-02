'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ExternalLink, FileText, Plus, Search, Trash2, Upload, X, Map, ShieldCheck, ReceiptText, ScrollText } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { confirmRemoval, reportMutationError, reportMutationSuccess } from '@/lib/client-ui';

export default function DocumentManager({ camporeeId, userId, canEdit, initialDocuments }: { camporeeId: string; userId: string; canEdit: boolean; initialDocuments: any[] }) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('Todos');
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => { setDocuments(initialDocuments); }, [initialDocuments]);

  async function addDocument(formData: FormData) {
    if (!canEdit || saving) return;
    const title = String(formData.get('title') || '').trim();
    if (!title){setErrorMessage('Escribe el nombre del documento.');return;}
    setSaving(true); setErrorMessage('');
    let filePath: string | null = null;
    try{
      const file = formData.get('file');
      if (file instanceof File && file.size > 0) {
        if (file.size > 15 * 1024 * 1024) { setErrorMessage('El archivo supera el límite de 15 MB.'); return; }
        const safeName = file.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '-');
        filePath = `${camporeeId}/documents/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from('camporee-files').upload(filePath, file, { upsert: false, contentType: file.type || undefined });
        if (uploadError) { const message=reportMutationError(uploadError,'No se pudo subir el archivo.'); setErrorMessage(message); return; }
      }

      const payload = { camporee_id: camporeeId, title, document_type: String(formData.get('document_type') || '').trim() || null, file_path: filePath, external_url: String(formData.get('external_url') || '').trim() || null, notes: String(formData.get('notes') || '').trim() || null, created_by: userId };
      const { data, error } = await supabase.from('camporee_documents').insert(payload).select('*').single();
      if (error || !data) {
        if (filePath) await supabase.storage.from('camporee-files').remove([filePath]);
        const message=reportMutationError(error,'No se pudo guardar el documento.');setErrorMessage(message);return;
      }
      setDocuments((current) => [data, ...current]); setOpen(false); reportMutationSuccess('Documento guardado.'); router.refresh();
    }catch(error){if(filePath)await supabase.storage.from('camporee-files').remove([filePath]).catch(()=>undefined);const message=reportMutationError(error,'No se pudo guardar el documento.');setErrorMessage(message)}finally{setSaving(false)}
  }

  async function openStoredFile(filePath: string) {
    const { data, error } = await supabase.storage.from('camporee-files').createSignedUrl(filePath, 60 * 10);
    if (!error && data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    else {const message=reportMutationError(error,'No se pudo abrir el archivo.');setErrorMessage(message);}
  }

  async function removeDocument(document: any) {
    if (!canEdit || !confirmRemoval('este documento')) return;
    const previous = documents;
    setDocuments((current) => current.filter((item) => item.id !== document.id));
    const { error } = await supabase.from('camporee_documents').delete().eq('id', document.id);
    if (error) { setDocuments(previous); const message=reportMutationError(error,'No se pudo eliminar el documento.');setErrorMessage(message); return; }
    if (document.file_path) await supabase.storage.from('camporee-files').remove([document.file_path]);
    reportMutationSuccess('Documento eliminado.');router.refresh();
  }

  const types = ['Todos', 'Permisos', 'Reglamentos', 'Mapas', 'Recibos', 'Otros'];
  const getType = (value: string | null) => {
    const type = (value || '').toLowerCase();
    if (type.includes('permiso')) return 'Permisos';
    if (type.includes('reglamento')) return 'Reglamentos';
    if (type.includes('mapa')) return 'Mapas';
    if (type.includes('recibo')) return 'Recibos';
    return 'Otros';
  };
  const visible = useMemo(() => documents.filter((document) => (filter === 'Todos' || getType(document.document_type) === filter) && `${document.title} ${document.notes || ''}`.toLowerCase().includes(query.toLowerCase())), [documents, filter, query]);

  return <>
    <label className='polymet-search'><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder='Buscar documento' aria-label='Buscar documento'/>{query ? <button type='button' onClick={() => setQuery('')} aria-label='Limpiar búsqueda'><X size={18}/></button> : <span><Search size={20}/></span>}</label>
    <div className='polymet-filter-scroll'>{types.map((type) => <button type='button' key={type} className={filter === type ? 'active' : ''} onClick={() => setFilter(type)}>{type}</button>)}</div>
    {errorMessage ? <div className='auth-alert error' role='alert'>{errorMessage}</div> : null}
    {canEdit ? <button type='button' className='panel-add' onClick={() => { setErrorMessage(''); setOpen(true); }}><Plus size={18}/> Documento</button> : null}
    {open ? <div className='sheet-backdrop' onClick={() => {if(!saving)setOpen(false)}}><section className='sheet-card' role='dialog' aria-modal='true' onClick={(e) => e.stopPropagation()}><div className='sheet-handle'/><h2>Agregar documento</h2><form onSubmit={(event)=>{event.preventDefault();void addDocument(new FormData(event.currentTarget));}} className='panel-form'><input name='title' placeholder='Nombre del documento' required/><select name='document_type' defaultValue=''><option value=''>Tipo de documento</option><option value='reglamento'>Reglamento</option><option value='permiso'>Permiso</option><option value='lista'>Listado</option><option value='mapa'>Mapa</option><option value='recibo'>Recibo</option><option value='otro'>Otro</option></select><label className='file-input'><span><Upload size={16}/> Subir archivo</span><input name='file' type='file'/><small className='file-note'>PDF, imagen, Word u otro archivo. Máximo 15 MB.</small></label><input name='external_url' type='url' placeholder='O agrega un enlace externo'/><textarea name='notes' placeholder='Notas o descripción'/><button type='submit' className='primary-btn' disabled={saving}>{saving ? 'Guardando…' : 'Guardar documento'}</button></form></section></div> : null}
    <section className='panel-list polymet-document-list'>{visible.length ? visible.map((document) => {
      const type = getType(document.document_type);
      const Icon = type === 'Permisos' ? ShieldCheck : type === 'Reglamentos' ? ScrollText : type === 'Mapas' ? Map : type === 'Recibos' ? ReceiptText : FileText;
      return <article className='panel-row ios-card polymet-document-row' key={document.id}><span className={`polymet-document-icon ${type.toLowerCase()}`}><Icon size={20}/></span><div className='panel-row-copy'><strong>{document.title}</strong><small>{document.external_url && !document.file_path ? 'Enlace' : document.document_type || 'Archivo'} · {new Date(document.created_at).toLocaleDateString('es-DO',{day:'numeric',month:'short'})}</small></div>{document.file_path ? <button type='button' className='polymet-open-file' onClick={() => openStoredFile(document.file_path)} aria-label={`Abrir ${document.title}`}><ExternalLink size={17}/></button> : document.external_url ? <a className='polymet-open-file' href={document.external_url} target='_blank' rel='noreferrer' aria-label={`Abrir ${document.title}`}><ExternalLink size={17}/></a> : null}{canEdit ? <button type='button' className='row-icon-btn danger' onClick={() => removeDocument(document)} aria-label={`Eliminar ${document.title}`}><Trash2 size={17}/></button> : null}</article>;
    }) : <div className='empty compact'>No hay documentos que coincidan con este filtro.</div>}</section>
  </>;
}
