'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { Music2, Pause, Play, X } from 'lucide-react';
import BottomSheet from './bottom-sheet';
import { safeAudioUrl, songsFromDocuments, type Song } from '@/lib/songs';

type Track = Pick<Song, 'id' | 'title' | 'audioUrl'>;
type Player = { current: Track | null; playing: boolean; playSong: (song: Track) => void; showPlayer: () => void; setSongs: (songs: Song[]) => void; stop: () => void };
const MusicContext = createContext<Player | null>(null);
export function useMusicPlayer() {
  const player = useContext(MusicContext);
  if (!player) throw new Error('El cancionero necesita el reproductor de la app.');
  return player;
}
const playable = (song: Track) => safeAudioUrl(song.audioUrl).startsWith('/audio/');
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export default function MusicPlayer({ children }: { children: ReactNode }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [current, setCurrent] = useState<Track | null>(null);
  const [playing, setPlaying] = useState(false);
  const [open, setOpen] = useState(false);
  const [songs, updateSongs] = useState<Track[]>(() => songsFromDocuments([]).filter(playable));
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState('');
  const pathname = usePathname();
  const setSongs = useCallback((items: Song[]) => updateSongs(items.filter(playable)), []);
  const stop = useCallback(() => {
    audio.current?.pause();
    audio.current?.removeAttribute('src');
    audio.current?.load();
    setCurrent(null); setPlaying(false); setOpen(false); setTime(0); setDuration(0); setError('');
  }, []);
  useEffect(() => { if (pathname === '/login' || pathname === '/signup' || pathname.startsWith('/auth/')) stop(); }, [pathname, stop]);

  function resume() {
    setError('');
    void audio.current?.play().catch((cause: unknown) => {
      if ((cause as { name?: string })?.name !== 'AbortError') setError('No se pudo reproducir el audio. Intenta de nuevo con conexión.');
    });
  }
  function playSong(song: Track) {
    if (!playable(song) || !audio.current) return;
    if (current?.audioUrl !== song.audioUrl) {
      audio.current.src = safeAudioUrl(song.audioUrl);
      audio.current.currentTime = 0;
      setTime(0); setDuration(0);
    }
    setCurrent(song);
    resume(); // Keep play inside the user gesture, including on mobile Safari.
  }

  return <MusicContext.Provider value={{ current, playing, playSong, showPlayer: () => setOpen(true), setSongs, stop }}>
    {children}
    {/* This element stays mounted when sheets close or the user changes routes. */}
    <audio ref={audio} data-camporee-player hidden preload="none" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onTimeUpdate={event => setTime(event.currentTarget.currentTime)} onLoadedMetadata={event => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)} onError={() => { if (audio.current?.getAttribute('src')) { setPlaying(false); setError('No se pudo cargar el audio. Intenta con conexión.'); } }}/>
    {current ? <button type="button" className={`music-bubble${playing ? ' is-playing' : ''}`} aria-label={`Abrir reproductor: ${current.title}`} aria-haspopup="dialog" onClick={() => setOpen(true)}><Music2 size={23} aria-hidden="true"/><span className="music-bubble-dot" aria-hidden="true"/></button> : null}
    <BottomSheet open={open && Boolean(current)} onClose={() => setOpen(false)} title="Reproductor" description={current?.title} footer={<button type="button" className="music-remove" onClick={stop}><X size={18} aria-hidden="true"/> Quitar reproductor</button>}>
      <div className="music-panel">
        {error ? <p className="auth-alert error" role="alert">{error}</p> : null}
        <button type="button" className="primary-btn music-toggle" onClick={() => { if (playing) audio.current?.pause(); else resume(); }}>{playing ? <Pause size={20} aria-hidden="true"/> : <Play size={20} aria-hidden="true"/>}{playing ? 'Pausar' : 'Reproducir'}</button>
        <label className="music-seek"><span className="sr-only">Posición de la canción</span><input aria-label="Posición de la canción" type="range" min={0} max={duration || 1} step={1} value={Math.min(time, duration || 0)} disabled={!duration} onChange={event => { const value = Number(event.target.value); if (audio.current) audio.current.currentTime = value; setTime(value); }}/><span><small>{clock(time)}</small><small>{clock(duration)}</small></span></label>
        <h3>Otra canción</h3>
        <div className="music-playlist">{songs.map(song => <button type="button" key={song.id} className={current?.audioUrl === song.audioUrl ? 'active' : ''} aria-pressed={current?.audioUrl === song.audioUrl} onClick={() => playSong(song)}><Music2 size={18} aria-hidden="true"/><span>{song.title}</span>{current?.audioUrl === song.audioUrl && playing ? <Pause size={16} aria-hidden="true"/> : <Play size={16} aria-hidden="true"/>}</button>)}</div>
      </div>
    </BottomSheet>
  </MusicContext.Provider>;
}
