import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { TenantAccessError, isTenantId } from '../lib/tenant-context.ts';
import { songPayload } from '../lib/songs.ts';

const ORG = '50000000-0000-4000-8000-000000000001';
const CAMP = '60000000-0000-4000-8000-000000000001';
const SONG = '70000000-0000-4000-8000-000000000001';
const KEY = `camporee-app/${CAMP}/songs/${SONG}.mp3`;
const AUDIO = { provider: 'r2', key: KEY, size: 100, contentType: 'audio/mpeg', sha256: 'a'.repeat(64) };

async function harness(options = {}) {
  const { loadBindings, transform } = createRequire(import.meta.url)('next/dist/build/swc');
  await loadBindings();
  const filename = 'lib/song-api.ts';
  const { code } = await transform(await readFile(filename, 'utf8'), {
    filename, jsc: { parser: { syntax: 'typescript' }, target: 'es2022' }, module: { type: 'commonjs' },
  });
  const calls = { puts: [], removed: [], writes: [], reads: [], streamed: [] };
  const bucket = { async put(key) { calls.puts.push(key); return { key }; }, async delete(key) { calls.removed.push(key); } };
  const db = {
    auth: { async getUser() { return { data: { user: options.anonymous ? null : { id: 'authenticated-user' } }, error: null }; } },
    rpc(name, args) {
      assert.equal(name, 'compare_and_update_song_document');
      calls.writes.push({ operation: 'update', rpc: true, payload: args.p_changes, expected: args.p_expected });
      return { select() { return this; }, async maybeSingle() { return { data: { id: SONG, camporee_id: CAMP, ...args.p_changes }, error: null }; } };
    },
    from(table) {
      assert.equal(table, 'camporee_documents');
      let operation = 'read', payload = null;
      const filters = {};
      function result(single = true) {
        if (operation === 'read') {
          calls.reads.push({ ...filters });
          if ('id' in filters) return { data: options.document ?? null, error: null };
          return { data: options.ambiguous ? [{ id: SONG }] : [], error: null };
        }
        calls.writes.push({ operation, payload, filters: { ...filters } });
        if (options.saveError) return { data: null, error: { code: 'network' } };
        return { data: { id: SONG, camporee_id: CAMP, ...payload }, error: null };
      }
      return {
        select() { return this; },
        eq(key, value) { filters[key] = value; return this; },
        is(key, value) { filters[key] = value; return this; },
        like(key, value) { filters[key] = value; return this; }, limit() { return this; },
        insert(value) { operation = 'insert'; payload = value; return this; },
        update(value) { operation = 'update'; payload = value; return this; },
        delete() { operation = 'delete'; return this; },
        async maybeSingle() { return result(); },
        then(resolve, reject) { return Promise.resolve(result(false)).then(resolve, reject); },
      };
    },
  };
  const modules = {
    'server-only': {}, '@/lib/supabase/server': { async createClient() { return db; } },
    '@/lib/songs': { songPayload },
    '@/lib/tenant-context': { TenantAccessError, isTenantId, async resolveCamporeeContext(client, ids) {
      if (options.anonymous) throw new TenantAccessError('authentication');
      if (ids.organizationId !== ORG || ids.camporeeId !== CAMP) throw new TenantAccessError('access');
      return { ...ids, supabase: client, userId: 'authenticated-user', canEdit: () => !options.readOnly };
    } },
    '@/lib/song-audio': {
      musicObjectKey: () => KEY,
      assertMusicKey(key, camporeeId) { if (!key.startsWith(`camporee-app/${camporeeId}/songs/`)) throw Error('Wrong owner'); },
      parseR2Audio: value => value?.provider === 'r2' ? value : null,
      async validateMp3(file) { if (options.invalidMp3) throw Error('Archivo MP3 no válido'); return { bytes: new Uint8Array(await file.arrayBuffer()), size: file.size, sha256: 'a'.repeat(64), contentType: 'audio/mpeg' }; },
    },
    '@/lib/r2-music': {
      async getMusicBucket() { if (options.missingBucket) throw Error('Missing binding'); return bucket; },
      async streamMusic(_bucket, key, request) { calls.streamed.push({ key, method: request.method }); return new Response('audio', { headers: { 'Content-Type': 'audio/mpeg' } }); },
    },
  };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, Request, Response, FormData, Blob, URL, Uint8Array, console: { error() {} }, require: name => modules[name] });
  function request({ file = false, organizationId = ORG, id, audioUrl = '', origin = 'https://camporee.test', lyrics = 'Letra' } = {}) {
    const body = new FormData();
    for (const [name, value] of Object.entries({ organization_id: organizationId, title: 'Marcha', category: 'club', lyrics, chords: 'Do', audio_url: audioUrl })) body.set(name, value);
    if (id) body.set('id', id);
    if (file) body.set('audio_file', new File(['frames'], 'marcha.mp3', { type: 'audio/mpeg' }));
    return new Request(`https://camporee.test/api/music/${CAMP}`, { method: 'POST', headers: { origin }, body });
  }
  return { ...module.exports, calls, request };
}

