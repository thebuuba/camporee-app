import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

async function library() { return import('../lib/songs.ts'); }

const ORG = '50000000-0000-4000-8000-000000000001';
const CAMP = '60000000-0000-4000-8000-000000000001';
const SONG = '70000000-0000-4000-8000-000000000001';
const KEY = `camporee-app/${CAMP}/songs/${SONG}.mp3`;
const audio = { provider: 'r2', key: KEY, size: 2048, contentType: 'audio/mpeg', sha256: 'b'.repeat(64) };
const scope = { organizationId: ORG, camporeeId: CAMP };

test('Contracorriente utiliza el MP3 local del club', async () => {
  const {songsFromDocuments,safeAudioUrl}=await library();
  const song=songsFromDocuments([]).find(item=>item.title==='Contracorriente');
  assert.ok(song);
  assert.equal(song.audioUrl,'/audio/contracorriente.mp3');
  assert.equal(safeAudioUrl(song.audioUrl),'/audio/contracorriente.mp3');
  assert.equal(safeAudioUrl('//example.com/audio.mp3'),'');
  assert.equal(safeAudioUrl('/audio/../secret.mp3'),'');
});

test('el cancionero convierte documentos de canciones y mantiene letras y acordes', async () => {
  const { songsFromDocuments } = await library();
  const songs = songsFromDocuments([{id:'one',title:'Marcha',document_type:'song:camporee',notes:JSON.stringify({lyrics:'Texto del club\nSegunda línea',chords:'Do Sol'}),external_url:'https://example.com/audio'}]);
  assert.deepEqual(songs.find(song=>song.id==='one'),{id:'one',title:'Marcha',category:'camporee',lyrics:'Texto del club\nSegunda línea',chords:'Do Sol',audioUrl:'https://example.com/audio',stored:true});
});

test('no muestra documentos normales ni permite enlaces de audio inseguros', async () => {
  const { songsFromDocuments, songPayload } = await library();
  assert.equal(songsFromDocuments([{id:'file',title:'Recibo',document_type:'recibo'}]).some(song=>song.id==='file'),false);
  const fields=new FormData();fields.set('title','Mi canción');fields.set('category','club');fields.set('audio_url','javascript:alert(1)');
  assert.throws(()=>songPayload(fields),/https/i);
  fields.set('audio_url','https://example.com/audio');fields.set('lyrics','Letra compartida');
  assert.deepEqual(songPayload(fields),{title:'Mi canción',document_type:'song:club',notes:JSON.stringify({lyrics:'Letra compartida',chords:''}),external_url:'https://example.com/audio'});
});

test('los himnos guardados reemplazan las entradas iniciales sin duplicarlas', async () => {
  const { songsFromDocuments } = await library();
  const songs=songsFromDocuments([{id:'hymn',title:'Himno de los Conquistadores',document_type:'song:hymns',notes:'{"lyrics":"Texto proporcionado"}'}]);
  assert.equal(songs.filter(song=>song.title==='Himno de los Conquistadores').length,1);
  assert.equal(songs.find(song=>song.id==='hymn').lyrics,'Texto proporcionado');
  assert.ok(songs.some(song=>song.title==='Himno de los Guías Mayores'));
});

test('letras antiguas o metadatos dañados no rompen el cancionero', async () => {
  const { songsFromDocuments } = await library();
  const songs=songsFromDocuments([{id:'old',title:'Antigua',document_type:'song:club',notes:'Texto simple'}, {id:'bad',title:'Dañada',document_type:'song:hymns',notes:'null',external_url:'data:text/html,test'}]);
  assert.equal(songs.find(song=>song.id==='old').lyrics,'Texto simple');
  assert.equal(songs.find(song=>song.id==='bad').audioUrl,'');
});

test('un título o categoría inválidos no se guardan', async () => {
  const { songPayload } = await library();
  const fields=new FormData();fields.set('title','   ');fields.set('category','club');
  assert.throws(()=>songPayload(fields),/nombre/i);
  fields.set('title','Canción');fields.set('category','otro');
  assert.throws(()=>songPayload(fields),/categoría/i);
});

