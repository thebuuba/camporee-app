'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, Download, ExternalLink, Music2, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import BottomSheet from '@/app/components/bottom-sheet';
import { useMusicPlayer } from '@/app/components/music-player';
import { confirmRemoval, reportMutationError, reportMutationSuccess } from '@/lib/client-ui';
import { audioFileType, isPlayableSong, safeAudioUrl, songCategories, songPayload, songsFromDocuments, type Song } from '@/lib/songs';
import { songSourceKey } from '@/lib/song-downloads';

const UPLOAD_TIMEOUT = 120_000;

export default function SongsManager({ camporeeId, organizationId, userId, canEdit, initialSongs }: { camporeeId: string; organizationId: string; userId: string; canEdit: boolean; initialSongs: Song[] }) {
  const [songs, setSongs] = useState(initialSongs);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [selected, setSelected] = useState<Song | null>(null);
  const [editing, setEditing] = useState<Song | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
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

  // Multipart POST through XMLHttpRequest keeps a real upload percentage, network errors and a bounded wait.
  function uploadSong(body: FormData): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open('POST', `/api/music/${camporeeId}`);
      request.responseType = 'json';
      request.timeout = UPLOAD_TIMEOUT;
      request.upload.onprogress = event => { if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100)); };
      request.onload = () => {
        if (request.status >= 200 && request.status < 300) {
          const response = request.response as { document?: unknown } | null;
          if (response && typeof response === 'object' && response.document) resolve(response.document as Record<string, unknown>);
          else reject(new Error('No se recibió la canción guardada.'));
          return;
        }
        const details = request.response as { message?: string; error?: string } | null;
        const message = details?.message || details?.error;
        reject(new Error(message || 'No se pudo guardar la canción. Inténtalo de nuevo.'));
      };
      request.onerror = () => reject(new Error('No se pudo subir la canción. Revisa tu conexión e inténtalo de nuevo.'));
      request.ontimeout = () => reject(new Error('La subida tardó demasiado. Inténtalo de nuevo.'));
      request.onabort = () => reject(new Error('La subida se canceló.'));
      request.send(body);
    });
  }

  async function save(fields: FormData) {
    if (!canEdit || saving) return;
    setSaving(true); setError(''); setProgress(null);
    try {
      const candidate = fields.get('audio_file');
      const file = candidate && typeof candidate !== 'string' && typeof (candidate as { size?: number }).size === 'number' && (candidate as { size: number }).size > 0 ? candidate : null;
      if (file) fields.set('audio_url', '');
      songPayload(fields);
      if (file) audioFileType(file);
      const body = new FormData();
      body.set('organization_id', organizationId);
      if (editing?.stored) body.set('id', editing.id);
      for (const name of ['title', 'category', 'lyrics', 'chords', 'audio_url']) body.set(name, String(fields.get(name) ?? ''));
      if (file) { setProgress(0); body.set('audio_file', file); }
      const data = await uploadSong(body);
      const song = songsFromDocuments([data as never], { organizationId, camporeeId }).find(item => item.id === data.id);
      if (!song) throw new Error('No se recibió la canción guardada.');
      if (editing && player.current?.id === editing.id && songSourceKey(editing) !== songSourceKey(song)) player.stop();
      setSongs(current => [...current.filter(item => item.id !== editing?.id && item.id !== song.id), song].sort((a, b) => a.title.localeCompare(b.title, 'es')));
      setOpen(false); setSelected(song); reportMutationSuccess('Canción guardada.'); router.refresh();
    } catch (cause) {
      setError(reportMutationError(cause, 'No se pudo guardar la canción.'));
    }
    finally { setSaving(false); setProgress(null); }
  }

  async function remove(song: Song) {
    if (!canEdit || saving || !song.stored) return;
    if (!confirmRemoval(`la canción «${song.title}»`)) return;
    setSaving(true); setError('');
    try {
      const response = await fetch(`/api/music/${camporeeId}/${song.id}?organization_id=${encodeURIComponent(organizationId)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('No se pudo eliminar la canción. Inténtalo de nuevo.');
      if (player.current?.id === song.id) player.stop();
      setSongs(current => current.filter(item => item.id !== song.id));
      setSelected(null); reportMutationSuccess('Canción eliminada.'); router.refresh();
    } catch (cause) {
      setError(reportMutationError(cause, 'No se pudo eliminar la canción.'));
    }
    finally { setSaving(false); }
  }

  return <>
    <label className="polymet-search"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar canción o letra" aria-label="Buscar canción o letra"/>{query ? <button type="button" onClick={() => setQuery('')} aria-label="Limpiar búsqueda"><X size={18}/></button> : <span><Search size={20} aria-hidden="true"/></span>}</label>
    {error && !open ? <p className="auth-alert error" role="alert">{error}</p> : null}
    <div className="polymet-filter-scroll" aria-label="Categorías de canciones"><button type="button" className={category === 'all' ? 'active' : ''} aria-pressed={category === 'all'} onClick={() => setCategory('all')}>Todas</button>{Object.entries(songCategories).map(([key, label]) => <button type="button" key={key} className={category === key ? 'active' : ''} aria-pressed={category === key} onClick={() => setCategory(key)}>{label}</button>)}<button type="button" className={category === 'downloaded' ? 'active' : ''} aria-pressed={category === 'downloaded'} onClick={() => setCategory('downloaded')}>Descargadas</button></div>
    {canEdit ? <button type="button" className="panel-add" onClick={() => openEditor(null)}><Plus size={18} aria-hidden="true"/> Canción</button> : null}
    <section className="panel-list song-list" aria-label="Canciones">{visible.length ? visible.map(song => <button type="button" className="panel-row ios-card song-row" key={`${song.id}:${songSourceKey(song)}`} onClick={() => selectSong(song)}><span className={`more-icon tone-${song.category === 'hymns' ? 'yellow' : song.category === 'camporee' ? 'peach' : 'sage'}`}><Music2 size={22} aria-hidden="true"/></span><span className="panel-row-copy"><strong>{song.title}</strong><small>{songCategories[song.category]} · {downloaded(song) ? 'Descargada' : song.lyrics ? 'Letra disponible' : isPlayableSong(song) || song.audioUrl ? 'Audio disponible' : 'Por completar'}</small></span><ChevronRight size={18} aria-hidden="true"/></button>) : <div className="empty compact">{query ? 'No hay canciones que coincidan con tu búsqueda.' : 'Todavía no hay canciones en esta categoría.'}</div>}</section>
    <BottomSheet open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.title ?? ''} description={selected ? songCategories[selected.category] : ''} footer={canEdit && selected ? <>{selected.stored ? <button type="button" className="primary-btn" onClick={() => openEditor(selected)}><Pencil size={16} aria-hidden="true"/> Editar canción</button> : <button type="button" className="primary-btn" onClick={() => openEditor(selected)}><Pencil size={16} aria-hidden="true"/> Completar canción</button>}{selected.stored ? <button type="button" className="song-remove-btn" disabled={saving} onClick={() => void remove(selected)}><Trash2 size={16} aria-hidden="true"/> Eliminar</button> : null}</> : undefined}>
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
          {progress !== null ? <div className="panel-upload-progress" role="progressbar" aria-label="Progreso de subida" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }}><small>{progress}%</small></span></div> : null}
          <label className="pm-field"><span>Nombre <b className="pm-required">*</b></span><input name="title" defaultValue={editing?.title ?? ''} required maxLength={200}/></label>
          <label className="pm-field"><span>Categoría</span><select name="category" defaultValue={editing?.category ?? 'club'}>{Object.entries(songCategories).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label className="pm-field"><span>Letra</span><textarea name="lyrics" defaultValue={editing?.lyrics ?? ''} rows={8}/></label>
          <label className="pm-field"><span>Acordes</span><textarea name="chords" defaultValue={editing?.chords ?? ''} rows={4}/></label>
          <label className="pm-field song-file-field"><span>Audio desde tu teléfono</span><input name="audio_file" type="file" accept="audio/mpeg,.mp3"/><small>MP3 · Hasta 15 MB. Se compartirá con el club al guardar.</small>{editing?.audio || editing?.filePath ? <small>Esta canción ya tiene un archivo. Selecciona otro para reemplazarlo.</small> : null}</label>
          <label className="pm-field"><span>Enlace de audio (opcional)</span><input name="audio_url" type="text" inputMode="url" placeholder="https://" defaultValue={editing ? (editing.audio ? editing.legacyAudioUrl ?? '' : editing.audioUrl) : ''}/></label>
        </div>
        <div className="pm-sheet-footer"><button type="submit" className="primary-btn" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button></div>
      </form>
    </BottomSheet>
  </>;
}
