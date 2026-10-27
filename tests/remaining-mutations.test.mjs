import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as mutation from '../lib/mutation-result.ts';
import * as dates from '../lib/date.ts';
import * as locale from '../lib/camporee-locale.ts';
const { loadBindings, transform } = createRequire(import.meta.url)('next/dist/build/swc');
const row={id:'row',title:'Example',name:'Example',body:'Text',label:'Item',description:'Expense',amount:10,spent_on:'2026-10-27',starts_at:'2026-10-27T14:00:00Z',created_at:'2026-10-27',file_path:'camp/file',priority:0,is_done:false};
function find(node,predicate){
  if(!node||typeof node!=='object')return;
  if(predicate(node))return node;
  for(const child of [node.props?.children].flat(Infinity)){const found=find(child,predicate);if(found)return found;}
}
async function harness(path,{result={data:[],error:null,status:200},props={},fields={},overrides={}}={}){
  await loadBindings();
  const {code}=await transform(await readFile(new URL('../'+path,import.meta.url),'utf8'),{filename:path,jsc:{parser:{syntax:'typescript',tsx:true},target:'es2022',transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}});
  const states=[],calls=[],success=[],errors=[],removed=[],uploads=[];let pointer=0,refreshes=0;
  const react={useEffect(){},useMemo:fn=>fn(),useRef:()=>({current:null}),useState(initial){const index=pointer++;if(!(index in states))states[index]=index in overrides?overrides[index]:typeof initial==='function'?initial():initial;return [states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value}];}};
  const supabase={from(table){const b={};for(const method of ['insert','update','delete','eq','select'])b[method]=(...args)=>{calls.push([table,method,...args]);return b};b.single=async()=>result;b.then=(resolve,reject)=>Promise.resolve(result).then(resolve,reject);return b},storage:{from:()=>({remove:async paths=>{removed.push(...paths);return {error:null}},upload:async(path,file,options)=>{uploads.push({path,options});return {error:null}},createSignedUrl:async()=>({data:{signedUrl:'https://signed/new'},error:null})})}};
  const jsx=(type,props)=>({type,props:props??{}}),module={exports:{}};
  const modules={react,'react/jsx-runtime':{jsx,jsxs:jsx},'next/navigation':{useRouter:()=>({refresh(){refreshes++},replace(){refreshes++}})},'@/lib/supabase/client':{createClient:()=>supabase},'@/lib/mutation-result':mutation,'@/lib/client-ui':{confirmRemoval:()=>true,reportMutationSuccess:message=>success.push(message),reportMutationError:(error,fallback)=>{errors.push(error);return error?.message??fallback}},'@/lib/date':dates,'@/lib/camporee-locale':locale,'@/app/components/theme-provider':{useTheme:()=>({dark:false,setPreference(){}})}};
  vm.runInNewContext(code,{module,exports:module.exports,require:name=>modules[name]??{},File,FormData:class{constructor(){return new Map(Object.entries(fields))}},crypto:{randomUUID:()=> 'new-avatar'},console});
  const defaults={camporeeId:'camp',userId:'user',canEdit:true,initialAnnouncements:[row],initialNotes:[row],initialContacts:[row],initialEvents:[row],initialDocuments:[row],initialExpenses:[row],initialIncome:[],initialItems:[row],initialLists:[],areas:[],currency:'DOP',timeZone:'America/La_Paz',listId:'list',backHref:'/lists',camporee:{id:'camp',status:'planning'},fullName:'Ana',email:'ana@test',initialAvatarPath:'user/avatar',initialAvatarUrl:'https://signed/old'};
  const render=()=>{pointer=0;return module.exports.default({...defaults,...props})};
  return {render,states,calls,success,errors,removed,uploads,get refreshes(){return refreshes}};
}
const deletes=[
  ['app/more/announcements/announcement-manager.tsx',n=>n.props?.['aria-label']==='Eliminar aviso','onClick'],
  ['app/more/notes/notes-manager.tsx',n=>n.props?.['aria-label']==='Eliminar apunte','onClick'],
  ['app/more/emergency/emergency-manager.tsx',n=>typeof n.props?.onRemove==='function','onRemove'],
  ['app/program/program-manager.tsx',n=>n.props?.['aria-label']==='Eliminar','onClick'],
  ['app/more/documents/document-manager.tsx',n=>n.props?.['aria-label']==='Eliminar Example','onClick'],
  ['app/more/budget/budget-manager.tsx',n=>n.props?.['aria-label']==='Eliminar','onClick'],
  ['app/more/lists/[listId]/list-detail-manager.tsx',n=>String(n.props?.['aria-label']??'').startsWith('Eliminar'),'onClick'],
];
for(const [path,predicate,action] of deletes){
  test(`${path}: zero affected delete preserves row and does not report success`,async()=>{
    const h=await harness(path);const button=find(h.render(),predicate);assert.ok(button,'delete control');await button.props[action]();await new Promise(setImmediate);
    assert.equal(h.success.length,0);assert.equal(h.errors.length,1);assert.equal(h.states[0].length,1);assert.equal(h.removed.length,0);assert.equal(h.refreshes,0);
  });
  test(`${path}: queued delete reports pending and preserves stored files`,async()=>{
    const h=await harness(path,{result:{data:[{id:'row'}],error:null,status:202}});await find(h.render(),predicate).props[action]();await new Promise(setImmediate);
    assert.match(h.success[0],/pendiente/i);assert.equal(h.removed.length,0);assert.equal(h.refreshes,0);
  });
}
test('settings zero-row update preserves the form without saved state',async()=>{
  const h=await harness('app/more/settings/settings-form.tsx',{fields:{name:'Camp',starts_on:'2026-10-01',ends_on:'2026-10-31'}});
  find(h.render(),n=>n.type==='form').props.onSubmit({preventDefault(){},currentTarget:{}});await new Promise(setImmediate);
  assert.equal(h.states[1],false);assert.equal(h.success.length,0);assert.equal(h.errors.length,1);
});
for(const action of ['save','remove','upload'])test(`profile ${action}: zero-row database update preserves old avatar and does not claim success`,async()=>{
  const h=await harness('app/profile/profile-client.tsx');const tree=h.render();
  if(action==='save')await find(tree,n=>n.type==='form').props.onSubmit({preventDefault(){}});
  if(action==='remove')await find(tree,n=>n.props?.onClick&&n.props?.className==='profile-remove-btn').props.onClick();
  if(action==='upload')await find(tree,n=>n.type==='input'&&n.props?.type==='file').props.onChange({target:{files:[{type:'image/png',size:100}],value:'x'}});
  assert.equal(h.success.length,0);assert.equal(h.errors.length,1);assert.equal(h.states[0],'https://signed/old');assert.equal(h.removed.includes('user/avatar'),false);
  if(action==='upload'){assert.notEqual(h.uploads[0].path,'user/avatar');assert.equal(h.uploads[0].options.upsert,false);}
});

