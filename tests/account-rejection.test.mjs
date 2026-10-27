import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { safeAuthReturn, isTenantId, resolveOrganizationContext } from '../lib/tenant-context.ts';
const { loadBindings, transform } = createRequire(import.meta.url)('next/dist/build/swc');
async function load(path, modules, globals = {}) {
  modules['@/lib/tenant-context'] = { safeAuthReturn, isTenantId };
  modules['next/headers'] ??= {headers:async()=>({get:()=>null})};
  await loadBindings();
  const { code } = await transform(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'), {
    filename: path, jsc: { parser: { syntax: 'typescript', tsx: true }, target: 'es2022', transform: { react: { runtime: 'automatic' } } }, module: { type: 'commonjs' },
  });
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => modules[name], console, process:{env:{}}, URL, ...globals });
  return module.exports;
}
const org='50000000-0000-4000-8000-000000000001';
const applicant='10000000-0000-4000-8000-000000000003';
async function actions({error=null,user={id:'admin'}}={}) {
 const calls=[];
 const client={auth:{getUser:async()=>({data:{user},error:null})},from(){throw new Error('Global membership forbidden');},rpc:async(name,args)=>{calls.push({name,args});return {error};}};
 const api=await load('app/more/users/actions.ts',{'@/lib/supabase/server':{createClient:async()=>client},'next/cache':{revalidatePath(){}}});
 return {...api,calls};
}
function memberForm(){const form=new FormData();form.set('organizationId',org);form.set('userId',applicant);return form;}

async function organizationStatus(membership) {
 const jsx=(type,props)=>({type,props});
 const client={auth:{getUser:async()=>({data:{user:{id:applicant}},error:null})},from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:membership,error:null})})};
 const {default:Page}=await load('app/organizations/page.tsx',{
  '@/lib/supabase/server':{createClient:async()=>client},'@/lib/tenant-schema':{isTenantSchemaUnavailable:()=>false},
  'react/jsx-runtime':{jsx,jsxs:jsx},'next/navigation':{redirect:url=>{throw new Error(url)}},'next/link':{default:'link'},
  './organization-form':{default:'form'},'@/app/components/safe-signout-form':{default:'signout'},
 });
 return Page();
}

