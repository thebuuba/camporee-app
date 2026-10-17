import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tenantPath} from '../lib/tenant-context.ts';
const {loadBindings,transform}=createRequire(import.meta.url)('next/dist/build/swc');

const organizationId='50000000-0000-4000-8000-000000000001';
const camporeeId='60000000-0000-4000-8000-000000000001';
const prefix='/o/'+organizationId+'/c/'+camporeeId;

async function dashboard(phase) {
  await loadBindings();
  const path='app/home-dashboard.tsx';
  const {code}=await transform(await readFile(new URL('../'+path,import.meta.url),'utf8'), {
    filename:path,
    jsc:{parser:{syntax:'typescript',tsx:true},target:'es2022',transform:{react:{runtime:'automatic'}}},
    module:{type:'commonjs'}
  });
  const module={exports:{}};
  const jsx=(type,props)=>({type,props});
  const dependencies={
    'react/jsx-runtime':{jsx,jsxs:jsx},
    '@/app/components/tenant-link':{default:'tenant-link'},
    '@/app/components/sync-status':{default:'sync-status'},
    'lucide-react':{},
    './components/bottom-nav':{default:'bottom-nav'},
    './components/notification-controls':{default:'notification-controls'},
    './components/preparation-card':{default:'preparation-card'},
    './components/closing-card':{default:'closing-card'},
    '@/lib/camporee-locale':{formatCamporeeMoney:n=>String(n)},
    '@/lib/tenant-context':{tenantPath}
  };
  vm.runInNewContext(code,{module,exports:module.exports,require:name=>dependencies[name],console});
  const props={
    organizationId,userId:'user',firstName:'Ana',avatarUrl:null,
    camporee:{id:camporeeId,name:'Camporee',location:null,status:'planning',starts_on:'2026-12-01',ends_on:'2026-12-04',currency:'DOP',time_zone:'America/Santo_Domingo'},
    days:10,progress:15,pendingTasks:3,completedTasks:1,totalTasks:4,todayPendingTasks:0,
    participants:4,presentParticipants:0,totalExpenses:0,totalIncome:0,phase,
    dayNumber:null,totalDays:4,programCount:0,todayProgramCount:0,currentEvent:null,nextEvent:null,
    todayTasks:[],urgentAnnouncement:null,preparation:{completed:1,total:4,percent:25},initialNow:0
  };
  return module.exports.default(props);
}
function walk(node,predicate,results=[]) {
  if(!node||typeof node!=='object')return results;
  if(predicate(node))results.push(node);
  const children=node.props?.children;
  for(const child of Array.isArray(children)?children:[children])walk(child,predicate,results);
  return results;
}
test('four mobile shortcuts in Inicio use native anchors and preserve their home origin',async()=>{
 const tree=await dashboard('before');
 const quick=walk(tree,node=>node.type==='section'&&node.props.className==='polymet-quick')[0];
 assert.ok(quick);
 const anchors=walk(quick,node=>node.type==='a');
 assert.equal(anchors.length,4);
 assert.deepEqual(Array.from(anchors,a=>a.props.href),[
  prefix+'/more/lists?from=home',
  prefix+'/more/participants?from=home',
  prefix+'/more/budget?from=home',
  prefix+'/more/documents?from=home'
 ]);
 assert.ok(anchors.every(a=>a.props.href.startsWith(prefix+'/more/')));
 const summary=walk(tree,node=>node.type==='a'&&node.props.className==='polymet-summary-card');
 assert.ok(summary.some(a=>a.props.href===prefix+'/more/participants?from=home'));
 assert.ok(summary.some(a=>a.props.href===prefix+'/more/budget?from=home'));
});
test('other home phases also retain the page they came from',async()=>{
 for(const phase of ['during','after']){
  const tree=await dashboard(phase);
  const quick=walk(tree,node=>node.type==='section'&&node.props.className==='polymet-quick')[0];
  const anchors=walk(quick,node=>node.type==='a');
  assert.equal(anchors.length,4);
  assert.ok(anchors.every(a=>a.props.href.startsWith(prefix+'/more/')&&a.props.href.endsWith('?from=home')));
 }
});
test('quick-access hit targets occupy the full grid cell even before hydration',async()=>{
 const css=await readFile(new URL('../app/home-shortcuts.css',import.meta.url),'utf8');
 assert.match(css,/\.polymet-home \.polymet-quick > a\s*\{[^}]*display:\s*flex/);
 assert.match(css,/\.polymet-home \.polymet-quick > a\s*\{[^}]*min-height:\s*107px/s);
 assert.match(css,/touch-action:\s*manipulation/);
});
