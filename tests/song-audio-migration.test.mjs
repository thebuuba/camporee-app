import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { promises as fsp } from 'node:fs';
import {
  BUNDLED_SONGS, CONTENT_TYPE, createManifestStore, mergeAudioIntoNotes,
  musicObjectKey, assertMusicKey, parseR2Audio, runBundledMigration, runCleanup,
  runMigration, runRollback, sha256Hex, validateMp3,
} from '../scripts/song-audio-migration.mjs';

const CAMP = '11111111-1111-1111-1111-111111111111';
const CAMP2 = '22222222-2222-2222-2222-222222222222';
const USER = '33333333-3333-3333-3333-333333333333';
const ACCOUNT = 'fbfe781a453c090425c8bfe52d9e96a6';
const BUCKET = 'camporee-app-music';

function mp3(fill = 0x11) {
  const bytes = new Uint8Array(834).fill(fill);
  for (const offset of [0, 417]) bytes.set([0xff, 0xfb, 0x90, 0x00], offset);
  return bytes;
}

function id3Only() {
  const bytes = new Uint8Array(32);
  bytes[0] = 0x49; bytes[1] = 0x44; bytes[2] = 0x33; // "ID3"
  bytes[3] = 0x03; bytes[4] = 0x00; bytes[5] = 0x00;
  bytes.fill(0x00, 10);
  return bytes; // no MPEG frame anywhere
}

async function tempStore() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'r2-mig-'));
  return { dir, store: createManifestStore(dir) };
}

function songDoc(overrides = {}) {
  return {
    id: 'doc-1', camporee_id: CAMP, title: 'Audio del club',
    document_type: 'song:club',
    notes: JSON.stringify({ lyrics: 'Letra', chords: 'Do' }),
    file_path: `${CAMP}/songs/original.mp3`,
    external_url: null,
    ...overrides,
  };
}

function createRepo(initial = []) {
  const state = initial.map(row => ({ ...row }));
  const calls = { downloads: [], updates: [] };
  let concurrent = null;
  return {
    state, calls,
    setConcurrent(next) { concurrent = next; },
    async listSongFileDocuments({ camporeeId } = {}) {
      return state.filter(row => row.document_type?.startsWith('song:') && row.file_path
        && /\.mp3$/i.test(row.file_path) && (!camporeeId || row.camporee_id === camporeeId));
    },
    async listSongDocuments({ camporeeId } = {}) {
      return state.filter(row => row.document_type?.startsWith('song:') && (!camporeeId || row.camporee_id === camporeeId));
    },
    async listReferencingDocuments({ camporeeIds = [] } = {}) {
      return state.filter(row => camporeeIds.includes(row.camporee_id));
    },
    async getDocument(id) { return state.find(row => row.id === id) ?? null; },
    async updateDocumentNotes({ id, previousNotes, nextNotes }) {
      calls.updates.push({ id, previousNotes, nextNotes });
      const doc = state.find(row => row.id === id);
      if (!doc) return { applied: false, currentNotes: null };
      if (concurrent?.id === id) doc.notes = concurrent.notes;
      if ((doc.notes ?? null) !== (previousNotes ?? null)) return { applied: false, currentNotes: doc.notes ?? null };
      doc.notes = nextNotes;
      return { applied: true, currentNotes: nextNotes };
    },
    async insertDocument(payload) {
      const row = { id: payload.id ?? `doc-${state.length + 1}`, ...payload };
      state.push(row);
      return row;
    },
    async deleteDocument({ id, expectedNotes }) {
      const index = state.findIndex(row => row.id === id);
      if (index < 0) return { applied: false };
      if ((state[index].notes ?? null) !== (expectedNotes ?? null)) return { applied: false };
      state.splice(index, 1);
      return { applied: true };
    },
    async downloadFile(filePath) { calls.downloads.push(filePath); return mp3(); },
  };
}

function createR2({ failPut = false, corruptVerify = false, objects = new Map() } = {}) {
  const calls = { put: [], get: [], delete: [] };
  return {
    objects, calls,
    async putObject(key, bytes) {
      calls.put.push(key);
      if (failPut) throw new Error('simulated upload failure');
      objects.set(key, bytes);
    },
    async getObject(key) {
      calls.get.push(key);
      if (!objects.has(key)) return null;
      const stored = objects.get(key);
      return corruptVerify ? new Uint8Array(stored.length).fill(0) : stored;
    },
    async deleteObject(key) { calls.delete.push(key); objects.delete(key); },
  };
}