test('safeAudioUrl acepta solo la ruta exacta del API de música con UUID válidos', async () => {
  const { safeAudioUrl } = await library();
  const url = `/api/music/${CAMP}/${SONG}?organization_id=${ORG}`;
  assert.equal(safeAudioUrl(url), url);
  assert.equal(safeAudioUrl(`${url}&extra=1`), '');
  assert.equal(safeAudioUrl(`/api/music/${CAMP}/not-a-uuid?organization_id=${ORG}`), '');
  assert.equal(safeAudioUrl(`/api/music/${CAMP}/${SONG}?organization_id=not-a-uuid`), '');
  assert.equal(safeAudioUrl(`/api/music/${CAMP}/${SONG}/../otra?organization_id=${ORG}`), '');
});

test('parseR2Audio solo acepta metadatos R2 completos y claves privadas del bucket', async () => {
  const { parseR2Audio } = await library();
  assert.deepEqual(parseR2Audio(audio), audio);
  assert.equal(parseR2Audio({ ...audio, provider: 's3' }), null);
  assert.equal(parseR2Audio({ ...audio, key: `otro/${CAMP}/songs/${SONG}.mp3` }), null);
  assert.equal(parseR2Audio({ ...audio, key: `camporee-app/${CAMP}/songs/../../x.mp3` }), null);
  assert.equal(parseR2Audio({ ...audio, contentType: 'audio/ogg' }), null);
  assert.equal(parseR2Audio({ ...audio, size: 0 }), null);
  assert.equal(parseR2Audio({ ...audio, sha256: 'nope' }), null);
  assert.equal(parseR2Audio(null), null);
  assert.equal(parseR2Audio(audio.key), null);
});

test('songsFromDocuments arma la ruta del API y conserva la identidad de descargas migradas', async () => {
  const { songsFromDocuments, isPlayableSong } = await library();
  const migrated = songsFromDocuments([{ id: SONG, title: 'Migrada', document_type: 'song:club', notes: JSON.stringify({ lyrics: 'L', audio }), file_path: `${CAMP}/songs/legacy.mp3`, external_url: null }], scope).find(item => item.id === SONG);
  assert.equal(migrated.audioUrl, `/api/music/${CAMP}/${SONG}?organization_id=${ORG}`);
  assert.deepEqual(migrated.audio, audio);
  assert.equal(migrated.audioSourceKey, `${CAMP}/songs/legacy.mp3`);
  assert.equal(migrated.filePath, `${CAMP}/songs/legacy.mp3`);
  assert.equal(isPlayableSong(migrated), true);
  const external = songsFromDocuments([{ id: SONG, title: 'Externa', document_type: 'song:club', notes: JSON.stringify({ lyrics: 'L', audio }), file_path: null, external_url: 'https://example.com/song.mp3' }], scope).find(item => item.id === SONG);
  assert.equal(external.audioSourceKey, 'https://example.com/song.mp3');
  assert.equal(external.legacyAudioUrl, 'https://example.com/song.mp3');
  const fresh = songsFromDocuments([{ id: SONG, title: 'Nueva', document_type: 'song:club', notes: JSON.stringify({ lyrics: 'L', audio }), file_path: null, external_url: null }], scope).find(item => item.id === SONG);
  assert.equal(fresh.audioSourceKey, `r2:${KEY}`);
  assert.equal(fresh.legacyAudioUrl, undefined);
});

test('sin scope válido no se expone audio R2 ni rutas inventadas', async () => {
  const { songsFromDocuments } = await library();
  const song = songsFromDocuments([{ id: SONG, title: 'R2', document_type: 'song:club', notes: JSON.stringify({ audio }) }]).find(item => item.id === SONG);
  assert.equal(song.audio, undefined);
  assert.equal(song.audioUrl, '');
  const wrong = songsFromDocuments([{ id: SONG, title: 'R2', document_type: 'song:club', notes: JSON.stringify({ audio }) }], { organizationId: 'org', camporeeId: 'camp' }).find(item => item.id === SONG);
  assert.equal(wrong.audio, undefined);
});

