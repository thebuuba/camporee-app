import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolveCamporeeContext, tenantPath } from '../lib/tenant-context.ts';
import { songsFromDocuments } from '../lib/songs.ts';
import {signedAvatar} from '../lib/avatars.ts';
import { dateKeyInTimeZone, dateOnlyDistance } from '../lib/date.ts';
import { camporeePhase, preparationProgress } from '../lib/camporee-preparation.ts';
import { formatCamporeeMoney,formatCamporeeDate,camporeeMidnightEpoch } from '../lib/camporee-locale.ts';
const {loadBindings,transform}=createRequire(import.meta.url)('next/dist/build/swc');
const org='50000000-0000-4000-8000-000000000001';
const camp='60000000-0000-4000-8000-000000000001';
const old='20000000-0000-4000-8000-000000000001';
const user='10000000-0000-4000-8000-000000000005';
function client() {
 const rows={profiles:[],app_members:[{user_id:user,role:'admin',is_active:true}],organizations:[{id:org,name:'Club'}],organization_members:[{organization_id:org,user_id:user,role:'viewer',is_active:true,permissions:{}}],
  camporees:[{id:old,organization_id:'00000000-0000-4000-8000-000000000001',name:'Otro evento',starts_on:'2026-01-01',ends_on:'2026-01-05',status:'planning'},{id:camp,organization_id:org,name:'Historial',starts_on:'2025-01-01',ends_on:'2025-01-05',time_zone:'America/Santo_Domingo',currency:'DOP',status:'archived'}],
  tasks:[{id:'old-task',camporee_id:old,title:'Otra organización',status:'pending'},{id:'selected-task',camporee_id:camp,title:'Historial elegido',status:'done'}],areas:[]};
 return {auth:{getClaims:async()=>({data:{claims:{sub:user}},error:null}),getUser:async()=>({data:{user:{id:user}},error:null})},rpc:async()=>({data:[],error:null}),from(table){
  const filters=[];const builder={select(){return this},eq(k,v){filters.push([k,v]);return this},order(){return this},like(){return this},neq(){return this},or(){return this},ilike(){return this},limit(){return this},maybeSingle(){this.single=true;return this},then(resolve,reject){const data=(rows[table]??[]).filter(row=>filters.every(([k,v])=>row[k]===v));return Promise.resolve({data:this.single?data[0]??null:data,error:null}).then(resolve,reject)}};return builder;
 }};
}
async function page(supabase,path='app/tasks/page.tsx') {
 await loadBindings();
 const {code}=await transform(await readFile(new URL(`../${path}`,import.meta.url),'utf8'),{filename:path,jsc:{parser:{syntax:'typescript',tsx:true},target:'es2022',transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}});
 const module={exports:{}};
 const modules={
  'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},
  'next/navigation':{redirect:path=>{throw new Error(`redirect:${path}`)}},
  '@/lib/supabase/server':{createClient:async()=>supabase},
  '@/lib/tenant-server':{requireCamporeeContext:async params=>resolveCamporeeContext(supabase,await params)},
  '@/lib/task-assignees':{loadTaskAssignees:async()=>({data:[],error:null})},
  '@/lib/songs':{songsFromDocuments},
  '@/lib/avatars':{signedAvatar},
  './avatars':{signedAvatar},
  '@/lib/date':{dateKeyInTimeZone,dateOnlyDistance},
  '@/lib/tenant-context':{tenantPath},
  '@/lib/camporee-preparation':{camporeePhase,preparationProgress},
  '@/lib/camporee-locale':{formatCamporeeMoney,formatCamporeeDate,camporeeMidnightEpoch},
  '../components/bottom-nav':{default:'nav'},'./task-manager':{default:'tasks-manager'},
 };
 vm.runInNewContext(code,{module,exports:module.exports,require:name=>modules[name]??{default:name},setTimeout,console});
 return module.exports.default??module.exports.loadHomeData;
}
test('home summary uses validated context without selecting another accessible camporee',async()=>{
 const supabase=client();
 const context=await resolveCamporeeContext(supabase,{organizationId:org,camporeeId:camp});
 const load=await page(supabase,'lib/home-data.ts');
 const data=await load(context);
 assert.equal(data.camporee.id,camp);
 assert.equal(data.member.role,'viewer');
 assert.equal(data.totalTasks,1);
 assert.equal(data.completedTasks,1);
});
test('More shows selected event and does not grant organization administration from a global role',async()=>{
 const render=await page(client(),'app/more/page.tsx');
 const tree=await render({params:Promise.resolve({organizationId:org,camporeeId:camp})});
 const output=JSON.stringify(tree);assert.match(output,/Historial/);assert.match(output,/Archivado/);assert.doesNotMatch(output,/Usuarios y permisos|Otro evento/);
});
test('search results stay within explicitly selected camporee',async()=>{
 const render=await page(client(),'app/search/page.tsx');
 const tree=await render({params:Promise.resolve({organizationId:org,camporeeId:camp}),searchParams:Promise.resolve({q:'Historial'})});
 const output=JSON.stringify(tree);assert.equal(output.includes('Historial elegido'),true);assert.equal(output.includes('Otra organización'),false);
 assert.equal(tree.props.children.find(child=>child?.type==='form').props.action,`/o/${org}/c/${camp}/search`);
});
test('task page reads explicitly requested historical camporee instead of first accessible event',async()=>{
 const render=await page(client());
 const tree=await render({params:Promise.resolve({organizationId:org,camporeeId:camp}),searchParams:Promise.resolve({})});
 const manager=tree.props.children.find(child=>child?.props?.initialTasks);
 assert.equal(manager.props.camporeeId,camp);
 assert.equal(manager.props.initialTasks.length,1);
 assert.equal(manager.props.initialTasks[0].title,'Historial elegido');
 assert.equal(manager.props.canEdit,false);
});
function managerIn(node) {
 if(!node||typeof node!=='object')return null;
 if(node.props&&(node.props.camporeeId||node.props.camporee)&&typeof node.props.canEdit==='boolean')return node;
 const children=node.props?.children;
 for(const child of Array.isArray(children)?children:[children]) {const found=managerIn(child);if(found)return found;}
 return null;
}
for(const panel of ['program','more/activities','more/announcements','more/attendance','more/budget','more/documents','more/emergency','more/inventory','more/lists','more/meals','more/notes','more/participants','more/settings','more/songs']) {
 test(`${panel} uses requested camporee and organization permissions`,async()=>{
  const render=await page(client(),`app/${panel}/page.tsx`);
  const tree=await render({params:Promise.resolve({organizationId:org,camporeeId:camp}),searchParams:Promise.resolve({})});
  const manager=managerIn(tree);
  assert.ok(manager,`manager rendered for ${panel}`);
  assert.equal(manager.props.camporeeId??manager.props.camporee.id,camp);
  assert.equal(manager.props.canEdit,false);
 });
}