const forms=[
  ['app/more/notes/notes-manager.tsx',{body:'Text'},1],
  ['app/more/emergency/emergency-manager.tsx',{name:'Name'},1],
  ['app/program/program-manager.tsx',{title:'Event',starts_at:'2026-10-27T10:00'},1],
  ['app/more/budget/budget-manager.tsx',{description:'Expense',amount:'10'},2],
  ['app/more/documents/document-manager.tsx',{title:'Document'},1],
  ['app/more/lists/list-manager.tsx',{title:'List'},2],
  ['app/more/lists/[listId]/list-detail-manager.tsx',{label:'Item'},1],
];
for(const [path,fields,openIndex] of forms)for(const queued of [false,true])test(`${path}: ${queued?'queued save reports pending':'empty save response keeps form and original rows'}`,async()=>{
  const h=await harness(path,{fields,overrides:{[openIndex]:true},result:{data:queued?row:null,error:null,status:queued?202:200}});
  find(h.render(),n=>n.type==='form').props.onSubmit({preventDefault(){},currentTarget:{reset(){}}});await new Promise(setImmediate);
  if(queued){assert.match(h.success[0],/pendiente/i);assert.equal(h.errors.length,0);assert.equal(h.refreshes,0)}
  else{assert.equal(h.success.length,0);assert.equal(h.errors.length,1);assert.equal(h.states[openIndex],true);assert.equal(h.refreshes,0)}
});
for(const action of ['remove','upload'])test(`profile queued ${action} keeps stored original and reports pending`,async()=>{
  const h=await harness('app/profile/profile-client.tsx',{result:{data:[{id:'user'}],error:null,status:202}});const tree=h.render();
  if(action==='remove')await find(tree,n=>n.props?.className==='profile-remove-btn').props.onClick();
  else await find(tree,n=>n.type==='input'&&n.props?.type==='file').props.onChange({target:{files:[{type:'image/png',size:100}],value:'x'}});
  assert.match(h.success[0],/pendiente/i);assert.equal(h.removed.length,0);assert.equal(h.refreshes,0);
});
test('settings queued update does not present the confirmed saved banner',async()=>{
  const h=await harness('app/more/settings/settings-form.tsx',{fields:{name:'Camp',starts_on:'2026-10-01',ends_on:'2026-10-31'},result:{data:[{id:'camp'}],error:null,status:202}});
  find(h.render(),n=>n.type==='form').props.onSubmit({preventDefault(){},currentTarget:{}});await new Promise(setImmediate);
  assert.equal(h.states[1],false);assert.match(h.success[0],/pendiente/i);assert.equal(h.refreshes,0);
});
for(const kind of ['expense','income'])test(`budget ${kind} edit rejects a different returned ID and scopes the update`,async()=>{
  const h=await harness('app/more/budget/budget-manager.tsx',{fields:{description:'Edited',amount:'20'},overrides:{2:true,3:kind,4:row},result:{data:{...row,id:'other'},error:null,status:200}});
  find(h.render(),n=>n.type==='form').props.onSubmit({preventDefault(){},currentTarget:{}});await new Promise(setImmediate);
  assert.equal(h.success.length,0);assert.equal(h.errors.length,1);assert.equal(h.states[2],true);assert.equal(h.states[0][0].amount,10);
  assert.equal(h.calls.filter(([,method,key,value])=>method==='eq'&&key==='camporee_id'&&value==='camp').length,1);
});
for(const [label,selector] of [['toggle','pm-check'],['remove list','pm-list-remove-list']])test(`list ${label} with zero affected rows leaves content and navigation intact`,async()=>{
  const h=await harness('app/more/lists/[listId]/list-detail-manager.tsx');find(h.render(),n=>n.props?.className===selector).props.onClick();await new Promise(setImmediate);
  assert.equal(h.states[0][0].is_done,false);assert.equal(h.success.length,0);assert.equal(h.errors.length,1);assert.equal(h.refreshes,0);
});
for(const [label,selector,id] of [['toggle','pm-check','row'],['remove list','pm-list-remove-list','list']])test(`queued list ${label} does not refresh or navigate to stale server data`,async()=>{
  const h=await harness('app/more/lists/[listId]/list-detail-manager.tsx',{result:{data:[{id}],error:null,status:202}});find(h.render(),n=>n.props?.className===selector).props.onClick();await new Promise(setImmediate);
  assert.match(h.success[0],/pendiente/i);assert.equal(h.errors.length,0);assert.equal(h.refreshes,0);
});