test('la API bloquea anónimos, solo lectura y otro tenant antes de subir bytes', async () => {
  for (const options of [{ anonymous: true }, { readOnly: true }, {}]) {
    const api = await harness(options);
    const response = await api.saveSong(api.request({ file: true, ...(Object.keys(options).length ? {} : { organizationId: SONG }) }), CAMP);
    assert.equal(response.status, options.anonymous ? 401 : 403);
    assert.equal(api.calls.puts.length, 0);
    assert.equal(api.calls.writes.length, 0);
  }
});

test('guarda metadatos R2 y el autor autenticado sin aceptar claves del cliente', async () => {
  const api = await harness();
  const response = await api.saveSong(api.request({ file: true }), CAMP);
  assert.equal(response.status, 200);
  const { document } = await response.json();
  assert.equal(JSON.parse(document.notes).audio.key, KEY);
  assert.equal(JSON.parse(document.notes).lyrics, 'Letra');
  assert.equal(api.calls.writes[0].payload.created_by, 'authenticated-user');
  assert.equal(document.file_path, null);
});

test('rechaza formato real inválido y peticiones grandes o de origen ajeno', async () => {
  const api = await harness({ invalidMp3: true });
  assert.equal((await api.saveSong(api.request({ file: true }), CAMP)).status, 400);
  const large = api.request(); large.headers.set('content-length', String(30 * 1024 * 1024));
  assert.equal((await api.saveSong(large, CAMP)).status, 413);
  assert.equal((await api.saveSong(api.request({ origin: 'https://foreign.test' }), CAMP)).status, 403);
  assert.equal(api.calls.puts.length, 0);
});

test('compensa una subida no guardada pero conserva el objeto si la BD confirmó una referencia', async () => {
  const failed = await harness({ saveError: true });
  assert.equal((await failed.saveSong(failed.request({ file: true }), CAMP)).status, 503);
  assert.deepEqual(failed.calls.removed, [KEY]);
  const ambiguous = await harness({ saveError: true, ambiguous: true });
  assert.equal((await ambiguous.saveSong(ambiguous.request({ file: true }), CAMP)).status, 503);
  assert.deepEqual(ambiguous.calls.removed, []);
});

test('editar letras conserva audio migrado y original sin necesitar el binding', async () => {
  const document = { id: SONG, camporee_id: CAMP, document_type: 'song:club', notes: JSON.stringify({ lyrics: 'Anterior', audio: AUDIO }), external_url: null, file_path: `${CAMP}/songs/original.mp3` };
  const api = await harness({ document, missingBucket: true });
  const response = await api.saveSong(api.request({ id: SONG }), CAMP);
  assert.equal(response.status, 200);
  const saved = (await response.json()).document;
  assert.equal(JSON.parse(saved.notes).audio.key, KEY);
  assert.equal(saved.file_path, document.file_path);
  assert.equal(api.calls.puts.length, 0);
});

test('lectura y eliminación usan exclusivamente el documento del camporee autorizado', async () => {
  const document = { id: SONG, notes: JSON.stringify({ audio: AUDIO }) };
  const api = await harness({ document });
  const url = `https://camporee.test/api/music/${CAMP}/${SONG}?organization_id=${ORG}`;
  assert.equal((await api.readSong(new Request(url), CAMP, SONG)).status, 200);
  assert.equal(api.calls.streamed[0].key, KEY);
  assert.equal(api.calls.reads[0].camporee_id, CAMP);
  assert.equal(api.calls.reads[0].document_type, 'song:%');
  assert.equal((await api.deleteSong(new Request(url, { method: 'DELETE', headers: { origin: 'https://camporee.test' } }), CAMP, SONG)).status, 200);
  assert.deepEqual(api.calls.removed, []); // physical cleanup is deferred and reference-aware
});

test('las letras largas se comparan mediante RPC sin incluirlas en filtros URL', async () => {
  const notes = JSON.stringify({ lyrics: 'Una letra extensa '.repeat(2000) });
  const document = { id: SONG, notes, file_path: null, external_url: null };
  const api = await harness({ document });
  assert.equal((await api.saveSong(api.request({ id: SONG, lyrics: 'Versión nueva' }), CAMP)).status, 200);
  assert.equal(api.calls.writes[0].rpc, true);
  assert.equal(api.calls.writes[0].expected.notes, notes);
});
