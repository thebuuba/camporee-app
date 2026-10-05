'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Download, ExternalLink, Music2, Pencil, Plus, Search, X } from 'lucide-react';
import BottomSheet from '@/app/components/bottom-sheet';
import { useMusicPlayer } from '@/app/components/music-player';
import { createClient } from '@/lib/supabase/client';
import { reportMutationError, reportMutationSuccess } from '@/lib/client-ui';
import { safeAudioUrl, songCategories, songPayload, songsFromDocuments, type Song } from '@/lib/songs';

export default function SongsManager({ camporeeId, userId, canEdit, initialSongs }: { camporeeId: string; userId: string; canEdit: boolean; initialSongs: Song[] }) {
  const [songs, setSongs] = useState(initialSongs);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [selected, setSelected] = useState<Song | null>(null);
  const [editing, setEditing] = useState<Song | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const player = useMusicPlayer();
  useEffect(() => { setSongs(initialSongs); }, [initialSongs]);
  useEffect(() => {
    // Save the HTML snapshot even when this page was reached through client navigation.
    const prepare = () => {
      if (!navigator.onLine || !navigator.serviceWorker?.controller) return;
      const resources = Array.from(document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[src],link[rel="stylesheet"]')).map(element => element instanceof HTMLScriptElement ? element.src : element.href).filter(url => new URL(url).origin === location.origin);
      void Promise.all([fetch('/more/songs', { headers: { Accept: 'text/html' } }), ...resources.map(url => fetch(url))]).catch(() => undefined);
    };
    prepare();
    navigator.serviceWorker?.addEventListener('controllerchange', prepare);
    window.addEventListener('online', prepare);
    return () => { navigator.serviceWorker?.removeEventListener('controllerchange', prepare); window.removeEventListener('online', prepare); };
  }, [initialSongs]);
  useEffect(() => { player.setSongs(songs); }, [songs, player.setSongs]);
  const text = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const visible = songs.filter(song => (category === 'all' || song.category === category) && text(`${song.title} ${song.lyrics}`).includes(text(query)));
  function openEditor(song: Song | null) { setSelected(null); setEditing(song); setError(''); setOpen(true); }

  async function save(fields: FormData) {
    if (!canEdit || saving) return;
    setSaving(true); setError('');
    try {
      const payload = songPayload(fields);
      const supabase = createClient();
      const builder = editing?.stored ? supabase.from('camporee_documents').update(payload).eq('id', editing.id).eq('camporee_id', camporeeId) : supabase.from('camporee_documents').insert({ ...payload, camporee_id: camporeeId, created_by: userId });
      const { data, error: saveError } = await builder.select('id,title,document_type,notes,external_url').single();
      if (saveError || !data) throw saveError ?? new Error('No se recibió la canción guardada.');
      const song = songsFromDocuments([data]).find(item => item.id === data.id)!;
      setSongs(current => [...current.filter(item => item.id !== editing?.id && item.id !== song.id), song].sort((a,b) => a.title.localeCompare(b.title, 'es')));
      setOpen(false); setSelected(song); reportMutationSuccess('Canción guardada.'); router.refresh();
    } catch (cause) { setError(reportMutationError(cause, 'No se pudo guardar la canción.')); }
    finally { setSaving(false); }
  }

  return <>
    <label className="polymet-search"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar canción o letra" aria-label="Buscar canción o letra"/>{query ? <button type="button" onClick={() => setQuery('')} aria-label="Limpiar búsqueda"><X size={18}/></button> : <span><Search size={20} aria-hidden="true"/></span>}</label>
    <div className="polymet-filter-scroll" aria-label="Categorías de canciones"><button type="button" className={category === 'all' ? 'active' : ''} aria-pressed={category === 'all'} onClick={() => setCategory('all')}>Todas</button>{Object.entries(songCategories).map(([key, label]) => <button type="button" key={key} className={category === key ? 'active' : ''} aria-pressed={category === key} onClick={() => setCategory(key)}>{label}</button>)}</div>
    {canEdit ? <button type="button" className="panel-add" onClick={() => openEditor(null)}><Plus size={18} aria-hidden="true"/> Canción</button> : null}
    <section className="panel-list song-list" aria-label="Canciones">{visible.length ? visible.map(song => <button type="button" className="panel-row ios-card song-row" key={song.id} onClick={() => setSelected(song)}><span className={`more-icon tone-${song.category === 'hymns' ? 'yellow' : song.category === 'camporee' ? 'peach' : 'sage'}`}><Music2 size={22} aria-hidden="true"/></span><span className="panel-row-copy"><strong>{song.title}</strong><small>{songCategories[song.category]} · {song.lyrics ? 'Letra disponible' : song.audioUrl ? 'Audio disponible' : 'Por completar'}</small></span><ChevronRight size={18} aria-hidden="true"/></button>) : <div className="empty compact">{query ? 'No hay canciones que coincidan con tu búsqueda.' : 'Todavía no hay canciones en esta categoría.'}</div>}</section>
    <BottomSheet open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.title ?? ''} description={selected ? songCategories[selected.category] : ''} footer={canEdit ? <button type="button" className="primary-btn" onClick={() => openEditor(selected)}><Pencil size={16} aria-hidden="true"/> {selected?.stored ? 'Editar canción' : 'Completar canción'}</button> : undefined}>
      {selected ? <div className="song-detail">{selected.lyrics ? <section><h3>Letra</h3><p className="song-lyrics">{selected.lyrics}</p></section> : <p className="empty compact">La letra aún no se ha agregado.</p>}{selected.chords ? <section><h3>Acordes</h3><pre className="song-chords">{selected.chords}</pre></section> : null}{safeAudioUrl(selected.audioUrl).startsWith('/audio/') ? <section className="song-player"><h3>Audio</h3><button type="button" className="primary-btn song-audio" onClick={() => { if (player.current?.audioUrl === selected.audioUrl) player.showPlayer(); else player.playSong(selected); }}><Music2 size={18} aria-hidden="true"/> {player.current?.audioUrl === selected.audioUrl ? 'Ver reproductor' : 'Reproducir'}</button><a className="primary-btn song-audio" href={selected.audioUrl} download><Download size={17} aria-hidden="true"/> Descargar MP3</a></section> : safeAudioUrl(selected.audioUrl) ? <a className="primary-btn song-audio" href={safeAudioUrl(selected.audioUrl)} target="_blank" rel="noopener noreferrer"><ExternalLink size={17} aria-hidden="true"/> Abrir audio</a> : null}</div> : null}
    </BottomSheet>
    <BottomSheet open={open} onClose={() => { if (!saving) setOpen(false); }} title={editing ? 'Editar canción' : 'Nueva canción'} busy={saving}>
      <form className="panel-form pm-sheet-form" onSubmit={event => { event.preventDefault(); void save(new FormData(event.currentTarget)); }}>
        <div className="pm-sheet-fields">{error ? <div className="auth-alert error" role="alert">{error}</div> : null}
          <label className="pm-field"><span>Nombre <b className="pm-required">*</b></span><input name="title" defaultValue={editing?.title ?? ''} required maxLength={200}/></label>
          <label className="pm-field"><span>Categoría</span><select name="category" defaultValue={editing?.category ?? 'club'}>{Object.entries(songCategories).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="pm-field"><span>Letra</span><textarea name="lyrics" defaultValue={editing?.lyrics ?? ''} rows={8}/></label>
          <label className="pm-field"><span>Acordes</span><textarea name="chords" defaultValue={editing?.chords ?? ''} rows={4}/></label>
          <label className="pm-field"><span>Enlace de audio</span><input name="audio_url" type="text" inputMode="url" placeholder="https://" defaultValue={editing?.audioUrl ?? ''}/></label>
        </div>
        <div className="pm-sheet-footer"><button type="submit" className="primary-btn" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button></div>
      </form>
    </BottomSheet>
  </>;
}
