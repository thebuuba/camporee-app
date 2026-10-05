import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.indexedDB = undefined;

// Node has no IndexedDB. Model its async requests and atomic commit boundary.
function memoryIndexedDB({ failWrite = false, failAfterSuccess = false, failOpen = false } = {}) {
  const rows = new Map();
  let initialized = false, closed = 0;
  return {
    get closed() { return closed; },
    open(name, version) {
      assert.equal(name, 'camporee-music');
      assert.equal(version, 1);
      const request = {};
      queueMicrotask(() => {
        if (failOpen) {
          request.error = new DOMException('Denied', 'SecurityError');
          request.onerror?.();
          return;
        }
        request.result = {
          objectStoreNames: { contains: name => initialized && name === 'tracks' },
          createObjectStore(name, options) {
            assert.equal(name, 'tracks'); assert.equal(options.keyPath, 'key'); initialized = true;
          },
          close() { closed++; },
          transaction(name, mode) {
            assert.equal(name, 'tracks');
            const transaction = { error: null };
            transaction.objectStore = () => {
              const run = operation => {
                const result = {};
                queueMicrotask(() => {
                  if (failWrite && mode === 'readwrite') {
                    transaction.error = new DOMException('Full', 'QuotaExceededError');
                    transaction.onabort?.();
                    return;
                  }
                  const before = new Map(rows);
                  result.result = operation();
                  result.onsuccess?.();
                  queueMicrotask(() => {
                    if (failAfterSuccess && mode === 'readwrite') {
                      rows.clear(); for (const [key, value] of before) rows.set(key, value);
                      transaction.error = new DOMException('Full at commit', 'QuotaExceededError');
                      transaction.onabort?.();
                    } else transaction.oncomplete?.();
                  });
                });
                return result;
              };
              return {
                put: row => run(() => { rows.set(row.key, structuredClone(row)); return row.key; }),
                getAll: () => run(() => structuredClone([...rows.values()])),
                delete: key => run(() => rows.delete(key)),
              };
            };
            return transaction;
          },
        };
        if (!initialized) request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    },
  };
}

const song = { id: 'one', title: 'Marcha', category: 'club', lyrics: 'Letra', chords: 'Do', audioUrl: 'https://example.com/audio.mp3', stored: true };
async function library() { return import('../lib/song-downloads.ts'); }

test('descargas conservan audio y metadatos, reemplazan la misma fuente y aíslan la cuenta y camporee', async t => {
  const db = memoryIndexedDB(); t.mock.property(globalThis, 'indexedDB', db);
  const { saveDownloadedSong, listDownloadedSongs, removeDownloadedSong, songSourceKey } = await library();
  const uploaded = { ...song, filePath: 'club/marcha.mp3', audioUrl: 'https://example.com/signed?token=first' };
  assert.equal(songSourceKey(uploaded), 'club/marcha.mp3');
  assert.equal(songSourceKey(song), 'https://example.com/audio.mp3');
  const saved = await saveDownloadedSong('user-a:camp-a', uploaded, new Blob(['audio'], { type: 'audio/mpeg' }));
  assert.equal(saved.key, 'user-a:camp-a:club/marcha.mp3');
  assert.equal(saved.bytes, 5); assert.ok(saved.createdAt > 0);
  await saveDownloadedSong('user-a:camp-a', { ...uploaded, audioUrl: 'https://example.com/signed?token=next' }, new Blob(['replaced']));
  await saveDownloadedSong('user-b:camp-a', uploaded, new Blob(['private']));
  await saveDownloadedSong('user-a:camp-b', uploaded, new Blob(['other event']));
  const own = await listDownloadedSongs('user-a:camp-a');
  assert.equal(own.length, 1); assert.equal(await own[0].blob.text(), 'replaced');
  assert.equal(own[0].song.lyrics, 'Letra'); assert.equal(own[0].bytes, 8);
  await removeDownloadedSong('user-a:camp-a', uploaded);
  assert.deepEqual(await listDownloadedSongs('user-a:camp-a'), []);
  assert.equal((await listDownloadedSongs('user-b:camp-a')).length, 1);
  assert.equal(db.closed, 8);
});

test('un aborto por cuota rechaza la descarga y cierra la conexión', async t => {
  const db = memoryIndexedDB({ failWrite: true }); t.mock.property(globalThis, 'indexedDB', db);
  const { saveDownloadedSong, listDownloadedSongs } = await library();
  await assert.rejects(saveDownloadedSong('user:camp', song, new Blob(['audio'])), { name: 'QuotaExceededError' });
  assert.deepEqual(await listDownloadedSongs('user:camp'), []);
  assert.equal(db.closed, 2);
});

test('un error al abrir IndexedDB se propaga sin afirmar que se guardó', async t => {
  t.mock.property(globalThis, 'indexedDB', memoryIndexedDB({ failOpen: true }));
  const { listDownloadedSongs } = await library();
  await assert.rejects(listDownloadedSongs('user:camp'), { name: 'SecurityError' });
});

test('una escritura exitosa seguida de aborto no se anuncia como descarga terminada', async t => {
  const db = memoryIndexedDB({ failAfterSuccess: true }); t.mock.property(globalThis, 'indexedDB', db);
  const { saveDownloadedSong, listDownloadedSongs } = await library();
  await assert.rejects(saveDownloadedSong('user:camp', song, new Blob(['audio'])), { name: 'QuotaExceededError' });
  assert.deepEqual(await listDownloadedSongs('user:camp'), []);
  assert.equal(db.closed, 2);
});

test('un navegador sin IndexedDB devuelve un mensaje en español', async t => {
  t.mock.property(globalThis, 'indexedDB', undefined);
  const { listDownloadedSongs } = await library();
  await assert.rejects(listDownloadedSongs('user:camp'), /navegador.*descargas/i);
});