async function migrateOnce({ repo, r2, store, dryRun = false, now = () => new Date('2026-10-17T00:00:00Z') } = {}) {
  return runMigration({ repo, r2, manifests: store, accountId: ACCOUNT, bucket: BUCKET, dryRun, now });
}

// ---------- library contract ----------

test('validateMp3 accepts a real MPEG frame and rejects ID3-only files', () => {
  const valid = validateMp3(mp3());
  assert.equal(valid.contentType, CONTENT_TYPE);
  assert.equal(valid.size, 834);
  assert.equal(valid.sha256, sha256Hex(mp3()));
  assert.throws(() => validateMp3(id3Only()), /real MP3/i);
  assert.throws(() => validateMp3(new Uint8Array(0)), /empty/i);
  assert.throws(() => validateMp3(new Uint8Array(new Uint8Array(15 * 1024 * 1024 + 1))), /15 MB/);
});

test('musicObjectKey is deterministic and assertMusicKey rejects foreign or traversal keys', () => {
  const sha = sha256Hex(mp3());
  assert.equal(musicObjectKey(CAMP, sha), `camporee-app/${CAMP}/songs/${sha}.mp3`);
  assert.deepEqual(assertMusicKey(musicObjectKey(CAMP, USER), CAMP), { camporeeId: CAMP, id: USER });
  assert.throws(() => assertMusicKey(musicObjectKey(CAMP2, sha), CAMP), /does not match/);
  assert.throws(() => assertMusicKey(`camporee-app/${CAMP}/songs/../secret.mp3`, CAMP), /invalid/i);
  assert.throws(() => assertMusicKey(`other/${CAMP}/songs/${sha}.mp3`, CAMP), /must be/i);
});

test('parseR2Audio round-trips valid metadata and rejects malformed values', () => {
  const sha = sha256Hex(mp3());
  const notes = mergeAudioIntoNotes(JSON.stringify({ lyrics: 'x' }), { provider: 'r2', key: musicObjectKey(CAMP, sha), size: 64, contentType: CONTENT_TYPE, sha256: sha });
  const parsed = parseR2Audio(notes);
  assert.equal(parsed.key, musicObjectKey(CAMP, sha));
  assert.equal(parsed.sha256, sha);
  assert.equal(parseR2Audio('not json'), null);
  assert.equal(parseR2Audio(JSON.stringify({ audio: { provider: 'r2', key: 'x', size: 64, contentType: CONTENT_TYPE, sha256: sha } })), null);
  assert.equal(parseR2Audio(JSON.stringify({ audio: { provider: 'r2', key: musicObjectKey(CAMP, sha), size: -1, contentType: CONTENT_TYPE, sha256: sha } })), null);
});

// ---------- migration behavior ----------

test('dry-run inventories candidates without downloading, uploading or writing', async () => {
  const repo = createRepo([songDoc()]);
  const r2 = createR2();
  const { store } = await tempStore();
  const result = await migrateOnce({ repo, r2, store, dryRun: true });
  assert.equal(result.totals.planned, 1);
  assert.equal(repo.calls.downloads.length, 0);
  assert.equal(repo.calls.updates.length, 0);
  assert.equal(r2.calls.put.length, 0);
  assert.equal(result.manifestPath, null);
});

test('apply verifies the object before updating notes and preserves unrelated fields', async () => {
  const repo = createRepo([songDoc()]);
  const r2 = createR2();
  const { store } = await tempStore();
  const result = await migrateOnce({ repo, r2, store });
  const entry = result.entries[0];
  const sha = sha256Hex(mp3());
  assert.equal(entry.status, 'applied');
  assert.equal(entry.key, musicObjectKey(CAMP, sha));
  assert.equal(result.totals.applied, 1);
  assert.ok(r2.calls.put.length === 1 && r2.calls.get.length >= 1);
  const stored = repo.state[0];
  assert.equal(stored.file_path, `${CAMP}/songs/original.mp3`);
  assert.equal(stored.external_url, null);
  const notes = JSON.parse(stored.notes);
  assert.equal(notes.lyrics, 'Letra');
  assert.equal(notes.chords, 'Do');
  assert.equal(notes.audio.provider, 'r2');
  assert.equal(notes.audio.sha256, sha);
  const names = await store.list();
  assert.equal(names.length, 1);
});

test('re-running apply is idempotent and skips verified R2 metadata', async () => {
  const repo = createRepo([songDoc()]);
  const r2 = createR2();
  const { store } = await tempStore();
  await migrateOnce({ repo, r2, store });
  const putsAfterFirst = r2.calls.put.length;
  const updatesAfterFirst = repo.calls.updates.length;
  const second = await migrateOnce({ repo, r2, store });
  assert.equal(second.entries[0].status, 'already-verified');
  assert.equal(second.totals.skippedExisting, 1);
  assert.equal(r2.calls.put.length, putsAfterFirst);
  assert.equal(repo.calls.updates.length, updatesAfterFirst);
});

