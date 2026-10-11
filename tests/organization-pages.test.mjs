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
 const rows={organizations:[{id:org,name:'Club principal'},{id:other,name:'Otro club'}],organization_members:[{organization_id:org,user_id:user,role,is_active:true,permissions:{}},{organization_id:other,user_id:user,role:'viewer',is_active:true,permissions:{}}],camporees:[{id:camp,organization_id:org,name:'Historia del club',status:'archived',starts_on:'2025-01-01',ends_on:'2025-01-05'},{id:otherCamp,organization_id:other,name:'Camporee ajeno',status:'planning',starts_on:'2027-01-01',ends_on:'2027-01-05'}]};
 rows.profiles=[{id:user,full_name:'Persona del club',email:'person@club.test'},{id:'foreign-user',full_name:'Perfil ajeno'}];
 rows.organization_invitations=[{id:'invite',organization_id:org,email:'invite@club.test',role:'viewer',expires_at:'2099-01-01'}];
 return {auth:{getUser:async()=>({data:{user:{id:user,email:'person@club.test'}},error:null})},from(table){const filters=[];return {select(){return this},eq(k,v){filters.push([k,v]);return this},in(k,values){this.inFilter=[k,values];return this},order(){return this},maybeSingle(){this.single=true;return this},then(resolve,reject){const list=(rows[table]??[]).filter(row=>filters.every(([k,v])=>row[k]===v)&&(!this.inFilter||this.inFilter[1].includes(row[this.inFilter[0]])));return Promise.resolve({data:this.single?list[0]??null:list,error:null}).then(resolve,reject)}}}};
}
async function render(path,supabase,props) {
 await loadBindings();const {code}=await transform(await readFile(new URL(`../${path}`,import.meta.url),'utf8'),{filename:path,jsc:{parser:{syntax:'typescript',tsx:true},target:'es2022',transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}});
 const jsx=(type,props)=>({type,props});const module={exports:{}};
 const avatarModule={'@/lib/avatars':{signedAvatar}};
 const modules={'react/jsx-runtime':{jsx,jsxs:jsx},'@/lib/supabase/server':{createClient:async()=>supabase},'@/lib/tenant-context':{tenantPath},'@/lib/tenant-schema':{isTenantSchemaUnavailable},'@/lib/tenant-server':{requireOrganizationContext:id=>resolveOrganizationContext(supabase,id)},'next/navigation':{redirect:path=>{throw new Error(`redirect:${path}`)},notFound:()=>{throw new Error('notFound')}}};
 vm.runInNewContext(code,{module,exports:module.exports,require:name=>modules[name]??avatarModule[name]??{default:name},crypto:{randomUUID:()=>camp}});
 return module.exports.default(props);
}
function all(node,predicate,result=[]) {if(!node||typeof node!=='object')return result;if(predicate(node))result.push(node);const children=node.props?.children;for(const child of Array.isArray(children)?children:[children])all(child,predicate,result);return result;}
test('organization chooser displays each account membership without choosing a global club',async()=>{
 const tree=await render('app/organizations/page.tsx',client(),{});
 const hrefs=all(tree,node=>Boolean(node.props?.href)).map(node=>node.props.href);
 assert.ok(hrefs.includes(`/o/${org}`));assert.ok(hrefs.includes(`/o/${other}`));
});
test('organization camporee list retains archived history and excludes other organization',async()=>{
 const tree=await render('app/o/[organizationId]/page.tsx',client(),{params:Promise.resolve({organizationId:org})});
 const output=JSON.stringify(tree);assert.match(output,/Historia del club/);assert.doesNotMatch(output,/Camporee ajeno/);
 assert.ok(all(tree,node=>node.props?.href===`/o/${org}/c/${camp}`).length);
 assert.ok(all(tree,node=>node.type==='input'&&node.props.name==='organizationId'&&node.props.value===org).length);
});
test('viewer can select history but is not offered organization administration forms',async()=>{
 const tree=await render('app/o/[organizationId]/page.tsx',client('viewer'),{params:Promise.resolve({organizationId:org})});
 assert.match(JSON.stringify(tree),/Historia del club/);
 assert.equal(all(tree,node=>node.type==='input'&&node.props.name==='organizationId').length,0);
});
test('member administration queries only the chosen organization and its profiles',async()=>{
 const tree=await render('app/more/users/page.tsx',client(),{params:Promise.resolve({organizationId:org}),searchParams:Promise.resolve({})});
 const managers=all(tree,node=>Array.isArray(node.props?.users));assert.equal(managers.length,1);
 assert.equal(managers[0].props.organizationId,org);assert.equal(managers[0].props.users.length,1);
 assert.equal(managers[0].props.users[0].full_name,'Persona del club');
 assert.doesNotMatch(JSON.stringify(tree),/Perfil ajeno/);assert.match(JSON.stringify(tree),/invite@club.test/);
});
test('viewer cannot reach member administration even when admin in a different organization',async()=>{
 await assert.rejects(render('app/more/users/page.tsx',client('viewer'),{params:Promise.resolve({organizationId:org}),searchParams:Promise.resolve({})}),/notFound/);
});
