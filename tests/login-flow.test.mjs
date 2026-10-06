import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const { loadBindings, transform } = createRequire(import.meta.url)('next/dist/build/swc');
async function load(path, modules) {
  await loadBindings();
  const { code } = await transform(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'), { filename: path, jsc: { parser: { syntax: 'typescript', tsx: true }, target: 'es2022' }, module: { type: 'commonjs' } });
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => modules[name], URL, fetch: async () => {}, process: { env: {} } });
  return module.exports;
}
async function actions(auth) {
  const cookies = [];
  const exports = await load('app/login/actions.ts', { '@/lib/supabase/server': { createClient: async () => ({ auth }) }, 'next/cache': { revalidatePath() {} }, 'next/navigation': { redirect: url => { throw new Error(url); } }, 'next/headers': { cookies: async () => ({ set: (...value) => cookies.push(value) }), headers: async () => ({ get: () => 'http://localhost:3002' }) } });
  return { ...exports, cookies };
}

test('iniciar sesión guarda la preferencia de duración sin cambiar el acceso', async () => {
  for (const remember of [true, false]) {
    const calls = [];
    const api = await actions({ signInWithPassword: async credentials => { calls.push(credentials); return { data: { session: {} }, error: null }; }, getUser: async () => ({ data: { user: { id: 'person' } } }) });
    const form = new FormData(); form.set('email', ' ANA@example.com '); form.set('password', 'Password123'); if (remember) form.set('remember', 'on');
    await assert.rejects(api.login(form), error => error.message === '/?login=ok');
    assert.equal(calls[0].email, 'ana@example.com');
    assert.equal(api.cookies[0][1], remember ? 'yes' : 'no');
    assert.equal(Boolean(api.cookies[0][2].maxAge), remember);
  }
});

test('recuperar clave valida el correo y usa el callback local sin revelar si existe', async () => {
  const calls = [];
  const api = await actions({ resetPasswordForEmail: async (...args) => { calls.push(args); return { error: null }; } });
  await assert.rejects(api.requestPasswordReset(new FormData()), error => decodeURIComponent(error.message).includes('Escribe tu correo'));
  assert.equal(calls.length, 0);
  const form = new FormData(); form.set('email', 'ana@example.com');
  await assert.rejects(api.requestPasswordReset(form), error => decodeURIComponent(error.message).includes('Si el correo está registrado'));
  assert.equal(calls[0][1].redirectTo, 'http://localhost:3002/auth/confirm?next=recovery');
});

test('cambiar contraseña exige sesión y valida la clave antes de escribir', async () => {
  let writes = 0;
  const api = await actions({ getUser: async () => ({ data: { user: null }, error: null }), updateUser: async () => { writes++; } });
  const form = new FormData(); form.set('password', '123');
  await assert.rejects(api.updatePassword(form), error => decodeURIComponent(error.message).includes('8 caracteres'));
  form.set('password', 'Password123');
  await assert.rejects(api.updatePassword(form), error => decodeURIComponent(error.message).includes('caducado'));
  assert.equal(writes, 0);
});

test('el callback de recuperación abre el formulario y no admite destinos externos', async () => {
  const auth = { exchangeCodeForSession: async () => ({ error: null }) };
  const { GET } = await load('app/auth/confirm/route.ts', { '@/lib/supabase/server': { createClient: async () => ({ auth }) }, 'next/server': { NextResponse: { redirect: url => url.toString() } } });
  for (const [next, destination] of [['recovery', '/login?reset=1'], ['https://other.example', '/']]) {
    const url = `http://localhost:3002/auth/confirm?code=test&next=${encodeURIComponent(next)}`;
    assert.equal(await GET({ url, nextUrl: { clone: () => new URL(url) } }), `http://localhost:3002${destination}`);
  }
});

test('sin Recordarme las cookies Auth son de sesión y el cierre conserva la expiración', async () => {
  const writes = [];
  const { createClient } = await load('lib/supabase/server.ts', {
    '@supabase/ssr': { createServerClient: (_url, _key, options) => options },
    'next/headers': { cookies: async () => ({ getAll: () => [], get: () => ({ value: 'no' }), set: (...value) => writes.push(value) }) },
    '@/lib/supabase/retry-fetch': { withSupabaseRetry: fetch => fetch },
  });
  const adapter = await createClient();
  adapter.cookies.setAll([{ name: 'sb-auth', value: 'token', options: { maxAge: 3600, expires: new Date(), httpOnly: true } }, { name: 'sb-auth', value: '', options: { maxAge: 0 } }]);
  assert.equal(writes[0][2].maxAge, undefined);
  assert.equal(writes[0][2].expires, undefined);
  assert.equal(writes[0][2].httpOnly, true);
  assert.equal(writes[1][2].maxAge, 0);
});
