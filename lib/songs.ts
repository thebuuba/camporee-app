export const songCategories = { hymns: 'Himnos', camporee: 'Camporee', club: 'Del club' } as const;
export type R2Audio = { provider: 'r2'; key: string; size: number; contentType: 'audio/mpeg'; sha256: string };
export type Song = { id: string; title: string; category: keyof typeof songCategories; lyrics: string; chords: string; audioUrl: string; filePath?: string; stored: boolean; audio?: R2Audio; audioSourceKey?: string; legacyAudioUrl?: string };
type SongDocument = { id: string; title: string; document_type: string | null; notes?: string | null; external_url?: string | null; file_path?: string | null };
export type SongScope = { organizationId: string; camporeeId: string };
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const apiMusicAudio = new RegExp(`^/api/music/${UUID}/${UUID}\\?organization_id=${UUID}$`, 'i');
const r2Key = new RegExp(`^camporee-app/${UUID}/songs/(?:${UUID}|[0-9a-f]{64})\\.mp3$`, 'i');
const isUuid = (value: string) => new RegExp(`^${UUID}$`, 'i').test(value);

// Server-owned audio metadata lives inside notes.audio; reject anything outside the private R2 layout.
export function parseR2Audio(value: unknown): R2Audio | null {
  if (!value || typeof value !== 'object') return null;
  const audio = value as Record<string, unknown>;
  if (audio.provider !== 'r2' || audio.contentType !== 'audio/mpeg') return null;
  if (typeof audio.key !== 'string' || !r2Key.test(audio.key)) return null;
  if (typeof audio.size !== 'number' || !Number.isInteger(audio.size) || audio.size <= 0 || audio.size > 15 * 1024 * 1024) return null;
  if (typeof audio.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(audio.sha256)) return null;
  return { provider: 'r2', key: audio.key, size: audio.size, contentType: 'audio/mpeg', sha256: audio.sha256 };
}

export function safeAudioUrl(value: string) {
  if (/^\/audio\/[a-z0-9-]+\.mp3$/.test(value)) return value;
  if (apiMusicAudio.test(value)) return value;
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
}

// Songs are text documents; reuse the shared document store and its settings permissions.
export function songsFromDocuments(documents: SongDocument[], scope?: SongScope): Song[] {
  const owner = scope && isUuid(scope.organizationId) && isUuid(scope.camporeeId) ? scope : null;
  const songs: Song[] = documents.filter(item => item.document_type?.startsWith('song:')).map(item => {
    const category = item.document_type!.slice(5) as Song['category'];
    let lyrics = item.notes ?? '', chords = '';
    let content: unknown = null;
    try {
      content = JSON.parse(lyrics);
      const parsed = content as { lyrics?: unknown; chords?: unknown } | null;
      lyrics = typeof parsed?.lyrics === 'string' ? parsed.lyrics : '';
      chords = typeof parsed?.chords === 'string' ? parsed.chords : '';
    } catch { /* Older text documents can contain a plain lyric. */ }
    const audio = parseR2Audio((content as { audio?: unknown } | null)?.audio);
    const base: Song = { id: item.id, title: item.title, category: Object.hasOwn(songCategories, category) ? category : 'club', lyrics, chords, audioUrl: '', stored: true };
    if (audio && owner) {
      // The R2 object never exposes a signed Storage URL: the private bucket is streamed through our own API.
      return {
        ...base,
        audioUrl: `/api/music/${owner.camporeeId}/${item.id}?organization_id=${owner.organizationId}`,
        audio,
        audioSourceKey: item.file_path || safeAudioUrl(item.external_url ?? '') || `r2:${audio.key}`,
        ...(item.external_url ? { legacyAudioUrl: item.external_url } : {}),
        ...(item.file_path ? { filePath: item.file_path } : {}),
      };
    }
    return { ...base, audioUrl: safeAudioUrl(item.external_url ?? ''), ...(item.file_path ? { filePath: item.file_path } : {}) };
  });
  const starters: Song[] = [
    { id: 'maranata', title: 'Maranata', category: 'club', lyrics: '', chords: '', audioUrl: '/audio/maranata.mp3', stored: false },
    { id: 'contracorriente', title: 'Contracorriente', category: 'club', lyrics: '', chords: '', audioUrl: '/audio/contracorriente.mp3', stored: false },
    { id: 'conquistadores', title: 'Himno de los Conquistadores', category: 'hymns', lyrics: '', chords: '', audioUrl: '', stored: false },
    { id: 'guias-mayores', title: 'Himno de los Guías Mayores', category: 'hymns', lyrics: '', chords: '', audioUrl: 'https://www.youtube.com/watch?v=HMxR70jNmlU', stored: false },
    { id: 'mejor-aventura', title: 'La Mejor Aventura · Camporí 2019', category: 'camporee', lyrics: '', chords: '', audioUrl: 'https://videos.adventistas.org/es/editoria/eventos/canto-tema-del-campori-dsa-2019-la-mejor-aventura/', stored: false },
  ];
  for (const song of starters) {
    if (!songs.some(item => item.category === song.category && normalize(item.title) === normalize(song.title))) songs.push(song);
  }
  return songs.sort((a, b) => a.title.localeCompare(b.title, 'es'));
}

export function songPayload(fields: FormData) {
  const title = String(fields.get('title') ?? '').trim();
  const category = String(fields.get('category') ?? '');
  const audio = String(fields.get('audio_url') ?? '').trim();
  if (!title) throw new Error('Escribe el nombre de la canción.');
  if (!Object.hasOwn(songCategories, category)) throw new Error('Selecciona una categoría válida.');
  if (audio && !safeAudioUrl(audio)) throw new Error('El enlace de audio debe comenzar con https://.');
  return { title, document_type: `song:${category}`, notes: JSON.stringify({ lyrics: String(fields.get('lyrics') ?? '').trim(), chords: String(fields.get('chords') ?? '').trim() }), external_url: audio ? safeAudioUrl(audio) : null };
}

export function isPlayableSong(song: Pick<Song, 'audioUrl' | 'filePath'> & { audio?: R2Audio }) {
  if (song.audio) return true;
  return Boolean(song.filePath) || safeAudioUrl(song.audioUrl).startsWith('/audio/') || /\.(mp3|m4a|ogg|wav|aac|opus|flac)(?:[?#]|$)/i.test(safeAudioUrl(song.audioUrl));
}
// New uploads go to R2 and must be real MP3; legacy formats keep playing but can no longer be uploaded.
export function audioFileType(file: Pick<File, 'name' | 'type' | 'size'>) {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const mp3 = extension === 'mp3' && (!file.type || file.type === 'audio/mpeg' || file.type === 'application/octet-stream');
  if (!mp3) throw new Error('Selecciona un archivo de audio MP3.');
  if (!file.size) throw new Error('El archivo de audio está vacío.');
  if (file.size > 15 * 1024 * 1024) throw new Error('El audio debe pesar como máximo 15 MB.');
  return 'audio/mpeg';
}
