import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tenantPath} from '../lib/tenant-context.ts';
const {loadBindings,transform}=createRequire(import.meta.url)('next/dist/build/swc');
const org='50000000-0000-4000-8000-000000000001',camp='60000000-0000-4000-8000-000000000001';
async function fixture(result,online=true) {
 await loadBindings();const path='app/organizations/organization-form.tsx';const {code}=await transform(await readFile(new URL(`../${path}`,import.meta.url),'utf8'),{filename:path,jsc:{parser:{syntax:'typescript',tsx:true},target:'es2022',transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}});
 const module={exports:{}};const state=[],paths=[],calls=[];let index=0;
 const mutate=async form=>{calls.push(form);return result};const jsx=(type,props)=>({type,props});
 const modules={'react/jsx-runtime':{jsx,jsxs:jsx},react:{useState(initial){const i=index++;if(!(i in state))state[i]=initial;return [state[i],value=>state[i]=value]}},'next/navigation':{useRouter:()=>({push:path=>paths.push(path),refresh(){}})},'@/lib/tenant-context':{tenantPath},'./actions':{createOrganization:mutate,createCamporee:mutate,createInvitation:mutate,acceptInvitation:mutate,joinCamporee:mutate,createJoinCode:mutate}};
 vm.runInNewContext(code,{module,exports:module.exports,require:name=>modules[name],navigator:{onLine:online},window:{location:{origin:'http://localhost:3002'}},URL,FormData:class{constructor(form){return form.data}}});
 return {render(kind){index=0;return module.exports.default({kind,submitLabel:'Continuar',children:'Campos'})},paths,calls};
}
test('creation form opens exactly the camporee returned by its server action',async()=>{
 const api=await fixture({ok:true,organizationId:org,camporeeId:camp});const data=new FormData();data.set('name','Evento');
 await api.render('create-camporee').props.onSubmit({preventDefault(){},currentTarget:{data}});
 assert.deepEqual(api.paths,[`/o/${org}/c/${camp}`]);assert.equal(api.calls[0].get('name'),'Evento');
});
test('denied or offline administrative form retains input and does not navigate',async()=>{
 for(const [result,online] of [[{ok:false,error:'Permiso revocado'},true],[{ok:true,organizationId:org},false]]) {
  const api=await fixture(result,online);const data=new FormData();data.set('name','Conservar este nombre');
  await api.render('create-organization').props.onSubmit({preventDefault(){},currentTarget:{data}});
  assert.equal(api.paths.length,0);assert.equal(data.get('name'),'Conservar este nombre');
  const output=JSON.stringify(api.render('create-organization'));assert.match(output,/alert/);
 }
});
test('invitation form presents a copyable link and stays in current organization',async()=>{
 const api=await fixture({ok:true,invitationToken:'a'.repeat(64)});const data=new FormData();
 await api.render('invite').props.onSubmit({preventDefault(){},currentTarget:{data}});
 assert.equal(api.paths.length,0);assert.match(JSON.stringify(api.render('invite')),new RegExp(`http://localhost:3002/invitations/${'a'.repeat(64)}`));
});

test('join-by-code enters directly without choosing a camporee',async()=>{
 const api=await fixture({ok:true,camporeeId:camp});const data=new FormData();data.set('code','A1B2C3D4E5F60708');
 await api.render('join').props.onSubmit({preventDefault(){},currentTarget:{data}});
 assert.deepEqual(api.paths,['/']);assert.equal(api.calls[0].get('code'),'A1B2C3D4E5F60708');
});
test('director creates reusable camporee link from code without member email',async()=>{
 const code='A1B2C3D4E5F60708';const api=await fixture({ok:true,invitationToken:code});
 const data=new FormData();data.set('camporeeId',camp);
 await api.render('create-join-code').props.onSubmit({preventDefault(){},currentTarget:{data}});
 assert.match(JSON.stringify(api.render('create-join-code')),/http:\/\/localhost:3002\/join\/A1B2C3D4E5F60708/);
});
