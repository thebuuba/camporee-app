'use client';

import { ChangeEvent, useRef, useState } from 'react';
import { Camera, ImagePlus, Trash2, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { reportMutationError, reportMutationSuccess } from '@/lib/client-ui';

type Props = {
  userId: string;
  fullName: string;
  email: string;
  initialAvatarUrl: string | null;
};

const MAX_SIZE = 5 * 1024 * 1024;
const allowedTypes = new Set(['image/jpeg','image/png','image/webp','image/heic','image/heif']);

export default function ProfileClient({ userId, fullName, email, initialAvatarUrl }: Props) {
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
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

  return <section className='profile-card ios-card'>
    <div className='profile-avatar-wrap'>
      <button type='button' className='profile-avatar-button' onClick={() => inputRef.current?.click()} disabled={busy} aria-label='Cambiar foto de perfil'>
        {avatarUrl ? <img src={avatarUrl} alt={`Foto de ${fullName}`} /> : <span className='profile-avatar-fallback'>{initial || <UserRound size={36}/>}</span>}
        <span className='profile-avatar-camera'><Camera size={17}/></span>
      </button>
      <input ref={inputRef} className='profile-file-input' type='file' accept='image/jpeg,image/png,image/webp,image/heic,image/heif' onChange={uploadAvatar}/>
    </div>

    <div className='profile-copy'>
      <h2>{fullName}</h2>
      <span>{email}</span>
      <p>Esta foto aparecerá en la esquina superior derecha de Inicio.</p>
    </div>

    {error ? <div className='auth-alert error' role='alert'>{error}</div> : null}

    <div className='profile-actions'>
      <button type='button' className='primary-btn' onClick={() => inputRef.current?.click()} disabled={busy}><ImagePlus size={18}/>{busy ? 'Guardando…' : avatarUrl ? 'Cambiar foto' : 'Subir foto'}</button>
      {avatarUrl ? <button type='button' className='profile-remove-btn' onClick={removeAvatar} disabled={busy}><Trash2 size={17}/> Quitar foto</button> : null}
    </div>
  </section>;
}
