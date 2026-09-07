'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

const DEFAULT_AREAS = [
  ['Alimentación','utensils'],['Campamento','tent'],['Transporte','bus'],['Equipaje','backpack'],
  ['Finanzas','wallet'],['Salud','heart-pulse'],['Espiritual','book-open'],['Actividades','target'],
  ['Administración','clipboard-list'],['Compras','shopping-cart']
] as const;

export default function SetupForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const location = String(form.get('location') ?? '').trim();
    const startsOn = String(form.get('startsOn') ?? '');
    const endsOn = String(form.get('endsOn') ?? '');
    if (!name || !startsOn || !endsOn) { setError('Completa el nombre y las fechas del camporee.'); return; }
    if (endsOn < startsOn) { setError('La fecha final no puede ser anterior a la fecha de inicio.'); return; }
    setLoading(true); setError('');
    try {
      const supabase = createClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');
      const userId = userData.user.id;
      const { data: member, error: memberError } = await supabase.from('app_members').select('role,is_active').eq('user_id', userId).maybeSingle();
      if (memberError) throw memberError;
      if (!member?.is_active || member.role !== 'admin') throw new Error('Solo un administrador puede crear el camporee.');
      const { data: camporee, error: camporeeError } = await supabase.from('camporees').insert({ owner_id:userId, name, location:location||null, starts_on:startsOn, ends_on:endsOn }).select('id').single();
      if (camporeeError || !camporee) throw camporeeError ?? new Error('No se pudo crear el camporee.');
      const { error: memberInsertError } = await supabase.from('camporee_members').insert({ camporee_id:camporee.id, user_id:userId, role:'admin' });
      if (memberInsertError) console.warn('camporee_members:', memberInsertError.message);
      const { error: areasError } = await supabase.from('areas').insert(DEFAULT_AREAS.map(([areaName,icon],index)=>({camporee_id:camporee.id,name:areaName,icon,sort_order:index})));
      if (areasError) console.warn('areas:', areasError.message);
      router.replace('/'); router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ocurrió un error al crear el camporee.'); setLoading(false);
    }
  }

  return <form onSubmit={onSubmit} className="setup-form">
    {error ? <div className="auth-alert error">{error}</div> : null}
    <label>Nombre del camporee<div className="field-card"><span><Sparkles size={17}/></span><input name="name" placeholder="Ej. Firmes y Adelante 2026" required disabled={loading} /></div></label>
    <label>Lugar<div className="field-card"><span><MapPin size={17}/></span><input name="location" placeholder="Lugar del evento" disabled={loading} /></div></label>
    <div className="date-row"><label>Inicio<input name="startsOn" type="date" required disabled={loading} /></label><label>Final<input name="endsOn" type="date" required disabled={loading} /></label></div>
    <button className="primary-btn setup-primary" disabled={loading}>{loading ? 'Creando…' : 'Crear camporee y continuar'}</button>
  </form>;
}
