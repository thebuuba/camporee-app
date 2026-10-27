import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as dates from '../lib/date.ts';
import * as locale from '../lib/camporee-locale.ts';
import * as preparation from '../lib/camporee-preparation.ts';
import * as mutations from '../lib/mutation-result.ts';
const { loadBindings, transform } = createRequire(import.meta.url)('next/dist/build/swc');
const jsx = (type, props) => ({ type, props: props ?? {} });
async function load(path, modules, globals = {}) {
  await loadBindings();
  const { code } = await transform(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'), {
    filename: path, jsc: { parser: { syntax: 'typescript', tsx: true }, target: 'es2022', transform: { react: { runtime: 'automatic' } } }, module: { type: 'commonjs' },
  });
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: name => modules[name] ?? {}, setTimeout, console, ...globals });
  return module.exports;
}
function find(node, predicate) {
  if (!node || typeof node !== 'object') return;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat()) { const match = find(child, predicate); if (match) return match; }
}

test('home uses authorized SQL summary even when REST only returns the first 1000 rows', async () => {
  const calls = [];
  const supabase = {
    rpc: async (name, args) => { calls.push([name,args]); return { data: { totalTasks:1200, completedTasks:600, pendingTasks:600, progress:50, preparation:{total:1200,completed:600,percent:50}, totalExpenses:2400, totalIncome:3600, participants:1200, presentParticipants:1001, todayPendingTasks:1100, programCount:1200, todayProgramCount:1100, todayTasks:[], currentEvent:null, nextEvent:null }, error:null }; },
    from(table) { const b = { select(){return this},eq(){return this},order(){return this},maybeSingle(){return this},then(resolve){return Promise.resolve({data:table==='profiles'?{full_name:'Ana'}:Array.from({length:1000},(_,id)=>({id,status:'pending',phase:'before',amount:1})),error:null}).then(resolve)} }; return b; },
  };
  const {loadHomeData} = await load('lib/home-data.ts', {'./avatars':{signedAvatar:async()=>null},'@/lib/date':dates,'@/lib/camporee-preparation':preparation});
  const result = await loadHomeData({supabase,userId:'user',user:{user_metadata:{}},membership:{},camporee:{id:'camp',status:'planning',time_zone:'America/La_Paz',starts_on:'2026-10-01',ends_on:'2026-10-30'}});
  assert.equal(result.totalTasks,1200);
  assert.equal(result.totalExpenses,2400);
  assert.equal(result.preparation.total,1200);
  assert.equal(result.participants,1200);
  assert.equal(result.todayPendingTasks,1100);
  assert.equal(calls[0][1].target_camporee,'camp');
});

test('budget loads complete scalar finance snapshots beyond the REST row cap', async () => {
  const calls = [];
  const supabase = {async rpc(name,args) {
    calls.push([name,args]);
    return {data:Array.from({length:1200},(_,i)=>({id:`${args.entry_kind}-${i}`,description:'Row',amount:args.entry_kind==='expenses'?2:3,spent_on:'2026-10-27',received_on:'2026-10-27'})),error:null};
  },from(table) {
    assert.equal(table,'areas');
    return {select(){return this},eq(){return this},order(){return this},then(resolve){return Promise.resolve({data:[],error:null}).then(resolve)}};
  }};
  let finance={}; try { finance=await load('lib/finance-data.ts',{}); } catch(error) { if(error.code!=='ENOENT')throw error; }
  const {default:BudgetPage} = await load('app/more/budget/page.tsx', {'react/jsx-runtime':{jsx,jsxs:jsx},'@/lib/tenant-server':{requireCamporeeContext:async()=>({supabase,userId:'user',camporee:{id:'camp',currency:'DOP'},canEdit:()=>true})},'@/lib/camporee-locale':locale,'@/lib/finance-data':finance});
  const tree=await BudgetPage();
  const manager=find(tree,node=>node.props.initialExpenses);
  assert.equal(manager.props.initialExpenses.length,1200);
  assert.equal(manager.props.initialIncome.length,1200);
  assert.equal(new Set(manager.props.initialExpenses.map(row=>row.id)).size,1200);
  assert.equal(calls.length,2);
  assert.ok(calls.every(([name,args])=>name==='get_camporee_finance_rows'&&args.target_camporee==='camp'));
});

for (const mutation of ['insert','delete']) {
  test(`finance read has no pagination gaps or duplicates during concurrent ${mutation}`, async () => {
    const initial=(mutation==='insert'?[['a',10],['b',20],['c',30]]:[['a',10],['b',20],['c',30],['d',40]]).map(([id,amount])=>({id,amount}));
    let rows=[...initial],mutated=false,rpcCalls=0;
    const mutate=()=>{if(mutated)return;mutated=true;if(mutation==='insert')rows.unshift({id:'x',amount:100});else rows.shift()};
    const supabase={async rpc(name,args){
      assert.equal(name,'get_camporee_finance_rows');
      assert.equal(args.entry_kind,'expenses');
      const snapshot=[...rows];rpcCalls++;mutate();return {data:snapshot,error:null};
    },from(){let start=0;return {select(){return this},eq(){return this},order(){return this},range(from){start=from;return this},then(resolve){
      const snapshot=rows.slice(start,start+2),count=rows.length;mutate();return Promise.resolve({data:snapshot,count,error:null}).then(resolve);
    }}}};
    const {loadFinanceRows}=await load('lib/finance-data.ts',{});
    const {data}=await loadFinanceRows(supabase,'camp','expenses');
    assert.deepEqual(Array.from(data,row=>row.id),initial.map(row=>row.id));
    assert.equal(data.reduce((sum,row)=>sum+row.amount,0),mutation==='insert'?60:100);
    assert.equal(rpcCalls,1);
  });
}

