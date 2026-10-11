import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const {loadBindings,transform}=createRequire(import.meta.url)('next/dist/build/swc');
const org='50000000-0000-4000-8000-000000000001';
const camp='60000000-0000-4000-8000-000000000001';
async function actions({user={id:'verified'},error=null}={}){
 const calls=[];await loadBindings();const path='app/organizations/actions.ts';
 const {code}=await transform(await readFile(new URL(`../${path}`,import.meta.url),'utf8'),{filename:path,jsc:{parser:{syntax:'typescript'},target:'es2022'},module:{type:'commonjs'}});
 const module={exports:{}};const client={auth:{getUser:async()=>({data:{user},error:null})},from:()=>{throw new Error('Global table access forbidden')},rpc:async(name,args)=>{calls.push({name,args});return {data:name==='create_organization'?org:name==='create_camporee'?camp:name==='read_camporee_invitation'?{code:'4827',token:'a'.repeat(64)}:name==='accept_organization_invitation'?org:name==='join_camporee_by_code'?camp:name==='create_camporee_join_code'?'4827':'a'.repeat(64),error}}};
 vm.runInNewContext(code,{module,exports:module.exports,require:name=>({'@/lib/supabase/server':{createClient:async()=>client},'next/cache':{revalidatePath(){}}})[name]});
 return {...module.exports,calls};
}
test('organization creation sends stable request ID and lets RPC establish owner',async()=>{
 const api=await actions();const form=new FormData();form.set('name','Club');form.set('requestId',org);form.set('userId','impersonated');
 const result=await api.createOrganization(form);
 assert.equal(result.ok,true);assert.equal(result.organizationId,org);
 assert.equal(api.calls[0].name,'create_organization');assert.equal(api.calls[0].args.organization_uuid,org);assert.equal(api.calls[0].args.organization_name,'Club');
 assert.equal(Object.hasOwn(api.calls[0].args,'user_id'),false);
});
test('camporee creation carries organization, dates and stable event ID',async()=>{
 const api=await actions();const form=new FormData();form.set('organizationId',org);form.set('requestId',camp);form.set('name','Evento');form.set('startsOn','2027-01-01');form.set('endsOn','2027-01-05');
 const result=await api.createCamporee(form);
 assert.equal(result.ok,true);assert.equal(result.camporeeId,camp);assert.equal(result.joinCode,'4827');assert.equal(result.invitationToken,'a'.repeat(64));
 assert.equal(api.calls[1].name,'read_camporee_invitation');
 assert.equal(api.calls[0].name,'create_camporee');assert.equal(api.calls[0].args.target_organization,org);assert.equal(api.calls[0].args.camporee_uuid,camp);assert.equal(api.calls[0].args.start_date,'2027-01-01');assert.equal(api.calls[0].args.camporee_theme,null);
});
test('invitation creation binds permissions to selected organization and email',async()=>{
 const api=await actions();const form=new FormData();form.set('organizationId',org);form.set('email',' ANA@Club.Test ');form.set('role','viewer');form.set('tasks','on');
 const result=await api.createInvitation(form);
 assert.equal(result.ok,true);assert.equal(result.invitationToken,'a'.repeat(64));
 assert.equal(api.calls[0].name,'create_organization_invitation');assert.equal(api.calls[0].args.target_organization,org);assert.equal(api.calls[0].args.invited_email,'ana@club.test');assert.equal(api.calls[0].args.invited_permissions.tasks,true);assert.equal(api.calls[0].args.invited_permissions.finances,false);
});
test('accept invitation sends only token, never a client-selected role or account',async()=>{
 const api=await actions();const form=new FormData();form.set('token','b'.repeat(64));form.set('role','admin');form.set('userId','other');
 assert.equal((await api.acceptInvitation(form)).organizationId,org);
 assert.equal(api.calls[0].name,'accept_organization_invitation');assert.deepEqual(JSON.parse(JSON.stringify(api.calls[0].args)),{invitation_token:'b'.repeat(64)});
});
test('missing session never invokes creation RPC and database denial is visible',async()=>{
 const api=await actions({user:null});const form=new FormData();form.set('name','Club');form.set('requestId',org);
 assert.equal((await api.createOrganization(form)).ok,false);assert.equal(api.calls.length,0);
 const denied=await actions({error:{message:'Organization admin required',code:'42501'}});
 assert.equal((await denied.createOrganization(form)).ok,false);
});

test('joining by code never accepts a role, organization or user ID from the form',async()=>{
 const api=await actions();const form=new FormData();
 form.set('code','4827');form.set('userId','impersonated');form.set('role','admin');
 const result=await api.joinCamporee(form);
 assert.equal(result.ok,true);assert.equal(result.camporeeId,camp);
 assert.equal(api.calls[0].name,'join_camporee_by_code');
 assert.deepEqual(JSON.parse(JSON.stringify(api.calls[0].args)),{join_code:'4827'});
});
test('a director generates a camporee-only reusable code',async()=>{
 const api=await actions();const form=new FormData();
 form.set('camporeeId',camp);form.set('userId','impersonated');
 const result=await api.createJoinCode(form);
 assert.equal(result.invitationToken,'4827');
 assert.deepEqual(JSON.parse(JSON.stringify(api.calls[0].args)),{target_camporee:camp});
});
