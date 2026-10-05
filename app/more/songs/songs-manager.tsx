'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Download, ExternalLink, Music2, Pencil, Plus, Search, X } from 'lucide-react';
import BottomSheet from '@/app/components/bottom-sheet';
import { useMusicPlayer } from '@/app/components/music-player';
import { createClient } from '@/lib/supabase/client';
import { reportMutationError, reportMutationSuccess } from '@/lib/client-ui';
import { audioFileType, isPlayableSong, safeAudioUrl, songCategories, songPayload, songsFromDocuments, type Song } from '@/lib/songs';
import { songSourceKey } from '@/lib/song-downloads';

export default function SongsManager({ camporeeId, userId, canEdit, initialSongs }: { camporeeId: string; userId: string; canEdit: boolean; initialSongs: Song[] }) {
  const [songs, setSongs] = useState(initialSongs);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [selected, setSelected] = useState<Song | null>(null);
  const [editing, setEditing] = useState<Song | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fullLyrics, setFullLyrics] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const router = useRouter();
  const player = useMusicPlayer();
  useEffect(() => { setSongs(initialSongs); }, [initialSongs]);
  useEffect(() => { player.setSongs(songs, `${userId}:${camporeeId}`); }, [songs, userId, camporeeId, player.setSongs]);
  useEffect(() => { if (selected) void player.prepareSong(selected).catch(() => undefined); }, [selected, player.prepareSong]);
  const text = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const downloaded = (song: Song) => player.downloads.some(item => songSourceKey(item.song) === songSourceKey(song));
  const catalog = category === 'downloaded' ? player.downloads.map(item => songs.find(song => songSourceKey(song) === songSourceKey(item.song)) ?? item.song) : songs;
  const visible = catalog.filter(song => (category === 'all' || category === 'downloaded' || song.category === category) && text(`${song.title} ${song.lyrics}`).includes(text(query)));
  function selectSong(song: Song) { setSelected(song); setFullLyrics(false); setDownloadError(''); }
  async function changeDownload(song: Song) {
    setDownloadError('');
    try { if (downloaded(song)) await player.removeDownload(song); else await player.downloadSong(song); }
    catch (cause) { setDownloadError(cause instanceof Error ? cause.message : 'No se pudo descargar. Comprueba tu conexión y el espacio disponible.'); }
  }
  function openEditor(song: Song | null) { setSelected(null); setEditing(song); setError(''); setOpen(true); }

  async function save(fields: FormData) {
    if (!canEdit || saving) return;
    setSaving(true); setError('');
    let uploadedPath = '';
    const supabase = createClient();
    try {
      const file = fields.get('audio_file');
      if (file && typeof file !== 'string' && file.size) fields.set('audio_url', '');
      const payload = songPayload(fields);
      let filePath = editing?.filePath && (payload.external_url ?? '') === editing.audioUrl ? editing.filePath : null;
      if (file && typeof file !== 'string' && file.size) {
        const contentType = audioFileType(file);
        const extension = file.name.split('.').pop()!.toLowerCase();
        const path = `${camporeeId}/songs/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from('camporee-files').upload(path, file, { contentType, upsert: false });
        if (uploadError) throw uploadError;
        uploadedPath = path; filePath = path; payload.external_url = null;
      }
      const document = { ...payload, file_path: filePath };
      const builder = editing?.stored ? supabase.from('camporee_documents').update(document).eq('id', editing.id).eq('camporee_id', camporeeId) : supabase.from('camporee_documents').insert({ ...document, camporee_id: camporeeId, created_by: userId });
      const { data, error: saveError } = await builder.select('id,title,document_type,notes,external_url,file_path').single();
      if (saveError || !data) throw saveError ?? new Error('No se recibió la canción guardada.');
      uploadedPath = ''; // The document now owns the file, even if a later UI update fails.
      if (editing?.filePath && editing.filePath !== filePath && editing.filePath.startsWith(`${camporeeId}/songs/`)) {
        if (player.current?.id === editing.id) player.stop();
        await supabase.storage.from('camporee-files').remove([editing.filePath]).catch(() => undefined);
      }
      const song = songsFromDocuments([data]).find(item => item.id === data.id)!;
      setSongs(current => [...current.filter(item => item.id !== editing?.id && item.id !== song.id), song].sort((a,b) => a.title.localeCompare(b.title, 'es')));
      setOpen(false); setSelected(song); reportMutationSuccess('Canción guardada.'); router.refresh();
    } catch (cause) {
      if (uploadedPath) await supabase.storage.from('camporee-files').remove([uploadedPath]).catch(() => undefined);
      setError(reportMutationError(cause, 'No se pudo guardar la canción.'));
    }
    finally { setSaving(false); }
  }

  return <>
    <label className="polymet-search"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar canción o letra" aria-label="Buscar canción o letra"/>{query ? <button type="button" onClick={() => setQuery('')} aria-label="Limpiar búsqueda"><X size={18}/></button> : <span><Search size={20} aria-hidden="true"/></span>}</label>
    <div className="polymet-filter-scroll" aria-label="Categorías de canciones"><button type="button" className={category === 'all' ? 'active' : ''} aria-pressed={category === 'all'} onClick={() => setCategory('all')}>Todas</button>{Object.entries(songCategories).map(([key, label]) => <button type="button" key={key} className={category === key ? 'active' : ''} aria-pressed={category === key} onClick={() => setCategory(key)}>{label}</button>)}<button type="button" className={category === 'downloaded' ? 'active' : ''} aria-pressed={category === 'downloaded'} onClick={() => setCategory('downloaded')}>Descargadas</button></div>
    {canEdit ? <button type="button" className="panel-add" onClick={() => openEditor(null)}><Plus size={18} aria-hidden="true"/> Canción</button> : null}
    <section className="panel-list song-list" aria-label="Canciones">{visible.length ? visible.map(song => <button type="button" className="panel-row ios-card song-row" key={`${song.id}:${songSourceKey(song)}`} onClick={() => selectSong(song)}><span className={`more-icon tone-${song.category === 'hymns' ? 'yellow' : song.category === 'camporee' ? 'peach' : 'sage'}`}><Music2 size={22} aria-hidden="true"/></span><span className="panel-row-copy"><strong>{song.title}</strong><small>{songCategories[song.category]} · {downloaded(song) ? 'Descargada' : song.lyrics ? 'Letra disponible' : isPlayableSong(song) || song.audioUrl ? 'Audio disponible' : 'Por completar'}</small></span><ChevronRight size={18} aria-hidden="true"/></button>) : <div className="empty compact">{query ? 'No hay canciones que coincidan con tu búsqueda.' : 'Todavía no hay canciones en esta categoría.'}</div>}</section>
    <BottomSheet open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.title ?? ''} description={selected ? songCategories[selected.category] : ''} footer={canEdit ? <button type="button" className="primary-btn" onClick={() => openEditor(selected)}><Pencil size={16} aria-hidden="true"/> {selected?.stored ? 'Editar canción' : 'Completar canción'}</button> : undefined}>
      {selected ? <div className="song-detail">
        {selected.lyrics ? <section><h3>Letra</h3><button type="button" className="song-lyric-preview" aria-expanded={fullLyrics} onClick={() => setFullLyrics(value => !value)}><span className={`song-lyrics${fullLyrics ? '' : ' is-preview'}`}>{selected.lyrics}</span><small>{fullLyrics ? 'Ver menos' : 'Toca para ver la letra completa'}</small></button></section> : <p className="empty compact">La letra aún no se ha agregado.</p>}
        {isPlayableSong(selected) ? <section className="song-player"><h3>Audio</h3>
          <button type="button" className="primary-btn song-audio" onClick={() => { player.playSong(selected); player.showPlayer(); }}><Music2 size={18} aria-hidden="true"/> Reproducir</button>
          <button type="button" className="song-download-btn" disabled={Boolean(player.downloading)} onClick={() => void changeDownload(selected)}><Download size={17} aria-hidden="true"/> {player.downloading === songSourceKey(selected) ? 'Descargando…' : downloaded(selected) ? 'Quitar descarga' : 'Descargar en la app'}</button>
          {downloaded(selected) ? <p className="song-download-status" role="status">Descargada · Disponible sin internet en este dispositivo</p> : null}
          {downloadError ? <p className="auth-alert error" role="alert">{downloadError}</p> : null}
        </section> : safeAudioUrl(selected.audioUrl) ? <a className="primary-btn song-audio" href={safeAudioUrl(selected.audioUrl)} target="_blank" rel="noopener noreferrer"><ExternalLink size={17} aria-hidden="true"/> Abrir audio</a> : null}
        {selected.chords ? <section><h3>Acordes</h3><pre className="song-chords">{selected.chords}</pre></section> : null}
      </div> : null}
    </BottomSheet>
    <BottomSheet open={open} onClose={() => { if (!saving) setOpen(false); }} title={editing ? 'Editar canción' : 'Nueva canción'} busy={saving}>
      <form className="panel-form pm-sheet-form" onSubmit={event => { event.preventDefault(); void save(new FormData(event.currentTarget)); }}>
        <div className="pm-sheet-fields">{error ? <div className="auth-alert error" role="alert">{error}</div> : null}
          <label className="pm-field"><span>Nombre <b className="pm-required">*</b></span><input name="title" defaultValue={editing?.title ?? ''} required maxLength={200}/></label>
          <label className="pm-field"><span>Categoría</span><select name="category" defaultValue={editing?.category ?? 'club'}>{Object.entries(songCategories).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="pm-field"><span>Letra</span><textarea name="lyrics" defaultValue={editing?.lyrics ?? ''} rows={8}/></label>
          <label className="pm-field"><span>Acordes</span><textarea name="chords" defaultValue={editing?.chords ?? ''} rows={4}/></label>
          <label className="pm-field song-file-field"><span>Audio desde tu teléfono</span><input name="audio_file" type="file" accept="audio/*,.mp3,.m4a,.ogg,.wav,.aac,.opus,.flac"/><small>MP3, M4A, OGG, WAV, AAC, OPUS o FLAC · Hasta 15 MB. Se compartirá con el club al guardar.</small>{editing?.filePath ? <small>Esta canción ya tiene un archivo. Selecciona otro para reemplazarlo.</small> : null}</label>
          <label className="pm-field"><span>Enlace de audio (opcional)</span><input name="audio_url" type="text" inputMode="url" placeholder="https://" defaultValue={editing?.audioUrl ?? ''}/></label>
        </div>
        <div className="pm-sheet-footer"><button type="submit" className="primary-btn" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button></div>
      </form>
    </BottomSheet>
  </>;
}
