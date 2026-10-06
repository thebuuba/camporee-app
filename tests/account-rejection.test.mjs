import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const { loadBindings, transform } = createRequire(import.meta.url)('next/dist/build/swc');
async function load(path, modules, globals = {}) {
  await loadBindings();
  const { code } = await transform(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'), {
    filename: path, jsc: { parser: { syntax: 'typescript', tsx: true }, target: 'es2022', transform: { react: { runtime: 'automatic' } } }, module: { type: 'commonjs' },
  });
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => modules[name], console, ...globals });
  return module.exports;
}
function fixture({ admin = true, active = false, failure = false, changed = false } = {}) {
  const writes = [];
  const client = { auth: { getClaims: async () => ({ data: { claims: { sub: 'admin' } } }) }, from(table) {
    let id, payload, onlyPending = false, excludesRejected = false;
    const query = { select() { return this; }, or(value) { excludesRejected = value.includes('access_rejected'); return this; }, eq(key, value) { if (key === 'user_id') id = value; if (key === 'is_active' && value === false) onlyPending = true; return this; }, update(value) { payload = value; return this; }, then(resolve) { return this.maybeSingle().then(resolve); }, async maybeSingle() {
      assert.equal(table, 'app_members');
      if (payload) { writes.push({ id, payload, onlyPending, excludesRejected }); return { data: changed ? null : { user_id: id }, error: failure ? { message: 'failed' } : null }; }
      return { data: id === 'admin' ? { role: admin ? 'admin' : 'viewer', is_active: true } : { role: 'viewer', is_active: active, permissions: { notes: true } }, error: null };
    } };
    return query;
  } };
  return { client, writes };
}
async function actions(client) {
  return load('app/more/users/actions.ts', { '@/lib/supabase/server': { createClient: async () => client }, 'next/cache': { revalidatePath() {} } });
}
test('rechazar conserva la cuenta y solo cambia el acceso del solicitante', async () => {
  const { client, writes } = fixture();
  const { rejectMemberAccess } = await actions(client);
  const form = new FormData(); form.set('userId', 'applicant');
  const result = await rejectMemberAccess(form);
  assert.equal(result.ok, true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].id, 'applicant');
  assert.equal(writes[0].payload.is_active, false);
  assert.equal(writes[0].payload.permissions.access_rejected, true);
  assert.equal(writes[0].payload.permissions.notes, true);
  assert.equal(writes[0].onlyPending, true);
});
for (const [label, options, target] of [['sin permiso', { admin: false }, 'applicant'], ['propia cuenta', {}, 'admin'], ['cuenta activa', { active: true }, 'applicant']]) {
  test(`rechazar protege ${label}`, async () => {
    const { client, writes } = fixture(options);
    const { rejectMemberAccess } = await actions(client);
    const form = new FormData(); form.set('userId', target);
    assert.equal((await rejectMemberAccess(form)).ok, false);
    assert.equal(writes.length, 0);
  });
}
test('si la cuenta se aprueba mientras se rechaza no informa éxito', async () => {
  const { client } = fixture({ changed: true });
  const { rejectMemberAccess } = await actions(client);
  const form = new FormData(); form.set('userId', 'applicant');
  assert.equal((await rejectMemberAccess(form)).ok, false);
});
test('si falla guardar el rechazo no informa éxito', async () => {
  const { client } = fixture({ failure: true });
  const { rejectMemberAccess } = await actions(client);
  const form = new FormData(); form.set('userId', 'applicant');
  assert.equal((await rejectMemberAccess(form)).ok, false);
});
test('una aprobación obsoleta no reactiva una solicitud ya rechazada', async () => {
  const { client, writes } = fixture({ changed: true });
  const { updateMemberAccess } = await actions(client);
  const form = new FormData(); form.set('userId', 'applicant'); form.set('role', 'viewer'); form.set('isActive', 'on'); form.set('approvePending', 'on');
  assert.equal((await updateMemberAccess(form)).ok, false);
  assert.equal(writes[0].onlyPending, true);
  assert.equal(writes[0].excludesRejected, true);
});
test('registrar otra cuenta no sustituye una sesión existente', async () => {
  let registrations = 0;
  const client = { auth: { getClaims: async () => ({ data: { claims: { sub: 'admin' } }, error: null }), signUp: async () => { registrations++; return { data: { session: {} }, error: null }; } } };
  const { signup } = await load('app/login/actions.ts', { '@/lib/supabase/server': { createClient: async () => client }, 'next/cache': { revalidatePath() {} }, 'next/navigation': { redirect: url => { throw new Error(url); } } });
  const form = new FormData(); form.set('fullName', 'Nueva persona'); form.set('email', 'new@example.com'); form.set('password', 'Password123');
  await assert.rejects(signup(form), error => decodeURIComponent(error.message).includes('otro navegador'));
  assert.equal(registrations, 0);
});
test('la cuenta rechazada muestra el aviso y deja de esperar aprobación', async () => {
  const effects = [];
  const jsx = (type, props) => ({ type, props });
  const { default: HomeSetup } = await load('app/home-setup.tsx', {
    react: { useEffect: callback => effects.push(callback), useRef: value => ({ current: value }) },
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/navigation': { useRouter: () => ({}) },
    'lucide-react': { LogOut: 'icon', TentTree: 'icon' }, './setup-form': {},
    '@/lib/supabase/client': { createClient() { throw new Error('No debe consultar si ya está rechazada'); } },
  });
  const tree = HomeSetup({ firstName: 'Ana', isActive: false, isAdmin: false, accessRejected: true });
  assert.match(JSON.stringify(tree), /Tu solicitud de acceso fue rechazada/);
  assert.doesNotMatch(JSON.stringify(tree), /Tu acceso está pendiente/);
  effects.forEach(callback => callback());
});

