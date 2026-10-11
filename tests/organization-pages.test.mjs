import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolveOrganizationContext,tenantPath} from '../lib/tenant-context.ts';
import {signedAvatar} from '../lib/avatars.ts';
import {isTenantSchemaUnavailable} from '../lib/tenant-schema.ts';
const {loadBindings,transform}=createRequire(import.meta.url)('next/dist/build/swc');
const org='50000000-0000-4000-8000-000000000001',other='50000000-0000-4000-8000-000000000002';
const camp='60000000-0000-4000-8000-000000000001',otherCamp='60000000-0000-4000-8000-000000000002';
const user='10000000-0000-4000-8000-000000000005';
function client(role='admin') {
 const rows={organizations:[{id:org,name:'Club principal'},{id:other,name:'Otro club'}],organization_members:[{organization_id:org,user_id:user,role,is_active:true,permissions:{}}],camporees:[{id:camp,organization_id:org,name:'Camporee actual',status:'planning',starts_on:'2026-01-01',ends_on:'2026-01-05'},{id:otherCamp,organization_id:other,name:'Camporee ajeno',status:'planning',starts_on:'2027-01-01',ends_on:'2027-01-05'}]};
 rows.profiles=[{id:user,full_name:'Persona del club',email:'person@club.test'},{id:'foreign-user',full_name:'Perfil ajeno'}];
 rows.organization_invitations=[{id:'invite',organization_id:org,email:'invite@club.test',role:'viewer',expires_at:'2099-01-01'}];
 return {auth:{getUser:async()=>({data:{user:{id:user,email:'person@club.test'}},error:null})},rpc:async(name)=>({data:name==='read_camporee_invitation'?{code:'4827',token:'a'.repeat(64)}:null,error:null}),from(table){const filters=[];return {select(){return this},eq(k,v){filters.push(row=>row[k]===v);return this},neq(k,v){filters.push(row=>row[k]!==v);return this},in(k,values){filters.push(row=>values.includes(row[k]));return this},order(){return this},maybeSingle(){this.single=true;return this},then(resolve,reject){const list=(rows[table]??[]).filter(row=>filters.every(fn=>fn(row)));return Promise.resolve({data:this.single?list[0]??null:list,error:null}).then(resolve,reject)}}}};
}
async function render(path,supabase,props) {
 await loadBindings();const {code}=await transform(await readFile(new URL(`../${path}`,import.meta.url),'utf8'),{filename:path,jsc:{parser:{syntax:'typescript',tsx:true},target:'es2022',transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}});
 const jsx=(type,props)=>({type,props});const module={exports:{}};
 const avatarModule={'@/lib/avatars':{signedAvatar}};
 const modules={'react/jsx-runtime':{jsx,jsxs:jsx},'@/lib/supabase/server':{createClient:async()=>supabase},'@/lib/tenant-context':{tenantPath},'@/lib/tenant-schema':{isTenantSchemaUnavailable},'next/headers':{headers:async()=>({get:key=>key==='host'?'localhost:3000':null})},'@/lib/tenant-server':{requireOrganizationContext:id=>resolveOrganizationContext(supabase,id)},'next/navigation':{redirect:path=>{throw new Error(`redirect:${path}`)},notFound:()=>{throw new Error('notFound')}}};
 vm.runInNewContext(code,{module,exports:module.exports,require:name=>modules[name]??avatarModule[name]??{default:name},crypto:{randomUUID:()=>camp},process:{env:{NEXT_PUBLIC_SITE_URL:'http://localhost:3000'}}});
 return module.exports.default(props);
}
function all(node,predicate,result=[]) {if(!node||typeof node!=='object')return result;if(predicate(node))result.push(node);const children=node.props?.children;for(const child of Array.isArray(children)?children:[children])all(child,predicate,result);return result;}
test('members go directly into their only club without any chooser',async()=>{
 await assert.rejects(render('app/organizations/page.tsx',client(),{}),new RegExp(`redirect:/o/${org}`));
});
test('opening club redirects directly to its current camporee',async()=>{
 await assert.rejects(render('app/o/[organizationId]/page.tsx',client(),{params:Promise.resolve({organizationId:org})}),new RegExp(`redirect:/o/${org}/c/${camp}`));
});
test('no invitation list or switcher is offered in the camporee onboarding page',async()=>{
 await assert.rejects(render('app/o/[organizationId]/page.tsx',client('viewer'),{params:Promise.resolve({organizationId:org})}),/redirect/);
});
test('member administration queries only the chosen organization and its profiles',async()=>{
 const tree=await render('app/more/users/page.tsx',client(),{params:Promise.resolve({organizationId:org}),searchParams:Promise.resolve({})});
 const managers=all(tree,node=>Array.isArray(node.props?.users));assert.equal(managers.length,1);
 assert.equal(managers[0].props.organizationId,org);assert.equal(managers[0].props.users.length,1);
 assert.equal(managers[0].props.users[0].full_name,'Persona del club');
 assert.doesNotMatch(JSON.stringify(tree),/Perfil ajeno/);assert.match(JSON.stringify(tree),/4827/);assert.match(JSON.stringify(tree),new RegExp('/join/'+ 'a'.repeat(64)));
});
test('viewer cannot reach member administration even when admin in a different organization',async()=>{
 await assert.rejects(render('app/more/users/page.tsx',client('viewer'),{params:Promise.resolve({organizationId:org}),searchParams:Promise.resolve({})}),/notFound/);
});
