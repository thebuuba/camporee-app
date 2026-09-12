import test from 'node:test';
import assert from 'node:assert/strict';
import { withSupabaseRetry } from '../lib/supabase/retry-fetch.ts';

test('una lectura se recupera de un timeout 544 transitorio', async () => {
  let attempts = 0;
  const request = withSupabaseRetry(async () => {
    attempts += 1;
    if (attempts === 1) return new Response('gateway timeout', { status: 544 });
    return new Response(JSON.stringify([{ id: 'camporee-1' }]), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });

  const response = await request('https://camporee.test/rest/v1/camporees', { method: 'GET' });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [{ id: 'camporee-1' }]);
  assert.equal(attempts, 2);
});

test('reintenta lecturas HEAD sin repetir escrituras POST', async () => {
  const attempts = { HEAD: 0, POST: 0 };
  const request = withSupabaseRetry(async (_input, init) => {
    const method = init.method;
    attempts[method] += 1;
    return new Response('gateway timeout', { status: 544 });
  });

  await request('https://camporee.test/rest/v1/participants', { method: 'HEAD' });
  await request('https://camporee.test/rest/v1/participants', { method: 'POST', body: '{}' });

  assert.deepEqual(attempts, { HEAD: 3, POST: 1 });
});
