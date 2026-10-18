import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { TenantAccessError } from '../lib/tenant-context.ts';

const camp = '60000000-0000-4000-8000-000000000001';
const prefix = `camporee-app/${camp}/songs/`;
const oldKey = `${prefix}${'a'.repeat(64)}.mp3`;
const now = new Date('2026-10-17T15:00:00Z');
const old = new Date('2026-10-10T15:00:00Z');
async function fixture() {
  const { cleanupMusicObjects } = await import('../lib/r2-cleanup.ts');
  const deleted = [];
  const requested = [];
  const bucket = {
    async list(options) {
      requested.push(options);
      return { objects: [
        { key: oldKey, uploaded: old },
        { key: `${prefix}${'b'.repeat(64)}.mp3`, uploaded: now },
        { key: `other-project/${'c'.repeat(64)}.mp3`, uploaded: old },
        { key: `${prefix}../outside.mp3`, uploaded: old },
      ], truncated: false };
    },
    async delete(key) { deleted.push(key); },
  };
  return { cleanupMusicObjects, bucket, deleted, requested };
}

test('la limpieza es dry-run y excluye recientes y objetos fuera de Camporee', async () => {
  const f = await fixture();
  const result = await f.cleanupMusicObjects(f.bucket, camp, async () => new Set(), { now });
  assert.deepEqual(result.candidates, [oldKey]);
  assert.deepEqual(f.deleted, []);
  assert.equal(f.requested[0].prefix, prefix);
});

test('solo elimina huérfanos antiguos y vuelve a comprobar referencias antes de borrar', async () => {
  const f = await fixture();
  let reads = 0;
  await f.cleanupMusicObjects(f.bucket, camp, async () => ++reads === 1 ? new Set() : new Set([oldKey]), { now, apply: true });
  assert.deepEqual(f.deleted, []);
  const applied = await f.cleanupMusicObjects(f.bucket, camp, async () => new Set(), { now, apply: true });
  assert.deepEqual(applied.deleted, [oldKey]);
  assert.deepEqual(f.deleted, [oldKey]);
});

test('un fallo al consultar referencias impide el borrado', async () => {
  const f = await fixture();
  await assert.rejects(f.cleanupMusicObjects(f.bucket, camp, async () => { throw Error('DB offline'); }, { now, apply: true }), /DB offline/);
  assert.deepEqual(f.deleted, []);
});

test('la ruta de limpieza exige mismo origen y permiso settings antes de acceder a R2', async () => {
  const { loadBindings, transform } = createRequire(import.meta.url)('next/dist/build/swc');
  await loadBindings();
  const filename = 'app/api/music/[camporeeId]/cleanup/route.ts';
  const { code } = await transform(await readFile(filename, 'utf8'), {
    filename, jsc: { parser: { syntax: 'typescript' }, target: 'es2022' }, module: { type: 'commonjs' },
  });
  let mode = 'read-only', storageAccess = 0;
  const modules = {
    '@opennextjs/cloudflare': { async getCloudflareContext() { storageAccess++; throw Error('Must not access bucket'); } },
    '@/lib/supabase/server': { async createClient() { return {}; } },
    '@/lib/tenant-context': { TenantAccessError, async resolveCamporeeContext() {
      if (mode === 'unauthenticated') throw new TenantAccessError('authentication');
      return { canEdit() { return false; } };
    } },
    '@/lib/r2-cleanup': await import('../lib/r2-cleanup.ts'),
  };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, Request, Response, URL, console, require: name => modules[name] });
  const url = `https://camporee.test/api/music/${camp}/cleanup?organization_id=50000000-0000-4000-8000-000000000001&apply=true`;
  const invoke = origin => module.exports.POST(new Request(url, { method: 'POST', headers: { origin } }), { params: Promise.resolve({ camporeeId: camp }) });
  assert.equal((await invoke('https://foreign.test')).status, 403);
  assert.equal((await invoke('https://camporee.test')).status, 403);
  mode = 'unauthenticated';
  assert.equal((await invoke('https://camporee.test')).status, 401);
  assert.equal(storageAccess, 0);
});
