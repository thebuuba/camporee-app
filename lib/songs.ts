export const songCategories = { hymns: 'Himnos', camporee: 'Camporee', club: 'Del club' } as const;
export type Song = { id: string; title: string; category: keyof typeof songCategories; lyrics: string; chords: string; audioUrl: string; stored: boolean };
type SongDocument = { id: string; title: string; document_type: string | null; notes?: string | null; external_url?: string | null };
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export function safeAudioUrl(value: string) {
  if (/^\/audio\/[a-z0-9-]+\.mp3$/.test(value)) return value;
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
}

// Songs are text documents; reuse the shared document store and its settings permissions.
export function songsFromDocuments(documents: SongDocument[]): Song[] {
  const songs: Song[] = documents.filter(item => item.document_type?.startsWith('song:')).map(item => {
    const category = item.document_type!.slice(5) as Song['category'];
    let lyrics = item.notes ?? '', chords = '';
    try {
      const content = JSON.parse(lyrics);
      lyrics = typeof content?.lyrics === 'string' ? content.lyrics : '';
      chords = typeof content?.chords === 'string' ? content.chords : '';
    } catch { /* Older text documents can contain a plain lyric. */ }
    return { id: item.id, title: item.title, category: Object.hasOwn(songCategories, category) ? category : 'club', lyrics, chords, audioUrl: safeAudioUrl(item.external_url ?? ''), stored: true };
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
