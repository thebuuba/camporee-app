import test from 'node:test';
import assert from 'node:assert/strict';
import { camporeeFetch } from '../lib/offline-fetch.ts';

const organizationId = '50000000-0000-4000-8000-000000000001';
const camporeeId = '60000000-0000-4000-8000-000000000001';
const ownerId = '10000000-0000-4000-8000-000000000001';
const authorization = `Bearer aa.${Buffer.from(JSON.stringify({ sub: ownerId })).toString('base64url')}.sig`;

function offlineEnvironment(t) {
  const queued = [];
  let opened = 0;
  const request = result => {
    const value = {};
    queueMicrotask(() => { value.result = result; value.onsuccess?.(); });
    return value;
  };
  const db = {
    close() {},
    transaction() {
      const tx = { objectStore: () => ({
        put(item) { queued.push(item); queueMicrotask(() => tx.oncomplete?.()); },
        count: () => request(queued.length),
      }) };
      return tx;
    },
  };
  for (const [key, value] of Object.entries({
    window: { location: { pathname: `/o/${organizationId}/c/${camporeeId}/tasks` }, dispatchEvent() {} },
    navigator: { onLine: false },
    indexedDB: { open() { opened++; return request(db); } },
    fetch: async () => { throw new TypeError('Network unavailable'); },
  })) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, value });
    t.after(() => previous ? Object.defineProperty(globalThis, key, previous) : delete globalThis[key]);
  }
  return { queued, get opened() { return opened; } };
}

function post(path, body) {
  return camporeeFetch(`https://test.supabase.co/rest/v1/${path}`, {
    method: 'POST', headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

test('offline RPC failure never reports a successful registration or queues a function call', async t => {
  const env = offlineEnvironment(t);
  await assert.rejects(post('rpc/register_camporee_push', { target_camporee: camporeeId }), /Network unavailable/);
  assert.equal(env.opened, 0);
  assert.equal(env.queued.length, 0);
});

test('offline bulk attendance returns the same flat row shape as PostgREST', async t => {
  const env = offlineEnvironment(t);
  const rows = [
    { session_id: 'session', participant_id: 'one', present: true },
    { session_id: 'session', participant_id: 'two', present: true },
  ];
  const response = await post('attendance_marks', rows);
  assert.deepEqual(await response.json(), rows);
  assert.equal(env.queued.length, 1);
  assert.deepEqual(JSON.parse(env.queued[0].body), rows);
});

test('a hostname containing the Supabase suffix is not a Supabase offline endpoint', async t => {
  const env = offlineEnvironment(t);
  await assert.rejects(camporeeFetch('https://test.supabase.co.evil.example/rest/v1/tasks', {
    method: 'POST', headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify({ camporee_id: camporeeId, title: 'Task' }),
  }), /Network unavailable/);
  assert.equal(env.opened, 0);
  assert.equal(env.queued.length, 0);
});