test('rechazar conserva la cuenta y envía una decisión atómica a la organización',async()=>{
 const api=await actions();assert.equal((await api.rejectMemberAccess(memberForm())).ok,true);
 assert.equal(api.calls[0].name,'decide_organization_access');
 assert.deepEqual(JSON.parse(JSON.stringify(api.calls[0].args)),{target_organization:org,target_user:applicant,decision:'reject'});
});
for(const [label,error] of [['sin permiso',{code:'42501'}],['propia cuenta',{code:'23514'}],['cuenta activa',{code:'23514'}],['solicitud cambió',{code:'23514'}],['fallo de almacenamiento',{code:'500'}]]){
 test('rechazar no informa éxito ante '+label,async()=>{
  const api=await actions({error});assert.equal((await api.rejectMemberAccess(memberForm())).ok,false);
 });
}
test('una aprobación obsoleta usa la decisión atómica y no reactiva solicitudes rechazadas',async()=>{
 const api=await actions({error:{code:'23514'}});const form=memberForm();form.set('approvePending','on');
 assert.equal((await api.updateMemberAccess(form)).ok,false);
 assert.equal(api.calls[0].name,'decide_organization_access');assert.equal(api.calls[0].args.decision,'approve');
});
test('quitar acceso elimina solo la membresía seleccionada y nunca invoca Auth delete',async()=>{
 const api=await actions();assert.equal((await api.removeMemberAccess(memberForm())).ok,true);
 assert.equal(api.calls[0].name,'remove_organization_member');assert.equal(api.calls[0].args.target_organization,org);
 const missing=await actions({user:null});assert.equal((await missing.removeMemberAccess(memberForm())).ok,false);assert.equal(missing.calls.length,0);
});
test('guardar permisos conserva la organización y rechaza cargos demasiado largos',async()=>{
 const api=await actions();const form=memberForm();form.set('role','viewer');form.set('tasks','on');form.set('edit','on');
 assert.equal((await api.updateMemberAccess(form)).ok,true);
 assert.equal(api.calls[0].args.member_permissions.edit,true);assert.equal(api.calls[0].args.member_permissions.tasks,true);
 form.set('directiveRole','x'.repeat(81));assert.equal((await api.updateMemberAccess(form)).ok,false);assert.equal(api.calls.length,1);
});
test('registrar otra cuenta no sustituye una sesión existente', async () => {
  let registrations = 0;
  const client = { auth: { getClaims: async () => ({ data: { claims: { sub: 'admin' } }, error: null }), signUp: async () => { registrations++; return { data: { session: {} }, error: null }; } } };
  const { signup } = await load('app/login/actions.ts', { '@/lib/supabase/server': { createClient: async () => client }, 'next/cache': { revalidatePath() {} }, 'next/navigation': { redirect: url => { throw new Error(url); } } });
  const form = new FormData(); form.set('fullName', 'Nueva persona'); form.set('email', 'new@example.com'); form.set('password', 'Password123');
  await assert.rejects(signup(form), error => decodeURIComponent(error.message).includes('otro navegador'));
  assert.equal(registrations, 0);
});
test('rejected application uses the current organization screen without a pending heading', async () => {
 const tree=await organizationStatus({organization_id:org,is_active:false,permissions:{access_rejected:true}});
 assert.match(JSON.stringify(tree),/rechaz/);
 assert.doesNotMatch(JSON.stringify(tree),/Tu solicitud est\u00e1 pendiente/);
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

test('approved application opens the organization on the current route', async () => {
 await assert.rejects(organizationStatus({organization_id:org,is_active:true,permissions:{}}),new RegExp(`/o/${org}`));
});

test('una persona sin sesión todavía puede registrarse', async () => {
  let registrations = 0;
  const client = { auth: { getClaims: async () => ({ data: null, error: null }), signUp: async () => { registrations++; return { data: { session: null }, error: null }; } } };
  const { signup } = await load('app/login/actions.ts', { '@/lib/supabase/server': { createClient: async () => client }, 'next/cache': { revalidatePath() {} }, 'next/navigation': { redirect: url => { throw new Error(url); } } });
  const form = new FormData(); form.set('fullName', 'Nueva persona'); form.set('email', 'new@example.com'); form.set('password', 'Password123');
  await assert.rejects(signup(form), /\/signup\?created=1&confirm=1/);
  assert.equal(registrations, 1);
});

test('el registro con sesión muestra la confirmación antes del estado de revisión', async () => {
  const client = { auth: { getClaims: async () => ({ data: null, error: null }), signUp: async () => ({ data: { session: {} }, error: null }) } };
  const { signup } = await load('app/login/actions.ts', { '@/lib/supabase/server': { createClient: async () => client }, 'next/cache': { revalidatePath() {} }, 'next/navigation': { redirect: url => { throw new Error(url); } } });
  const form = new FormData(); form.set('fullName', 'Nueva persona'); form.set('email', 'new@example.com'); form.set('password', 'Password123');
  await assert.rejects(signup(form), error => error.message === '/signup?created=1');
});

test('la confirmación lleva al estado de solicitud y muestra el correo de la sesión', async () => {
  const jsx = (type, props) => ({ type, props });
  const { default: SignupPage } = await load('app/signup/page.tsx', {
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/link': 'link', 'lucide-react': {}, '../login/actions': {},
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getClaims: async () => ({ data: { claims: { sub: 'applicant', email: 'ana@example.com' } } }) } }) },
  });
  const tree = await SignupPage({ searchParams: Promise.resolve({ created: '1' }) });
  const output = JSON.stringify(tree);
  assert.match(output, /¡Cuenta creada!/);
  assert.match(output, /ana@example.com/);
  assert.match(output, /"href":"\/"/);
  assert.doesNotMatch(output, /Te avisaremos por correo/);
  assert.match(output, /Volver al inicio/);
  assert.doesNotMatch(output, /\/auth\/signout|Volver al inicio de sesión/);
});

test('current pending screen explains approval without invented dates or deadlines', async () => {
 const tree=await organizationStatus({organization_id:org,is_active:false,permissions:{access_pending:true}});
 const output=JSON.stringify(tree);
 assert.match(output,/Tu solicitud est\u00e1 pendiente/);
 assert.match(output,/apruebe/);
 assert.doesNotMatch(output,/24 horas|tel:|2026-10-05/);
});

test('recargar Usuarios con Auth temporalmente caído no redirige al login', async () => {
  let redirected = false;
  const client = { auth: { getUser: async () => ({ data: {user:null}, error: Object.assign(new Error('Auth unavailable'), { name: 'AuthRetryableFetchError', status: 503 }) }) } };
  const { default: UsersPage } = await load('app/more/users/page.tsx', {
    '@/lib/supabase/server': { createClient: async () => client }, 'next/navigation': { redirect() { redirected = true; throw new Error('login'); } },
    '@/lib/tenant-server': {requireOrganizationContext:id=>resolveOrganizationContext(client,id)},
    'next/link': {}, 'react/jsx-runtime': {}, 'lucide-react': {}, './users-manager': {},
  });
  await assert.rejects(UsersPage({ params:Promise.resolve({organizationId:org}),searchParams: Promise.resolve({}) }), /Auth unavailable/);
  assert.equal(redirected, false);
});
