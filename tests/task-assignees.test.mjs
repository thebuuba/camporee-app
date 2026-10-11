import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTaskAssignees } from '../lib/task-assignees.ts';
const organizationId='50000000-0000-4000-8000-000000000001';

test('directory request includes the selected organization and preserves duties',async()=>{
 const directory={data:[{id:'user',full_name:'Ana',email:null,directive_role:'Tesorero/a'}],error:null};
 const client={rpc:async(name,args)=>name==='organization_task_assignees'&&args?.target_organization===organizationId?directory:{data:null,error:{code:'42501'}}};
 assert.deepEqual(await loadTaskAssignees(client,organizationId),directory);
});
test('missing organization directory RPC fails closed without querying global memberships',async()=>{
 const result={data:null,error:{code:'PGRST202'}};
 const client={rpc:async()=>result,from:()=>{throw new Error('Global fallback is forbidden')}};
 assert.deepEqual(await loadTaskAssignees(client,organizationId),result);
});
test('directory authorization and network failures remain visible',async()=>{
 for(const code of ['42501','PGRST301','FETCH_ERROR']) {
  const result={data:null,error:{code}};
  assert.deepEqual(await loadTaskAssignees({rpc:async()=>result},organizationId),result);
 }
});
test('empty scoped directory remains empty',async()=>{
 assert.deepEqual(await loadTaskAssignees({rpc:async()=>({data:[],error:null})},organizationId),{data:[],error:null});
});