test('el botón Rechazar no llama a eliminar ni modifica la cuenta del administrador', async () => {
  const values = [], rejected = [], refreshed = [];
  const jsx = (type, props) => ({ type, props });
  const users = [{ user_id: 'admin', is_active: true, is_self: true, role: 'admin', permissions: {}, full_name: 'Admin' }, { user_id: 'applicant', is_active: false, is_self: false, role: 'viewer', permissions: {}, full_name: 'Ana', created_at: '2026-10-05' }];
  const { default: UsersManager } = await load('app/more/users/users-manager.tsx', {
    react: { useEffect() {}, useMemo: callback => callback(), useState: initial => { const index = values.length; values.push(initial); return [initial, value => { values[index] = typeof value === 'function' ? value(values[index]) : value; }]; } },
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/navigation': { useRouter: () => ({ refresh: () => refreshed.push(true) }) },
    'lucide-react': {}, '@/app/components/bottom-sheet': {}, '@/lib/supabase/client': { createClient: () => ({ functions: { invoke() { throw new Error('No debe eliminar'); } } }) },
    './actions': { rejectMemberAccess: async form => { rejected.push(form.get('userId')); return { ok: true }; } },
  }, { window: { confirm: () => true }, FormData });
  const tree = UsersManager({ users, directiveRolesAvailable: false });
  function find(value) {
    if (!value || typeof value !== 'object') return null;
    if (value.type === 'button' && value.props && JSON.stringify(value.props.children).includes('Rechazar')) return value;
    for (const child of Object.values(value)) { const match = find(child); if (match) return match; }
    return null;
  }
  find(tree).props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(rejected, ['applicant']);
  assert.equal(values[0].length, 1);
  assert.equal(values[0][0], users[0]);
  assert.equal(refreshed.length, 1);
});

test('la espera detecta el rechazo y actualiza el mensaje sin cerrar sesión', async () => {
  const effects = [], refreshed = [];
  const jsx = (type, props) => ({ type, props });
  const client = { auth: { getUser: async () => ({ data: { user: { id: 'applicant' } } }) }, from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { is_active: false, permissions: { access_rejected: true } } }) }), channel: () => ({ on() { return this; }, subscribe() { return this; } }) };
  const { default: HomeSetup } = await load('app/home-setup.tsx', {
    react: { useEffect: callback => effects.push(callback), useRef: value => ({ current: value }) }, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/navigation': { useRouter: () => ({ refresh: () => refreshed.push(true) }) },
    'lucide-react': {}, './setup-form': {}, '@/lib/supabase/client': { createClient: () => client },
  }, { window: { addEventListener() {}, setInterval() {} }, document: { addEventListener() {} } });
  HomeSetup({ firstName: 'Ana', isActive: false, isAdmin: false });
  effects.forEach(callback => callback());
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(refreshed.length, 1);
});

test('una persona sin sesión todavía puede registrarse', async () => {
  let registrations = 0;
  const client = { auth: { getClaims: async () => ({ data: null, error: null }), signUp: async () => { registrations++; return { data: { session: null }, error: null }; } } };
  const { signup } = await load('app/login/actions.ts', { '@/lib/supabase/server': { createClient: async () => client }, 'next/cache': { revalidatePath() {} }, 'next/navigation': { redirect: url => { throw new Error(url); } } });
  const form = new FormData(); form.set('fullName', 'Nueva persona'); form.set('email', 'new@example.com'); form.set('password', 'Password123');
  await assert.rejects(signup(form), /\/login\?message=/);
  assert.equal(registrations, 1);
});

test('recargar Usuarios con Auth temporalmente caído no redirige al login', async () => {
  let redirected = false;
  const client = { auth: { getClaims: async () => ({ data: null, error: Object.assign(new Error('Auth unavailable'), { name: 'AuthRetryableFetchError', status: 503 }) }) } };
  const { default: UsersPage } = await load('app/more/users/page.tsx', {
    '@/lib/supabase/server': { createClient: async () => client }, 'next/navigation': { redirect() { redirected = true; throw new Error('login'); } },
    'next/link': {}, 'react/jsx-runtime': {}, 'lucide-react': {}, './users-manager': {},
  });
  await assert.rejects(UsersPage({ searchParams: Promise.resolve({}) }), /Auth unavailable/);
  assert.equal(redirected, false);
});