test('an upload failure leaves the original document and a recoverable manifest', async () => {
  const repo = createRepo([songDoc()]);
  const r2 = createR2({ failPut: true });
  const { store } = await tempStore();
  const result = await migrateOnce({ repo, r2, store });
  assert.equal(result.entries[0].status, 'failed');
  assert.equal(repo.calls.updates.length, 0);
  assert.equal(JSON.parse(repo.state[0].notes).audio, undefined);
  assert.equal(repo.state[0].file_path, `${CAMP}/songs/original.mp3`);
  const [name] = await store.list();
  const manifest = await store.read(name);
  assert.equal(manifest.entries[0].status, 'failed');
  assert.match(manifest.entries[0].error, /upload failure/);
});

test('a destination verification mismatch fails without touching the database', async () => {
  const repo = createRepo([songDoc()]);
  const r2 = createR2({ corruptVerify: true });
  const { store } = await tempStore();
  const result = await migrateOnce({ repo, r2, store });
  assert.equal(result.entries[0].status, 'failed');
  assert.match(result.entries[0].error, /verification failed/);
  assert.equal(repo.calls.updates.length, 0);
  assert.equal(JSON.parse(repo.state[0].notes).audio, undefined);
});

test('a concurrent notes edit is never overwritten', async () => {
  const repo = createRepo([songDoc()]);
  repo.setConcurrent({ id: 'doc-1', notes: JSON.stringify({ lyrics: 'Editado en paralelo', chords: '' }) });
  const r2 = createR2();
  const { store } = await tempStore();
  const result = await migrateOnce({ repo, r2, store });
  assert.equal(result.entries[0].status, 'skipped-concurrent');
  assert.equal(result.totals.concurrent, 1);
  assert.equal(JSON.parse(repo.state[0].notes).lyrics, 'Editado en paralelo');
  assert.equal(JSON.parse(repo.state[0].notes).audio, undefined);
  assert.equal(r2.calls.put.length, 1); // object uploaded but recorded for cleanup
});

// ---------- rollback ----------

test('rollback restores the original notes, keeps the object and never deletes sources', async () => {
  const repo = createRepo([songDoc()]);
  const r2 = createR2();
  const { store } = await tempStore();
  await migrateOnce({ repo, r2, store });
  const [name] = await store.list();
  const manifestPath = path.join(store.dir, name);
  const result = await runRollback({ repo, manifests: store, manifestPath, apply: true });
  assert.equal(result.totals.rolledBack, 1);
  assert.equal(repo.state[0].notes, JSON.stringify({ lyrics: 'Letra', chords: 'Do' }));
  assert.equal(r2.calls.delete.length, 0);
  const manifest = await store.readPath(manifestPath);
  assert.equal(manifest.entries[0].rollbackStatus, 'rolled-back');
  assert.equal(manifest.entries[0].protected, true);
});

test('rollback reports a conflict when the document changed after migration', async () => {
  const repo = createRepo([songDoc()]);
  const r2 = createR2();
  const { store } = await tempStore();
  await migrateOnce({ repo, r2, store });
  const [name] = await store.list();
  const manifestPath = path.join(store.dir, name);
  repo.state[0].notes = JSON.stringify({ lyrics: 'Cambiado luego', chords: '' });
  const result = await runRollback({ repo, manifests: store, manifestPath, apply: true });
  assert.equal(result.totals.conflicts, 1);
  assert.equal(JSON.parse(repo.state[0].notes).lyrics, 'Cambiado luego');
  assert.equal(JSON.parse(repo.state[0].notes).audio, undefined);
  assert.equal(r2.calls.delete.length, 0);
});

// ---------- cleanup ----------

function cleanupEntry(overrides = {}) {
  const sha = sha256Hex(mp3());
  return {
    id: 'doc-1', camporeeId: CAMP, key: musicObjectKey(CAMP, sha), sha256: sha,
    status: 'applied', protected: false, createdAt: new Date('2026-10-15T00:00:00Z').toISOString(),
    ...overrides,
  };
}

async function writeCleanupManifest(store, entry) {
  await store.write('manifest-2026-10-15T00-00-00-000Z-cleanup.json', {
    version: 1, mode: 'migrate', accountId: ACCOUNT, bucket: BUCKET,
    createdAt: entry.createdAt, entries: [entry],
  });
}

