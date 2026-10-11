import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCamporeeContext, tenantPath, parseTenantPath } from '../lib/tenant-context.ts';

const org='50000000-0000-4000-8000-000000000001';
const camp='60000000-0000-4000-8000-000000000001';
const user='10000000-0000-4000-8000-000000000005';
function client({active=true,role='viewer',permissions={},status='planning',campOrganization=org,error=null}={}) {
 const rows={organizations:[{id:org,name:'Club'}],organization_members:[{organization_id:org,user_id:user,role,is_active:active,permissions}],camporees:[{id:camp,organization_id:campOrganization,name:'Evento',status}]};
 return {auth:{getUser:async()=>({data:{user:{id:user}},error:null})},from(table){
  const filters=[];
  return {select(){return this},eq(key,value){filters.push([key,value]);return this},async maybeSingle(){return {data:error?null:(rows[table]??[]).find(row=>filters.every(([key,value])=>row[key]===value))??null,error}}};
 }};
}
test('explicit context validates camporee and organization together',async()=>{
 const context=await resolveCamporeeContext(client({role:'admin'}),{organizationId:org,camporeeId:camp});
 assert.equal(context.userId,user);
 assert.equal(context.camporee.id,camp);
 assert.equal(context.organization.id,org);
 assert.equal(context.canEdit('tasks'),true);
 await assert.rejects(resolveCamporeeContext(client({campOrganization:'00000000-0000-4000-8000-000000000001'}),{organizationId:org,camporeeId:camp}),/access/i);
});
test('context derives permissions from requested organization membership',async()=>{
 const viewer=await resolveCamporeeContext(client({permissions:{tasks:true}}),{organizationId:org,camporeeId:camp});
 assert.equal(viewer.canEdit('tasks'),true);
 assert.equal(viewer.canEdit('finances'),false);
 const editor=await resolveCamporeeContext(client({role:'editor'}),{organizationId:org,camporeeId:camp});
 assert.equal(editor.canEdit('finances'),true);
 const granular=await resolveCamporeeContext(client({permissions:{edit:true}}),{organizationId:org,camporeeId:camp});
 assert.equal(granular.canEdit('inventory'),true);
});
test('archived context keeps history readable and disables module writes',async()=>{
 const context=await resolveCamporeeContext(client({role:'admin',status:'archived'}),{organizationId:org,camporeeId:camp});
 assert.equal(context.camporee.status,'archived');
 assert.equal(context.canEdit('tasks'),false);
 assert.equal(context.isAdmin,true);
});
test('inactive membership and unknown identifiers fail closed',async()=>{
 await assert.rejects(resolveCamporeeContext(client({active:false}),{organizationId:org,camporeeId:camp}),/access/i);
 await assert.rejects(resolveCamporeeContext(client(),{organizationId:org,camporeeId:'60000000-0000-4000-8000-000000000099'}),/access/i);
 await assert.rejects(resolveCamporeeContext(client(),{organizationId:'invalid',camporeeId:camp}),/invalid/i);
});
test('query failures do not masquerade as revoked membership',async()=>{
 await assert.rejects(resolveCamporeeContext(client({error:{message:'Database unavailable'}}),{organizationId:org,camporeeId:camp}),/Database unavailable/);
});
test('tenant URLs retain context, query and global authentication routes',()=>{
 const path=`/o/${org}/c/${camp}`;
 assert.equal(tenantPath({organizationId:org,camporeeId:camp},'/tasks?phase=before'),`${path}/tasks?phase=before`);
 assert.equal(tenantPath({organizationId:org,camporeeId:camp},'/'),path);
 assert.equal(tenantPath({organizationId:org,camporeeId:camp},'/profile'),'/profile');
 assert.equal(tenantPath({organizationId:org,camporeeId:camp},'/auth/signout'),'/auth/signout');
 assert.deepEqual(parseTenantPath(`${path}/more/meals`),{organizationId:org,camporeeId:camp,panel:'/more/meals'});
 assert.equal(parseTenantPath('/tasks'),null);
 assert.equal(parseTenantPath('/o/bad/c/bad/tasks'),null);
});
