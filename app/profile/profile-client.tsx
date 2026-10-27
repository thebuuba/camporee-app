'use client';
import SafeSignoutForm from '@/app/components/safe-signout-form';

import { ChangeEvent, useRef, useState } from 'react';
import { Camera, ImagePlus, Trash2, UserRound, Moon, WifiOff, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { reportMutationError, reportMutationSuccess } from '@/lib/client-ui';
import { mutationProblem, mutationNotice } from '@/lib/mutation-result';
import { useTheme } from '@/app/components/theme-provider';

type Props = {
  userId: string;
  fullName: string;
  email: string;
  initialAvatarPath:string|null;
  initialAvatarUrl: string | null;
};

const MAX_SIZE = 5 * 1024 * 1024;
const allowedTypes = new Set(['image/jpeg','image/png','image/webp','image/heic','image/heif']);

export default function ProfileClient({ userId, fullName, email, initialAvatarPath, initialAvatarUrl }: Props) {
  const { dark, setPreference } = useTheme();
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [avatarPath,setAvatarPath]=useState(initialAvatarPath);
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
      // A failed profile save must not overwrite the currently referenced image.
      const path = `${userId}/avatar-${crypto.randomUUID()}`;
      const { error: uploadError } = await supabase.storage.from('profile-avatars').upload(path, file, {
        upsert: false,
        cacheControl: '3600',
        contentType: file.type,
      });
      if (uploadError) throw uploadError;

      const { data: signedData,error:signError } = await supabase.storage.from('profile-avatars').createSignedUrl(path,300);
      if(signError||!signedData?.signedUrl)throw signError??new Error('No se pudo cargar la foto.');
      const nextUrl = signedData.signedUrl;
      const result = await supabase.from('profiles').update({ avatar_path:path, avatar_url:null, updated_at: new Date().toISOString() }).eq('id', userId).select('id');
      const profileError = mutationProblem(result,[userId]);
      if (profileError) throw profileError;

      setAvatarUrl(nextUrl);
      setAvatarPath(path);
      // Pending saves and uncertain responses keep both files for safe recovery.
      if (result.status !== 202 && avatarPath?.startsWith(`${userId}/`)) {
        const { error: cleanupError } = await supabase.storage.from('profile-avatars').remove([avatarPath]);
        if (cleanupError) { setError(reportMutationError(cleanupError,'La foto se actualizó, pero no se pudo retirar la anterior.')); router.refresh(); return; }
      }
      reportMutationSuccess(mutationNotice(result.status,'Foto de perfil actualizada.'));
      if (result.status !== 202) router.refresh();
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
      const result = await supabase.from('profiles').update({ avatar_path:null, avatar_url: null, updated_at: new Date().toISOString() }).eq('id', userId).select('id');
      const profileError = mutationProblem(result,[userId]);
      if (profileError) throw profileError;
      setAvatarUrl(null);
      setAvatarPath(null);
      if (result.status !== 202 && avatarPath?.startsWith(`${userId}/`)) {
        const { error: cleanupError } = await supabase.storage.from('profile-avatars').remove([avatarPath]);
        if (cleanupError) { setError(reportMutationError(cleanupError,'La foto se desvinculó, pero no se pudo retirar su archivo.')); router.refresh(); return; }
      }
      reportMutationSuccess(mutationNotice(result.status,'Foto de perfil eliminada.'));
      if (result.status !== 202) router.refresh();
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
    try {
      const result = await supabase.from('profiles').update({ full_name: nextName, updated_at: new Date().toISOString() }).eq('id', userId).select('id');
      const updateError = mutationProblem(result,[userId]);
      if (updateError) throw updateError;
      reportMutationSuccess(mutationNotice(result.status,'Perfil guardado.')); if (result.status !== 202) router.refresh();
    } catch(error) {setError(reportMutationError(error, 'No se pudo guardar el perfil.'));}
    finally {setSavingName(false);}
  }

  return <section className='polymet-profile'>
    <div className='polymet-profile-hero'>
      <div className='profile-avatar-wrap'><button type='button' className='profile-avatar-button' onClick={() => inputRef.current?.click()} disabled={busy} aria-label='Cambiar foto de perfil'>{avatarUrl ? <img src={avatarUrl} alt={`Foto de ${fullName}`}/> : <span className='profile-avatar-fallback'>{initial || <UserRound size={36}/>}</span>}<span className='profile-avatar-camera'><Camera size={17}/></span></button><input ref={inputRef} className='profile-file-input' type='file' accept='image/jpeg,image/png,image/webp,image/heic,image/heif' onChange={uploadAvatar}/></div>
      <h2>{name || fullName}</h2><span>Los permisos de tu club los administra el director</span>
    </div>
    <form className='polymet-profile-form' onSubmit={saveProfile}><label>Nombre<input value={name} onChange={(event) => setName(event.target.value)} required/></label><label>Correo<input value={email} readOnly/></label>{error ? <div className='auth-alert error' role='alert'>{error}</div> : null}<button type='submit' className='primary-btn' disabled={savingName}>{savingName ? 'Guardando…' : 'Guardar perfil'}</button></form>
    <div className='profile-actions'>{avatarUrl ? <button type='button' className='profile-remove-btn' onClick={removeAvatar} disabled={busy}><Trash2 size={17}/> Quitar foto</button> : <button type='button' className='profile-remove-btn' onClick={() => inputRef.current?.click()} disabled={busy}><ImagePlus size={17}/> Subir foto</button>}</div>
    <section className='polymet-profile-preferences' aria-label='Preferencias'><div><span><Moon size={19}/></span><strong>Modo oscuro</strong><input type='checkbox' checked={dark} onChange={(event) => setPreference(event.target.checked ? 'dark' : 'light')} role='switch' aria-label='Modo oscuro'/></div><div><span><WifiOff size={19}/></span><span><strong>Modo sin conexión</strong><small>La pantalla abierta sigue disponible. Los cambios pendientes se envían al recuperar internet.</small></span></div></section>
    <SafeSignoutForm className='polymet-profile-signout'><button type='submit'><LogOut size={16}/> Cerrar sesión</button></SafeSignoutForm>
  </section>;
}