test('cleanup refuses keys outside our own prefix', async () => {
  const { store } = await tempStore();
  await writeCleanupManifest(store, cleanupEntry({ key: `other-project/${CAMP}/songs/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.mp3` }));
  const r2 = createR2();
  r2.objects.set(cleanupEntry().key, mp3());
  const result = await runCleanup({ repo: createRepo(), r2, manifests: store, apply: true, now: () => new Date('2026-10-18T00:00:00Z') });
  assert.equal(result.totals.foreignPrefix, 1);
  assert.equal(result.totals.deleted, 0);
  assert.equal(r2.calls.delete.length, 0);
});

test('cleanup skips objects still referenced by any document', async () => {
  const entry = cleanupEntry();
  const { store } = await tempStore();
  await writeCleanupManifest(store, entry);
  const referencing = songDoc({ id: 'other', notes: JSON.stringify({ audio: { provider: 'r2', key: entry.key, size: 64, contentType: CONTENT_TYPE, sha256: entry.sha256 } }) });
  const r2 = createR2();
  r2.objects.set(entry.key, mp3());
  const result = await runCleanup({ repo: createRepo([referencing]), r2, manifests: store, apply: true, now: () => new Date('2026-10-18T00:00:00Z') });
  assert.equal(result.totals.referenced, 1);
  assert.equal(r2.calls.delete.length, 0);
});

test('cleanup also protects references inside incomplete audio metadata', async () => {
  const entry = cleanupEntry();
  const { store } = await tempStore();
  await writeCleanupManifest(store, entry);
  const repo = createRepo([songDoc({ notes: JSON.stringify({ audio: { key: entry.key } }).replaceAll('/', String.fromCharCode(92) + '/') })]);
  const r2 = createR2();
  const result = await runCleanup({ repo, r2, manifests: store, apply: true, now: () => new Date('2026-10-20T00:00:00Z') });
  assert.equal(result.totals.referenced, 1);
  assert.equal(r2.calls.delete.length, 0);
});

test('rollback reconciles a committed update whose applied acknowledgement was lost', async () => {
  const repo = createRepo([songDoc()]);
  const r2 = createR2();
  const { store } = await tempStore();
  await migrateOnce({ repo, r2, store });
  const [name] = await store.list();
  const manifest = await store.read(name);
  manifest.entries[0].status = 'verified';
  await store.write(name, manifest);
  const result = await runRollback({ repo, manifests: store, manifestPath: path.join(store.dir, name), apply: true });
  assert.equal(result.totals.rolledBack, 1);
  assert.equal(repo.state[0].notes, songDoc().notes);
  assert.equal(r2.calls.delete.length, 0);
});

test('cleanup honors the 48h grace period and deletes only the exact object after it', async () => {
  const recent = cleanupEntry({ createdAt: new Date('2026-10-17T12:00:00Z').toISOString() });
  const { store } = await tempStore();
  await writeCleanupManifest(store, recent);
  const r2 = createR2();
  r2.objects.set(recent.key, mp3());
  const before = await runCleanup({ repo: createRepo(), r2, manifests: store, apply: true, now: () => new Date('2026-10-18T00:00:00Z') });
  assert.equal(before.totals.grace, 1);
  assert.equal(r2.calls.delete.length, 0);
  await assert.rejects(runCleanup({ repo: createRepo(), r2, manifests: store, apply: true, now: () => new Date('2026-10-20T00:00:00Z') }), /actual R2 upload timestamp/);
  const after = await runCleanup({ repo: createRepo(), r2, manifests: store, now: () => new Date('2026-10-20T00:00:00Z') });
  assert.equal(after.totals.wouldDelete, 1);
  assert.deepEqual(r2.calls.delete, []);
  assert.equal(r2.objects.has(recent.key), true);
});

test('cleanup never removes objects protected by rollback', async () => {
  const entry = cleanupEntry({ protected: true });
  const { store } = await tempStore();
  await writeCleanupManifest(store, entry);
  const r2 = createR2();
  r2.objects.set(entry.key, mp3());
  const result = await runCleanup({ repo: createRepo(), r2, manifests: store, apply: true, now: () => new Date('2026-10-20T00:00:00Z') });
  assert.equal(result.totals.protected, 1);
  assert.equal(r2.calls.delete.length, 0);
});

// ---------- bundled seeding ----------