test('failed atomic activity save leaves the edited form open and original participants intact', async () => {
  const original={id:'activity',title:'Old',location:'Cancha',camporee_activity_participants:[{participant_id:'old-person'}]};
  const changes=[], calls=[]; let stateIndex=0;
  const state=[ [original],true,original,false,'','all','' ];
  const supabase={rpc:async(name,args)=>{calls.push([name,args]);return {data:null,error:{message:'transaction failed'}}},from(){throw new Error('independent writes are forbidden')}};
  const {default:ActivityManager}=await load('app/more/activities/activity-manager.tsx',{
    'react/jsx-runtime':{jsx,jsxs:jsx},react:{useEffect(){},useMemo:fn=>fn(),useState(){const index=stateIndex++;return [state[index],value=>{changes.push([index,value]);state[index]=typeof value==='function'?value(state[index]):value}]}},
    'next/navigation':{useRouter:()=>({refresh(){throw new Error('failed save cannot refresh')}})},'@/lib/supabase/client':{createClient:()=>supabase},'@/lib/camporee-locale':locale,'@/lib/mutation-result':mutations,'@/lib/client-ui':{reportMutationError:error=>error.message},
  },{FormData:class {constructor(){return fields}}});
  const fields=new FormData(); fields.set('title','Edited');fields.append('participants','new-person');
  const tree=ActivityManager({camporeeId:'camp',canEdit:true,initialActivities:[original],participants:[]});
  find(tree,node=>node.type==='form').props.onSubmit({preventDefault(){},currentTarget:{}});
  await new Promise(resolve=>setTimeout(resolve,20));
  assert.equal(calls.length,1);
  assert.equal(calls[0][0],'save_camporee_activity');
  assert.equal(calls[0][1].activity_data.location,'Cancha');
  assert.equal(state[1],true);
  assert.equal(state[2],original);
  assert.deepEqual(state[0][0].camporee_activity_participants,[{participant_id:'old-person'}]);
  assert.equal(changes.some(([index])=>index===0||index===1||index===2),false);
  assert.match(state[6],/transaction failed/);
});

async function activityControl(result, action) {
  const original={id:'activity',title:'Original',is_completed:false,schedule_event_id:'program'};
  const state=[[original],false,null,false,'','all',''];
  const successes=[],errors=[],filters=[],rpcCalls=[];let stateIndex=0,refreshes=0;
  const supabase={rpc:async(name,args)=>{rpcCalls.push([name,args]);return result},from(){return {
    update(){return this},delete(){return this},eq(key,value){filters.push([key,value]);return this},select(){return this},then(resolve){return Promise.resolve(result).then(resolve)},
  }}};
  const {default:ActivityManager}=await load('app/more/activities/activity-manager.tsx',{
    'react/jsx-runtime':{jsx,jsxs:jsx},react:{useEffect(){},useMemo:fn=>fn(),useState(){const index=stateIndex++;return [state[index],value=>{state[index]=typeof value==='function'?value(state[index]):value}]}},
    'next/navigation':{useRouter:()=>({refresh(){refreshes++}})},'@/lib/supabase/client':{createClient:()=>supabase},'@/lib/camporee-locale':locale,'@/lib/mutation-result':mutations,
    '@/lib/client-ui':{confirmRemoval:()=>true,reportMutationSuccess:message=>successes.push(message),reportMutationError:error=>errors.push(error)},
  });
  const tree=ActivityManager({camporeeId:'camp',canEdit:true,initialActivities:[original],participants:[]});
  await find(tree,node=>node.type==='button'&&node.props['aria-label']===(action==='toggle'?'Marcar actividad como completada':'Eliminar')).props.onClick();
  return {state,successes,errors,filters,rpcCalls,refreshes};
}

test('activity completion rejects zero affected rows and keeps the original state',async()=>{
  const result=await activityControl({data:[],error:null,status:200},'toggle');
  assert.equal(result.successes.length,0);
  assert.equal(result.errors.length,1);
  assert.equal(result.state[0][0].is_completed,false);
  assert.equal(result.refreshes,0);
});
test('queued activity completion reports pending and does not refresh',async()=>{
  const result=await activityControl({data:[{id:'activity',is_completed:true}],error:null,status:202},'toggle');
  assert.match(result.successes[0],/pendiente/i);
  assert.equal(result.state[0][0].is_completed,true);
  assert.equal(result.refreshes,0);
  assert.deepEqual(result.filters,[['id','activity'],['camporee_id','camp']]);
});
for(const response of [{data:null,error:null,status:200},{data:'activity',error:null,status:202},{data:null,error:{message:'linked event failed'},status:500}]){
  test(`activity removal preserves UI when atomic delete is unconfirmed (${response.status})`,async()=>{
    const result=await activityControl(response,'delete');
    assert.equal(result.successes.length,0);
    assert.equal(result.errors.length,1);
    assert.equal(result.state[0].length,1);
    assert.equal(result.refreshes,0);
    assert.equal(result.rpcCalls[0][0],'delete_camporee_activity');
  });
}
test('confirmed atomic activity removal updates UI and refreshes',async()=>{
  const result=await activityControl({data:'activity',error:null,status:200},'delete');
  assert.equal(result.successes.length,1);
  assert.equal(result.errors.length,0);
  assert.equal(result.state[0].length,0);
  assert.equal(result.refreshes,1);
  assert.equal(result.rpcCalls.length,1);
  assert.equal(result.rpcCalls[0][0],'delete_camporee_activity');
  assert.equal(result.rpcCalls[0][1].target_camporee,'camp');
  assert.equal(result.rpcCalls[0][1].activity_id,'activity');
});