test('audioFileType exige MP3 para nuevas subidas y conserva el límite de 15 MB', async () => {
  const { audioFileType } = await library();
  assert.equal(audioFileType({ name: 'cancion.mp3', type: 'audio/mpeg', size: 100 }), 'audio/mpeg');
  assert.equal(audioFileType({ name: 'cancion.mp3', type: 'application/octet-stream', size: 100 }), 'audio/mpeg');
  assert.throws(() => audioFileType({ name: 'grabacion.m4a', type: 'audio/mp4', size: 100 }), /mp3/i);
  assert.throws(() => audioFileType({ name: 'texto.txt', type: 'text/plain', size: 100 }), /mp3/i);
  assert.throws(() => audioFileType({ name: 'grande.mp3', type: 'audio/mpeg', size: 16 * 1024 * 1024 }), /15 MB/);
  assert.throws(() => audioFileType({ name: 'vacio.mp3', type: 'audio/mpeg', size: 0 }), /vacío/i);
});

function makeFormData(audioFile) {
  return class {
    constructor(form) {
      if (form) {
        const fields = new FormData();
        fields.set('title', 'Canción del club');
        fields.set('category', 'club');
        fields.set('lyrics', 'Nuestra letra');
        if (audioFile) fields.set('audio_file', audioFile);
        return fields;
      }
      return new FormData();
    }
  };
}

async function renderSongs({ canEdit = true, initialSongs = [], audioFile, player, confirm = true } = {}) {
  const { loadBindings, transform } = createRequire(import.meta.url)('next/dist/build/swc'); await loadBindings();
  const { code } = await transform(await readFile(new URL('../app/more/songs/songs-manager.tsx', import.meta.url), 'utf8'), { filename: 'songs-manager.tsx', jsc: { parser: { syntax: 'typescript', tsx: true }, target: 'es2022', transform: { react: { runtime: 'automatic' } } }, module: { type: 'commonjs' } });
  const states = [], refs = [], effects = []; let stateIndex = 0, refIndex = 0;
  const requests = [], fetchCalls = [], confirmCalls = [];
  const jsx = (type, props) => ({ type, props }); const module = { exports: {} };
  const playerApi = player ?? { current: null, downloads: [], downloading: '', setSongs() {}, stop() {}, prepareSong: async () => {}, playSong() {}, showPlayer() {}, downloadSong: async () => {}, removeDownload: async () => {} };
  class XHR {
    constructor() { this.upload = {}; }
    open(method, url) { this.method = method; this.url = url; }
    send(body) { this.body = body; requests.push(this); }
  }
  const modules = {
    'react/jsx-runtime': { jsx, jsxs: jsx },
    react: {
      useEffect(fn) { effects.push(fn); },
      useState(value) { const index = stateIndex++; if (!(index in states)) states[index] = typeof value === 'function' ? value() : value; return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next; }]; },
      useRef(value) { const index = refIndex++; return refs[index] ?? (refs[index] = { current: value }); },
    },
    'next/navigation': { useRouter: () => ({ refresh() {} }) },
    'lucide-react': {},
    '@/app/components/bottom-sheet': props => ({ type: 'sheet', props }),
    '@/app/components/music-player': { useMusicPlayer: () => playerApi },
    '@/lib/client-ui': { confirmRemoval: label => { confirmCalls.push(label); return confirm; }, reportMutationError: (error, fallback) => (error instanceof Error && error.message) || fallback, reportMutationSuccess() {} },
    '@/lib/songs': await library(),
    '@/lib/song-downloads': await import('../lib/song-downloads.ts'),
  };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => modules[name], navigator: { onLine: true }, window: { addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, confirm: () => confirm }, document: { querySelectorAll: () => [] }, crypto, FormData: makeFormData(audioFile), XMLHttpRequest: XHR, fetch: async (url, options) => { fetchCalls.push({ url, options }); return { ok: true, status: 204 }; }, encodeURIComponent });
  function render() { stateIndex = 0; refIndex = 0; return module.exports.default({ camporeeId: CAMP, organizationId: ORG, userId: 'user', canEdit, initialSongs }); }
  function find(node, predicate) {
    if (!node || typeof node !== 'object') return;
    if (predicate(node)) return node;
    for (const child of [node.props?.children, node.props?.footer].flat()) { const found = find(child, predicate); if (found) return found; }
  }
  return { render, find, requests, fetchCalls, confirmCalls };
}

test('un usuario de solo lectura no puede enviar el formulario de canciones', async () => {
  const view = await renderSongs({ canEdit: false });
  const form = view.find(view.render(), node => node.type === 'form');
  form.props.onSubmit({ preventDefault() {}, currentTarget: {} });
  assert.equal(view.requests.length, 0);
});

