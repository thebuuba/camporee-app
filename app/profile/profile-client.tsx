'use client';

import { ChangeEvent, useRef, useState } from 'react';
import { Camera, ImagePlus, Trash2, UserRound, Moon, WifiOff, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { reportMutationError, reportMutationSuccess } from '@/lib/client-ui';

type Props = {
  userId: string;
  fullName: string;
  email: string;
  role: string;
  initialAvatarUrl: string | null;
};

const MAX_SIZE = 5 * 1024 * 1024;
const allowedTypes = new Set(['image/jpeg','image/png','image/webp','image/heic','image/heif']);

export default function ProfileClient({ userId, fullName, email, role, initialAvatarUrl }: Props) {
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [name, setName] = useState(fullName);
  const [savingName, setSavingName] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();
  const router = useRouter();
  const initial = (fullName.trim()[0] || 'U').toUpperCase();

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || busy) return;
    if (!allowedTypes.has(file.type)) { setError('Usa una foto JPG, PNG, WEBP o HEIC.'); return; }
    if (file.size > MAX_SIZE) { setError('La foto debe pesar menos de 5 MB.'); return; }

    setBusy(true); setError('');
    try {
      const path = `${userId}/avatar`;
      const { error: uploadError } = await supabase.storage.from('profile-avatars').upload(path, file, {
        upsert: true,
        cacheControl: '3600',
        contentType: file.type,
      });
      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage.from('profile-avatars').getPublicUrl(path);
      const nextUrl = `${publicData.publicUrl}?v=${Date.now()}`;
      const { error: profileError } = await supabase.from('profiles').update({ avatar_url: nextUrl, updated_at: new Date().toISOString() }).eq('id', userId);
      if (profileError) throw profileError;

      setAvatarUrl(nextUrl);
      reportMutationSuccess('Foto de perfil actualizada.');
      router.refresh();
    } catch (uploadError) {
      setError(reportMutationError(uploadError, 'No se pudo guardar la foto de perfil.'));
    } finally {
      setBusy(false);
    }
  }

  async function removeAvatar() {
    if (!avatarUrl || busy) return;
    setBusy(true); setError('');
    try {
      const path = `${userId}/avatar`;
      const { error: storageError } = await supabase.storage.from('profile-avatars').remove([path]);
      if (storageError) throw storageError;
      const { error: profileError } = await supabase.from('profiles').update({ avatar_url: null, updated_at: new Date().toISOString() }).eq('id', userId);
      if (profileError) throw profileError;
      setAvatarUrl(null);
      reportMutationSuccess('Foto de perfil eliminada.');
      router.refresh();
    } catch (removeError) {
      setError(reportMutationError(removeError, 'No se pudo quitar la foto de perfil.'));
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = name.trim();
    if (!nextName || savingName) return;
    setSavingName(true); setError('');
    const { error: updateError } = await supabase.from('profiles').update({ full_name: nextName, updated_at: new Date().toISOString() }).eq('id', userId);
    if (updateError) setError(reportMutationError(updateError, 'No se pudo guardar el perfil.'));
    else { reportMutationSuccess('Perfil guardado.'); router.refresh(); }
    setSavingName(false);
  }

  return <section className='polymet-profile'>
    <div className='polymet-profile-hero'>
      <div className='profile-avatar-wrap'><button type='button' className='profile-avatar-button' onClick={() => inputRef.current?.click()} disabled={busy} aria-label='Cambiar foto de perfil'>{avatarUrl ? <img src={avatarUrl} alt={`Foto de ${fullName}`}/> : <span className='profile-avatar-fallback'>{initial || <UserRound size={36}/>}</span>}<span className='profile-avatar-camera'><Camera size={17}/></span></button><input ref={inputRef} className='profile-file-input' type='file' accept='image/jpeg,image/png,image/webp,image/heic,image/heif' onChange={uploadAvatar}/></div>
      <h2>{name || fullName}</h2><span>{role === 'admin' ? 'Administrador' : role === 'editor' ? 'Editor' : 'Solo lectura'}</span>
    </div>
    <form className='polymet-profile-form' onSubmit={saveProfile}><label>Nombre<input value={name} onChange={(event) => setName(event.target.value)} required/></label><label>Correo<input value={email} readOnly/></label>{error ? <div className='auth-alert error' role='alert'>{error}</div> : null}<button type='submit' className='primary-btn' disabled={savingName}>{savingName ? 'Guardando…' : 'Guardar perfil'}</button></form>
    <div className='profile-actions'>{avatarUrl ? <button type='button' className='profile-remove-btn' onClick={removeAvatar} disabled={busy}><Trash2 size={17}/> Quitar foto</button> : <button type='button' className='profile-remove-btn' onClick={() => inputRef.current?.click()} disabled={busy}><ImagePlus size={17}/> Subir foto</button>}</div>
    <section className='polymet-profile-preferences' aria-label='Preferencias futuras'><div><span><Moon size={19}/></span><strong>Modo oscuro</strong><input type='checkbox' disabled aria-label='Modo oscuro: aún no disponible'/></div><div><span><WifiOff size={19}/></span><span><strong>Modo sin conexión</strong><small>Los cambios se sincronizan al instante</small></span><input type='checkbox' disabled aria-label='Modo sin conexión: aún no disponible'/></div></section>
    <form action='/auth/signout' method='post' className='polymet-profile-signout'><button type='submit'><LogOut size={16}/> Cerrar sesión</button></form>
  </section>;
}
