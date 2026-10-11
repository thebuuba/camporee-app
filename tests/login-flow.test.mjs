import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { safeAuthReturn } from '../lib/tenant-context.ts';
const { loadBindings, transform } = createRequire(import.meta.url)('next/dist/build/swc');
async function load(path, modules) {
  modules['@/lib/tenant-context'] = { safeAuthReturn };
  await loadBindings();
  const { code } = await transform(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'), { filename: path, jsc: { parser: { syntax: 'typescript', tsx: true }, target: 'es2022', transform:{react:{runtime:'automatic'}} }, module: { type: 'commonjs' } });
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => modules[name], URL, fetch: async () => {}, process: { env: {} } });
  return module.exports;
}
async function actions(auth) {
  const cookies = [];
  const exports = await load('app/login/actions.ts', { '@/lib/supabase/server': { createClient: async () => ({ auth }) }, 'next/cache': { revalidatePath() {} }, 'next/navigation': { redirect: url => { throw new Error(url); } }, 'next/headers': { cookies: async () => ({ set: (...value) => cookies.push(value) }), headers: async () => ({ get: key => key==='origin'?'http://localhost:3002':key==='host'?'localhost:3002':null }) } });
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
test('login preserves an invitation destination and refuses an external destination',async()=>{
 const token='a'.repeat(64);
 for(const [next,want] of [[`/invitations/${token}`,`/invitations/${token}?login=ok`],['https://outside.example','/?login=ok'],['//outside.example','/?login=ok'],['/\\outside.example','/?login=ok']]) {
  const api=await actions({signInWithPassword:async()=>({data:{session:{}},error:null}),getUser:async()=>({data:{user:{id:'person'}}})});
  const form=new FormData();form.set('email','ana@example.com');form.set('password','Password123');form.set('next',next);
  await assert.rejects(api.login(form),error=>error.message===want);
 }
});
test('an immediately verified signup follows the invitation without another click',async()=>{
 const token='a'.repeat(64);const next='/join/'+token;
 const api=await actions({
  getClaims:async()=>({data:{claims:null},error:null}),
  signUp:async()=>({data:{session:{access_token:'verified'}},error:null}),
 });
 const form=new FormData();
 form.set('fullName','Persona invitada');form.set('email','guest@club.test');
 form.set('password','Password123');form.set('next',next);
 await assert.rejects(api.signup(form),error=>error.message===next);
});
test('email confirmation preserves the invitation destination',async()=>{
 const token='b'.repeat(64);const next=`/invitations/${token}`;
 const {GET}=await load('app/auth/confirm/route.ts',{'@/lib/supabase/server':{createClient:async()=>({auth:{exchangeCodeForSession:async()=>({error:null})}})},'next/server':{NextResponse:{redirect:url=>url.toString()}}});
 const url=`http://localhost:3002/auth/confirm?code=test&next=${encodeURIComponent(next)}`;
 assert.equal(await GET({url,nextUrl:{clone:()=>new URL(url)}}),`http://localhost:3002${next}`);
});
test('registration includes invitation in confirmation callback and next login',async()=>{
 const token='c'.repeat(64);const next=`/invitations/${token}`;let options;
 const api=await actions({getClaims:async()=>({data:{claims:null},error:null}),signUp:async input=>{options=input.options;return {data:{session:null},error:null}}});
 const form=new FormData();form.set('fullName','Ana');form.set('email','ana@example.com');form.set('password','Password123');form.set('next',next);
 await assert.rejects(api.signup(form),error=>new URL(error.message,'http://localhost:3002').searchParams.get('next')===next);
 const callback=new URL(options.emailRedirectTo);
 assert.equal(callback.origin,'http://localhost:3002');assert.equal(callback.pathname,'/auth/confirm');assert.equal(callback.searchParams.get('next'),next);
});
function findNode(node,predicate) {
 if(!node||typeof node!=='object')return null;
 if(predicate(node))return node;
 const children=node.props?.children;
 for(const child of Array.isArray(children)?children:[children]){const found=findNode(child,predicate);if(found)return found;}
 return null;
}
test('login and registration validation failures retain the invitation continuation',async()=>{
 const api=await actions({});const form=new FormData();const next=`/invitations/${'e'.repeat(64)}`;form.set('next',next);
 for(const action of [api.login,api.signup])await assert.rejects(action(form),err=>new URL(err.message,'https://camp.test').searchParams.get('next')===next);
});
for(const path of ['app/login/page.tsx','app/signup/page.tsx']) {
 test(`${path} carries invitation through its form`,async()=>{
  const next=`/invitations/${'d'.repeat(64)}`;const jsx=(type,props)=>({type,props});
  const {default:render}=await load(path,{'react/jsx-runtime':{jsx,jsxs:jsx},'next/link':{default:'link'},'lucide-react':{},'./actions':{},'../login/actions':{},'./password-field':{default:'password'},'../login/password-field':{default:'password'}});
  const tree=await render({searchParams:Promise.resolve({next})});
  const hidden=findNode(tree,node=>node.type==='input'&&node.props.name==='next');
  assert.equal(hidden?.props.value,next);
 });
}

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
