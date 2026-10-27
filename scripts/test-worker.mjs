// Run against wrangler dev or a preview; never writes data or signs in.
import assert from 'node:assert/strict';
import { setTimeout as pause } from 'node:timers/promises';

const base = new URL(process.argv[2] || 'http://127.0.0.1:8787');
const deadline = Date.now() + 60_000;
let ready = false;
while (Date.now() < deadline) {
  try { await fetch(new URL('/login', base), { signal:AbortSignal.timeout(3000) }); ready = true; break; }
  catch { await pause(500); }
}
assert.ok(ready, 'Worker did not start within 60 seconds');
for (const path of ['/login', '/signup', '/']) {
  const response = await fetch(new URL(path, base), { signal:AbortSignal.timeout(15_000) });
  assert.equal(response.status, 200, `${path} returned ${response.status}; a successful build alone does not validate Workers runtime`);
  const body = await response.text();
  assert.ok(body.includes('<html') && /Camporee|Iniciar|cuenta/i.test(body), `${path} did not render the application`);
  assert.ok(body.includes('name="email"') && body.includes('name="password"'), `${path} did not render the expected authentication form`);
  assert.ok(!body.includes('Unexpected loadManifest('), `${path} failed to inline a Next manifest`);
  console.log(`OK ${path}: rendered in Workers runtime`);
}
