'use client';

import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function SettingsForm({ camporee, canEdit }: { camporee: any; canEdit: boolean }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const supabase = createClient();

  async function save(formData: FormData) {
    if (!canEdit || saving) return;
    const name = String(formData.get('name') || '').trim();
    const startsOn = String(formData.get('starts_on') || '');
    const endsOn = String(formData.get('ends_on') || '');
    if (!name || !startsOn || !endsOn) return;
    setSaving(true); setSaved(false); setError('');
    const { error } = await supabase.from('camporees').update({
      name,
      location: String(formData.get('location') || '').trim() || null,
      starts_on: startsOn,
      ends_on: endsOn,
      status: String(formData.get('status') || 'planning'),
    }).eq('id', camporee.id);
    setSaving(false);
    if (error) setError(error.message); else setSaved(true);
  }

  return <section className='section-card ios-card'>
    <form action={save} className='panel-form'>
      <label>Nombre<input name='name' defaultValue={camporee.name} disabled={!canEdit} required/></label>
      <label>Lugar<input name='location' defaultValue={camporee.location ?? ''} disabled={!canEdit}/></label>
      <div className='form-two'><label>Inicio<input name='starts_on' type='date' defaultValue={camporee.starts_on} disabled={!canEdit} required/></label><label>Final<input name='ends_on' type='date' defaultValue={camporee.ends_on} disabled={!canEdit} required/></label></div>
      <label>Estado<select name='status' defaultValue={camporee.status} disabled={!canEdit}><option value='planning'>Preparación</option><option value='active'>En curso</option><option value='completed'>Finalizado</option><option value='archived'>Archivado</option></select></label>
      {error ? <div className='auth-alert error'>{error}</div> : null}
      {saved ? <div className='auth-alert success'><CheckCircle2 size={16}/> Cambios guardados.</div> : null}
      {canEdit ? <button className='primary-btn' disabled={saving}>{saving ? 'Guardando…' : 'Guardar cambios'}</button> : <div className='auth-alert success'>Tienes acceso de solo lectura a esta configuración.</div>}
    </form>
  </section>;
}