test('el formulario guarda la canción con el API del servidor y sin escribir Supabase', async () => {
  const view = await renderSongs();
  const form = view.find(view.render(), node => node.type === 'form');
  form.props.onSubmit({ preventDefault() {}, currentTarget: {} });
  const request = view.requests[0];
  assert.equal(request.method, 'POST');
  assert.equal(request.url, `/api/music/${CAMP}`);
  assert.equal(request.body.get('organization_id'), ORG);
  assert.equal(request.body.get('title'), 'Canción del club');
  assert.equal(request.body.get('document_type'), null);
  assert.equal(request.body.get('audio_file'), null);
});

test('la subida muestra progreso accesible y publica el archivo MP3 en el API', async () => {
  const file = new File(['audio original'], 'club.mp3', { type: 'audio/mpeg' });
  const view = await renderSongs({ audioFile: file });
  const form = view.find(view.render(), node => node.type === 'form');
  form.props.onSubmit({ preventDefault() {}, currentTarget: {} });
  const request = view.requests[0];
  request.upload.onprogress({ lengthComputable: true, loaded: 50, total: 100 });
  const progress = view.find(view.render(), node => node.props?.role === 'progressbar');
  assert.ok(progress, 'debe existir una fila de progreso accesible');
  assert.equal(progress.props['aria-valuenow'], 50);
  assert.equal(request.body.get('audio_file'), file);
  request.status = 201; request.response = { document: { id: SONG, title: 'Canción del club', document_type: 'song:club', notes: '{"lyrics":"Nuestra letra"}', external_url: null, file_path: null } };
  request.onload();
  await Promise.resolve(); await Promise.resolve();
});

test('un error de red al guardar se comunica sin dejar la subida bloqueada', async () => {
  const view = await renderSongs();
  const form = view.find(view.render(), node => node.type === 'form');
  form.props.onSubmit({ preventDefault() {}, currentTarget: {} });
  view.requests[0].onerror();
  await Promise.resolve(); await Promise.resolve();
  assert.ok(view.find(view.render(), node => node.props?.role === 'alert'));
});

test('el borrado confirma, llama al API y detiene el reproductor si suena esa canción', async () => {
  let stopped = 0;
  const stored = { id: SONG, title: 'Marcha', category: 'club', lyrics: 'L', chords: '', audioUrl: 'https://example.com/song.mp3', stored: true };
  const view = await renderSongs({ initialSongs: [stored], player: { current: { id: SONG }, downloads: [], downloading: '', setSongs() {}, stop() { stopped++; }, prepareSong: async () => {}, playSong() {}, showPlayer() {}, downloadSong: async () => {}, removeDownload: async () => {} } });
  const row = view.find(view.render(), node => node.type === 'button' && node.props?.className?.includes('song-row'));
  row.props.onClick();
  const remove = view.find(view.render(), node => node.type === 'button' && String(node.props?.children).includes('Eliminar'));
  remove.props.onClick();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(view.confirmCalls.length, 1);
  assert.equal(view.fetchCalls[0].url, `/api/music/${CAMP}/${SONG}?organization_id=${ORG}`);
  assert.equal(view.fetchCalls[0].options.method, 'DELETE');
  assert.equal(stopped, 1);
});

test('el campo audio_url de una canción R2 muestra el enlace legacy y nunca la ruta del API', async () => {
  const stored = { id: SONG, title: 'R2', category: 'club', lyrics: 'L', chords: '', audioUrl: `/api/music/${CAMP}/${SONG}?organization_id=${ORG}`, stored: true, audio, audioSourceKey: `r2:${KEY}`, legacyAudioUrl: 'https://example.com/legacy.mp3' };
  const view = await renderSongs({ initialSongs: [stored] });
  const row = view.find(view.render(), node => node.type === 'button' && node.props?.className?.includes('song-row'));
  row.props.onClick();
  const edit = view.find(view.render(), node => node.type === 'button' && String(node.props?.children).includes('Editar canción'));
  edit.props.onClick();
  const input = view.find(view.render(), node => node.type === 'input' && node.props?.name === 'audio_url');
  assert.equal(input.props.defaultValue, 'https://example.com/legacy.mp3');
});
