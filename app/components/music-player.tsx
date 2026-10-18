'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Check, ChevronUp, Download, ListMusic, LoaderCircle, Music2, Pause, Play, SkipBack, SkipForward, X } from 'lucide-react';
import BottomSheet from './bottom-sheet';
import { isPlayableSong, safeAudioUrl, songsFromDocuments, type Song } from '@/lib/songs';
import { listDownloadedSongs, removeDownloadedSong, saveDownloadedSong, songSourceKey, type DownloadedSong } from '@/lib/song-downloads';
import { createClient } from '@/lib/supabase/client';
type Player = { current: Song | null; playing: boolean; downloads: DownloadedSong[]; downloading: string; playSong: (song: Song) => void; prepareSong: (song: Song) => Promise<void>; showPlayer: () => void; setSongs: (songs: Song[], scope: string) => void; stop: () => void; downloadSong: (song: Song) => Promise<void>; removeDownload: (song: Song) => Promise<void> };
const MusicContext = createContext<Player | null>(null);
export function useMusicPlayer() { const player = useContext(MusicContext); if (!player) throw new Error('El cancionero necesita el reproductor de la app.'); return player; }
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
async function sourceUrl(song: Song) {
  if (!song.filePath) return safeAudioUrl(song.audioUrl);
  const { data, error } = await createClient().storage.from('camporee-files').createSignedUrl(song.filePath, 3600);
  if (error || !data?.signedUrl) throw new Error('No se pudo abrir el audio del club. Intenta con conexión.');
  return data.signedUrl;
}
export default function MusicPlayer({ children }: { children: ReactNode }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [current, setCurrent] = useState<Song | null>(null);
  const [playing, setPlaying] = useState(false);
  const [open, setOpen] = useState(false);
  const [songs, updateSongs] = useState<Song[]>(() => songsFromDocuments([]).filter(isPlayableSong));
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState('');
  const [downloads, updateDownloads] = useState<DownloadedSong[]>([]);
  const [downloading, setDownloading] = useState('');
  const [buffering, setBuffering] = useState(false);
  const scope = useRef(''), saved = useRef<DownloadedSong[]>([]), objectUrl = useRef(''), generation = useRef(0), activeSource = useRef('');
  const downloadJob = useRef<AbortController | null>(null);
  const signedSources = useRef(new Map<string, { url: string; expires: number }>());
  const pathname = usePathname();
  const releaseBlob = useCallback(() => { if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); objectUrl.current = ''; }, []);
  const stop = useCallback(() => {
    generation.current++; audio.current?.pause(); audio.current?.removeAttribute('src'); audio.current?.load();
    activeSource.current = ''; releaseBlob(); setCurrent(null); setPlaying(false); setOpen(false); setTime(0); setDuration(0); setError(''); setBuffering(false);
  }, [releaseBlob]);
  const setSongs = useCallback((items: Song[], owner: string) => {
    updateSongs(items.filter(isPlayableSong));
    if (scope.current === owner) return;
    if (scope.current) stop();
    scope.current = owner; saved.current = []; signedSources.current.clear(); updateDownloads([]); downloadJob.current?.abort(); setDownloading('');
    void listDownloadedSongs(owner).then(records => { if (scope.current === owner) { saved.current = records; updateDownloads(records); } }).catch(() => undefined);
  }, [stop]);
  useEffect(() => { if (pathname === '/login' || pathname === '/signup' || pathname.startsWith('/auth/')) { stop(); scope.current = ''; saved.current = []; signedSources.current.clear(); updateDownloads([]); downloadJob.current?.abort(); setDownloading(''); } }, [pathname, stop]);
  useEffect(() => () => { generation.current++; releaseBlob(); downloadJob.current?.abort(); }, [releaseBlob]);
  function resume() {
    setError(''); void audio.current?.play().catch((cause: unknown) => { if ((cause as { name?: string })?.name !== 'AbortError') { setBuffering(false); setError('No se pudo reproducir. Pulsa Reproducir otra vez o descarga el audio con conexión.'); } });
  }
  const prepareSong = useCallback(async (song: Song) => {
    if (!song.filePath || saved.current.some(record => songSourceKey(record.song) === songSourceKey(song))) return;
    const cached = signedSources.current.get(song.filePath);
    if (cached && cached.expires > Date.now()) return;
    const owner = scope.current, url = await sourceUrl(song);
    if (owner === scope.current) signedSources.current.set(song.filePath, { url, expires: Date.now() + 3500_000 });
  }, []);
  useEffect(() => { if (open) for (const song of songs) void prepareSong(song).catch(() => undefined); }, [open, songs, prepareSong]);
  function playSong(song: Song) {
    if (!isPlayableSong(song) || !audio.current) return;
    const key = songSourceKey(song);
    if (activeSource.current === key && audio.current.getAttribute('src')) { setCurrent(song); resume(); return; }
    const request = ++generation.current;
    if (activeSource.current) audio.current.pause(); activeSource.current = ''; releaseBlob();
    setCurrent(song); setPlaying(false); setError(''); setTime(0); setDuration(0); setBuffering(true);
    const begin = (url: string) => { if (generation.current !== request || !audio.current) return; audio.current.src = url; audio.current.currentTime = 0; activeSource.current = key; resume(); };
    const record = saved.current.find(item => songSourceKey(item.song) === key);
    if (record) { objectUrl.current = URL.createObjectURL(record.blob); begin(objectUrl.current); }
    else if (!song.filePath) begin(safeAudioUrl(song.audioUrl));
    else {
      const cached = signedSources.current.get(song.filePath);
      if (cached && cached.expires > Date.now()) begin(cached.url);
      else void sourceUrl(song).then(begin).catch(cause => { if (generation.current === request) { setError(cause.message); setBuffering(false); } });
    }
  }
  async function downloadSong(song: Song) {
    if (!scope.current || !isPlayableSong(song)) throw new Error('Abre el cancionero para descargar esta canción.');
    if (downloadJob.current) throw new Error('Espera a que termine la descarga actual.');
    const owner = scope.current, key = songSourceKey(song), job = new AbortController();
    downloadJob.current = job; setDownloading(key);
    try {
      const response = await fetch(await sourceUrl(song), { signal: job.signal });
      if (!response.ok) throw new Error('No se pudo descargar. Intenta de nuevo con conexión.');
      const blob = await response.blob();
      if (!blob.size || /^(text\/|application\/(json|xml))/i.test(blob.type)) throw new Error('El enlace no contiene un archivo de audio.');
      if (job.signal.aborted || scope.current !== owner) return;
      const record = await saveDownloadedSong(owner, song, blob);
      if (scope.current !== owner) return;
      const records = [...saved.current.filter(item => songSourceKey(item.song) !== key), record]; saved.current = records; updateDownloads(records);
    } catch (cause) { if (!job.signal.aborted) throw cause; }
    finally { if (downloadJob.current === job) { downloadJob.current = null; setDownloading(''); } }
  }
  async function removeDownload(song: Song) {
    const owner = scope.current; await removeDownloadedSong(owner, song); if (scope.current !== owner) return;
    saved.current = saved.current.filter(item => songSourceKey(item.song) !== songSourceKey(song)); updateDownloads(saved.current);
  }
  const playlist = [...songs, ...downloads.map(item => item.song).filter(song => !songs.some(item => songSourceKey(item) === songSourceKey(song)))];
  const downloaded = Boolean(current && downloads.some(item => songSourceKey(item.song) === songSourceKey(current)));
  const isDownloading = Boolean(current && downloading === songSourceKey(current));
  const progress = duration ? Math.min(100, Math.max(0, time / duration * 100)) : 0;
  function togglePlayback() {
    if (playing) audio.current?.pause();
    else if (current && !activeSource.current) playSong(current);
    else resume();
  }
  function skip(direction: number) { if (!playlist.length) return; const index = playlist.findIndex(song => current && songSourceKey(song) === songSourceKey(current)); playSong(playlist[(index + direction + playlist.length) % playlist.length]); }
  useEffect(() => {
    if (!('mediaSession' in navigator) || !current) return;
    if (typeof MediaMetadata !== 'undefined') navigator.mediaSession.metadata = new MediaMetadata({ title: current.title, artist: 'Canciones del club' });
    const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [['play', resume], ['pause', () => audio.current?.pause()], ['previoustrack', () => skip(-1)], ['nexttrack', () => skip(1)], ['stop', stop]];
    for (const [action, handler] of handlers) { try { navigator.mediaSession.setActionHandler(action, handler); } catch { /* Older browsers support fewer controls. */ } }
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
    return () => { for (const [action] of handlers) { try { navigator.mediaSession.setActionHandler(action, null); } catch { /* Unsupported actions can also reject cleanup. */ } } navigator.mediaSession.metadata = null; };
  }, [current, playing, songs, downloads, stop]);
  return <MusicContext.Provider value={{ current, playing, downloads, downloading, playSong, prepareSong, showPlayer: () => setOpen(true), setSongs, stop, downloadSong, removeDownload }}>
    {children}
    <audio ref={audio} data-camporee-player hidden preload="none" onPlay={() => setPlaying(true)} onPlaying={() => setBuffering(false)} onWaiting={() => setBuffering(true)} onPause={() => { setPlaying(false); setBuffering(false); }} onEnded={() => { setPlaying(false); const index = playlist.findIndex(song => current && songSourceKey(song) === songSourceKey(current)); if (index >= 0 && index < playlist.length - 1) playSong(playlist[index + 1]); }} onTimeUpdate={event => setTime(event.currentTarget.currentTime)} onLoadedMetadata={event => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)} onError={() => { if (audio.current?.getAttribute('src')) { setPlaying(false); setBuffering(false); setError('No se pudo cargar el audio. Descárgalo con conexión para escucharlo sin internet.'); } }}/>
    {current && !open ? <aside className="music-mini" aria-label="Reproductor compacto">
      <button type="button" className="music-mini-open" onClick={() => setOpen(true)} aria-label={`Abrir reproductor: ${current.title}`} aria-haspopup="dialog">
        <span className="music-mini-art" aria-hidden="true"><Music2 size={23}/></span>
        <span className="music-mini-copy"><strong>{current.title}</strong><small>{error ? 'No se pudo reproducir · Ver detalle' : buffering ? 'Cargando audio…' : downloaded ? 'Disponible sin conexión' : 'Canciones del club'}</small></span>
        <ChevronUp size={17} aria-hidden="true"/>
      </button>
      <button type="button" className="music-mini-toggle" aria-label={playing ? 'Pausar' : 'Reproducir'} onClick={togglePlayback}>{playing ? <Pause size={23} fill="currentColor" aria-hidden="true"/> : <Play size={23} fill="currentColor" aria-hidden="true"/>}</button>
      <div className="music-mini-progress" aria-hidden="true"><span style={{ width: `${progress}%` }}/></div>
    </aside> : null}
    <BottomSheet open={open && Boolean(current)} onClose={() => setOpen(false)} title="Ahora suena" footer={<button type="button" className="music-remove" onClick={stop}><X size={16} aria-hidden="true"/> Detener y cerrar</button>}>
      <div className="music-panel">
        {error ? <p className="auth-alert error" role="alert">{error}</p> : null}
        <div className="music-artwork" aria-hidden="true"><span className="music-artwork-ring"/><Music2 size={66} strokeWidth={1.25}/><span className="music-artwork-label">CAMPOREE · MÚSICA</span></div>
        <div className="music-track-info"><div><h3>{current?.title}</h3><p>Canciones del club</p></div><button type="button" className="music-download" disabled={downloaded || Boolean(downloading)} aria-label={downloaded ? 'Canción descargada' : isDownloading ? 'Descargando canción' : 'Descargar para escuchar sin conexión'} onClick={() => { if (current) void downloadSong(current).catch(cause => setError(cause instanceof Error ? cause.message : 'No se pudo descargar el audio.')); }}>{downloaded ? <Check size={22}/> : isDownloading ? <LoaderCircle size={22} className="music-loading"/> : <Download size={22}/>}</button></div>
        <label className="music-seek"><span className="sr-only">Posición de la canción</span><input aria-label="Posición de la canción" aria-valuetext={`${clock(time)} de ${clock(duration)}`} style={{ '--music-progress': `${progress}%` } as CSSProperties} type="range" min={0} max={duration || 1} step={1} value={Math.min(time, duration || 0)} disabled={!duration} onChange={event => { const value = Number(event.target.value); if (audio.current) audio.current.currentTime = value; setTime(value); }}/><span><small>{clock(time)}</small><small>{clock(duration)}</small></span></label>
        <div className="music-controls"><button type="button" className="music-skip" aria-label="Canción anterior" onClick={() => skip(-1)} disabled={playlist.length < 2}><SkipBack size={28} fill="currentColor" aria-hidden="true"/></button><button type="button" className="music-toggle" aria-label={playing ? 'Pausar' : 'Reproducir'} onClick={togglePlayback}>{playing ? <Pause size={30} fill="currentColor" aria-hidden="true"/> : <Play size={30} fill="currentColor" aria-hidden="true"/>}</button><button type="button" className="music-skip" aria-label="Canción siguiente" onClick={() => skip(1)} disabled={playlist.length < 2}><SkipForward size={28} fill="currentColor" aria-hidden="true"/></button></div>
        <p className="music-playback-status" role="status">{buffering ? 'Cargando audio…' : downloaded ? 'Descargada · Disponible sin conexión' : playing ? 'Reproduciendo' : 'En pausa'}</p>
        <div className="music-queue-heading"><h3><ListMusic size={19} aria-hidden="true"/> En esta cola</h3><span>{playlist.length} canciones</span></div>
        <div className="music-playlist">{playlist.map((song, index) => {
          const active = Boolean(current && songSourceKey(current) === songSourceKey(song));
          return <button type="button" key={`${song.id}:${songSourceKey(song)}`} className={active ? 'active' : ''} aria-pressed={active} aria-label={`${active && playing ? 'Pausar' : 'Reproducir'} ${song.title}`} onClick={() => active ? togglePlayback() : playSong(song)}><span className="music-queue-number" aria-hidden="true">{active && playing ? <span className="music-equalizer"><i/><i/><i/></span> : String(index + 1).padStart(2, '0')}</span><span className="music-queue-copy">{song.title}<small className="music-downloaded">{downloads.some(item => songSourceKey(item.song) === songSourceKey(song)) ? 'Descargada · Sin conexión' : active ? 'Selección actual' : 'Canciones del club'}</small></span>{active && playing ? <Pause size={18} aria-hidden="true"/> : <Play size={18} aria-hidden="true"/>}</button>;
        })}</div>
      </div>
    </BottomSheet>
  </MusicContext.Provider>;
}