test('bundled seeding is dry-run by default, then idempotent by normalized title', async () => {
  const files = [{ path: 'public/audio/maranata.mp3', title: 'Maranata', category: 'club' }, { path: 'public/audio/contracorriente.mp3', title: 'Contracorriente', category: 'club' }];
  const readFile = async file => mp3(file.length * 7);
  const { store } = await tempStore();
  const repo = createRepo();
  const r2 = createR2();
  const preview = await runBundledMigration({
    repo, r2, manifests: store, readFile, files, camporeeId: CAMP, createdBy: USER,
    accountId: ACCOUNT, bucket: BUCKET, dryRun: true,
  });
  assert.equal(preview.totals.planned, 2);
  assert.equal(repo.state.length, 0);

  const applied = await runBundledMigration({
    repo, r2, manifests: store, readFile, files, camporeeId: CAMP, createdBy: USER,
    accountId: ACCOUNT, bucket: BUCKET, dryRun: false,
  });
  assert.equal(applied.totals.applied, 2);
  assert.equal(repo.state.length, 2);
  assert.equal(repo.state[0].document_type, 'song:club');
  assert.equal(repo.state[0].file_path, null);
  assert.equal(repo.state[0].external_url, '/audio/maranata.mp3');
  assert.equal(parseR2Audio(repo.state[0].notes).provider, 'r2');

  const again = await runBundledMigration({
    repo, r2, manifests: store, readFile, files: [files[0]], camporeeId: CAMP, createdBy: USER,
    accountId: ACCOUNT, bucket: BUCKET, dryRun: false,
  });
  assert.equal(again.totals.duplicate, 1);
  assert.equal(repo.state.length, 2);
});

test('bundled rollback preserves the document id and restores local audio', async () => {
  const files = [{ path: 'public/audio/maranata.mp3', title: 'Maranata', category: 'club' }];
  const readFile = async () => mp3();
  const { store } = await tempStore();
  const repo = createRepo();
  const r2 = createR2();
  const applied = await runBundledMigration({
    repo, r2, manifests: store, readFile, files, camporeeId: CAMP, createdBy: USER,
    accountId: ACCOUNT, bucket: BUCKET, dryRun: false,
  });
  const objectKey = applied.entries[0].key;
  const [name] = await store.list();
  const result = await runRollback({ repo, manifests: store, manifestPath: path.join(store.dir, name), apply: true });
  assert.equal(result.totals.rolledBack, 1);
  assert.equal(repo.state.length, 1);
  assert.equal(repo.state[0].external_url, '/audio/maranata.mp3');
  assert.equal(parseR2Audio(repo.state[0].notes), null);
  assert.equal(r2.calls.delete.length, 0);
  assert.equal(r2.objects.has(objectKey), true);
});

test('bundled rollback can reconcile an insert whose response was lost', async () => {
  const { store } = await tempStore();
  const repo = createRepo();
  const originalInsert = repo.insertDocument.bind(repo);
  repo.insertDocument = async payload => { await originalInsert(payload); throw Error('response lost'); };
  const r2 = createR2();
  await runBundledMigration({ repo, r2, manifests: store, readFile: async () => mp3(), files: [BUNDLED_SONGS[0]], camporeeId: CAMP, createdBy: USER, accountId: ACCOUNT, bucket: BUCKET, dryRun: false });
  const [name] = await store.list();
  const recovered = await runRollback({ repo, manifests: store, manifestPath: path.join(store.dir, name), apply: true });
  assert.equal(recovered.totals.rolledBack, 1);
  assert.equal(repo.state.length, 1);
  assert.equal(parseR2Audio(repo.state[0].notes), null);
  assert.equal(repo.state[0].external_url, '/audio/maranata.mp3');
});

// ---------- SSRF and source scoping ----------

test('only validated storage paths are downloaded; external_url is never fetched', async () => {
  const valid = songDoc({ id: 'ok' });
  const malicious = songDoc({ id: 'evil', file_path: 'http://169.254.169.254/latest/meta-data.mp3', external_url: 'http://evil.example/audio.mp3' });
  const repo = createRepo([valid, malicious]);
  const r2 = createR2();
  const { store } = await tempStore();
  const result = await migrateOnce({ repo, r2, store });
  assert.deepEqual(repo.calls.downloads, [`${CAMP}/songs/original.mp3`]);
  assert.equal(result.totals.notMigratable, 1);
  assert.equal(result.totals.applied, 1);
  assert.ok(!repo.calls.downloads.includes('http://169.254.169.254/latest/meta-data.mp3'));
});

test('BUNDLED_SONGS keeps the two documented local starter titles', () => {
  assert.deepEqual(BUNDLED_SONGS.map(song => song.title).sort(), ['Contracorriente', 'Maranata']);
});
