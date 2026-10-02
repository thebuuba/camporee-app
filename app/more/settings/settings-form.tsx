'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { reportMutationError, reportMutationSuccess } from '@/lib/client-ui';

export default function SettingsForm({ camporee, canEdit }: { camporee: any; canEdit: boolean }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const [status, setStatus] = useState(camporee.status);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => { setVersion((value) => value + 1); setSaved(false); setError(''); setStatus(camporee.status); }, [camporee]);

  async function save(formData: FormData) {
    if (!canEdit || saving) return;
    const name = String(formData.get('name') || '').trim();
    const startsOn = String(formData.get('starts_on') || '');
    const endsOn = String(formData.get('ends_on') || '');
    if (!name || !startsOn || !endsOn){setError('Completa el nombre y las fechas.');return;}
    if (new Date(endsOn) < new Date(startsOn)) { setError('La fecha final no puede ser anterior a la fecha de inicio.'); return; }
    setSaving(true); setSaved(false); setError('');
    try{
      const { error } = await supabase.from('camporees').update({ name, location: String(formData.get('location') || '').trim() || null, starts_on: startsOn, ends_on: endsOn, status: String(formData.get('status') || 'planning') }).eq('id', camporee.id);
      if (error){const message=reportMutationError(error,'No se pudo guardar la configuración.');setError(message);return;}
      setSaved(true);reportMutationSuccess('Configuración guardada.');router.refresh();
    }catch(err){const message=reportMutationError(err,'No se pudo guardar la configuración.');setError(message)}finally{setSaving(false)}
  }

  return <form key={version} onSubmit={(event)=>{event.preventDefault();void save(new FormData(event.currentTarget));}} className='polymet-settings-form'>
    <section className='polymet-settings-card'><h2>Estado del camporee</h2><div className='polymet-phase-options'>{[['planning','Antes','Preparación'],['active','Durante','En curso'],['finished','Después','Cierre']].map(([value,label,subtitle]) => <label key={value} className={status === value ? 'selected' : ''}><input type='radio' name='status' value={value} checked={status === value} onChange={() => setStatus(value)} disabled={!canEdit}/><strong>{label}</strong><small>{subtitle}</small></label>)}</div><p>La pantalla de Inicio se adapta a la etapa seleccionada.</p>{camporee.status === 'archived' ? <label className='polymet-archive'><input type='radio' name='status' value='archived' checked={status === 'archived'} onChange={() => setStatus('archived')} disabled={!canEdit}/> Archivado</label> : null}</section>
    <section className='polymet-settings-card'><h2>Datos del camporee</h2><div className='panel-form'><label>Nombre<input name='name' defaultValue={camporee.name} disabled={!canEdit} required/></label><label>Lugar<input name='location' defaultValue={camporee.location ?? ''} disabled={!canEdit}/></label><div className='form-two'><label>Inicio<input name='starts_on' type='date' defaultValue={camporee.starts_on} disabled={!canEdit} required/></label><label>Fin<input name='ends_on' type='date' defaultValue={camporee.ends_on} disabled={!canEdit} required/></label></div></div>{error ? <div className='auth-alert error' role='alert'>{error}</div> : null}{saved ? <div className='auth-alert success'><CheckCircle2 size={16}/> Cambios guardados.</div> : null}{canEdit ? <button type='submit' className='primary-btn' disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button> : <div className='auth-alert success'>Tienes acceso de solo lectura a esta configuración.</div>}</section>
  </form>;
}
