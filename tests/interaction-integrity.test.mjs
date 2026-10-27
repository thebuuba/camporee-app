import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as locale from '../lib/camporee-locale.ts';
const {loadBindings,transform}=createRequire(import.meta.url)('next/dist/build/swc');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
export function all(node,predicate){if(Array.isArray(node))return node.flatMap(child=>all(child,predicate));if(!node||typeof node!=='object')return [];return [...(predicate(node)?[node]:[]),...all(node.props?.children,predicate)];}
async function optional(path){try{return await import(path)}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;return {}}}
async function ui(path,props,client,overrides={}){
  await loadBindings();const {code}=await transform(await readFile(path,'utf8'),{filename:path,jsc:{parser:{syntax:'typescript',tsx:true},target:'es2022',transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}});
  const states=[],errors=[],successes=[];let cursor=0;const jsx=(type,props)=>({type,props});
  const modules={react:{useEffect(){},useMemo:fn=>fn(),useState(initial){const index=cursor++;if(!(index in states))states[index]=index in overrides?overrides[index]:typeof initial==='function'?initial():initial;return [states[index],value=>states[index]=typeof value==='function'?value(states[index]):value]}},'react/jsx-runtime':{jsx,jsxs:jsx},'next/navigation':{useRouter:()=>({refresh(){}})},'@/lib/camporee-locale':locale,'@/lib/supabase/client':{createClient:()=>client},'@/lib/client-ui':{confirmRemoval:()=>true,reportMutationError:(error,message)=>{errors.push({error,message});return message},reportMutationSuccess:message=>successes.push(message)},'@/lib/mutation-result':await optional('../lib/mutation-result.ts'),'@/lib/meal-stock':await optional('../lib/meal-stock.ts'),'@/app/components/bottom-sheet':{__esModule:true,default:'sheet'},'lucide-react':{}};
  const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,require:name=>modules[name],Date,Map,Set,Promise,console});
  return {render(){cursor=0;return module.exports.default(props)},states,errors,successes};
}
function attendance(client,people=[{id:'person',full_name:'Ana'}]){return ui('app/more/attendance/attendance-manager.tsx',{camporeeId:'camp',userId:'user',canEdit:true,participants:people,initialSessions:[{id:'session',title:'Salida',occurred_at:'2026-10-27T12:00:00Z',attendance_marks:[]}]},client)}
function openAttendance(app){all(app.render(),n=>n.props.className?.includes('attendance-session-row'))[0].props.onClick();return ()=>all(app.render(),n=>n.type==='button'&&n.props.className?.includes('attendance-person'))[0]}

test('attendance serializes writes and preserves the final accepted choice',async()=>{
  const pending=[];let stored=false;
  const app=await attendance({from:()=>({upsert(payload){return {select(){return this},single:()=>new Promise(resolve=>pending.push({payload,finish(){stored=payload.present;resolve({data:{id:'mark',...payload},error:null,status:200})}}))}}})});
  const button=openAttendance(app);const first=button().props.onClick();await tick();const second=button().props.onClick();await tick();
  assert.equal(pending.length,1,'second request must wait for first response');
  pending[0].finish();await first;await tick();assert.equal(pending.length,2);assert.equal(app.states[1].attendance_marks[0].present,false,'older response must not replace latest choice');
  pending[1].finish();await second;assert.equal(stored,false);assert.equal(app.states[1].attendance_marks[0].present,false);
});
test('bulk attendance waits for pending individual writes and confirms every participant',async()=>{
  const pending=[];
  const app=await attendance({from:()=>({upsert(payload){const request={select(){return this},single(){return this},then(resolve){return new Promise(done=>pending.push({payload,finish(){const data=Array.isArray(payload)?payload.map((row,i)=>({id:`m${i}`,...row})):{id:'mark',...payload};resolve({data,error:null,status:200});done()}}))}};return request}})},[{id:'person',full_name:'Ana'},{id:'person2',full_name:'Bea'}]);
  const button=openAttendance(app);const first=button().props.onClick();await tick();const bulk=all(app.render(),n=>n.type==='button'&&n.props.className?.includes('attendance-mark-all'))[0].props.onClick();await tick();
  assert.equal(pending.length,1,'bulk must not race individual upsert');pending[0].finish();await first;await tick();assert.equal(pending.length,2);pending[1].finish();await bulk;
  assert.equal(app.states[1].attendance_marks.filter(mark=>mark.present).length,2);assert.equal(app.errors.length,0);
});
for(const [status,data,success] of [[200,[],false],[202,{id:'person'},true],[200,{id:'other'},false]])test(`participant deletion requires expected row and distinguishes status ${status} ${JSON.stringify(data)}`,async()=>{
  const scopes=[];const response={data,error:null,status};const builder={eq(key,value){scopes.push([key,value]);return this},select(){return this},single:async()=>response,then(resolve){return Promise.resolve(response).then(resolve)}};
  const app=await ui('app/more/participants/participant-manager.tsx',{camporeeId:'camp',canEdit:true,initialParticipants:[{id:'person',full_name:'Ana',attendance_status:'confirmed',unit_name:'Unidad'}]},{from:()=>({delete:()=>builder})});
  await all(app.render(),n=>n.props['aria-label']==='Eliminar Ana')[0].props.onClick();
  assert.equal(app.states[0].length,success?0:1);assert.equal(app.errors.length,success?0:1);assert.ok(scopes.some(([key,value])=>key==='camporee_id'&&value==='camp'));
  if(status===202){assert.match(app.successes[0],/pendiente/i);assert.doesNotMatch(app.successes[0],/eliminado/i)}else assert.equal(app.successes.length,0);
});

test('meal stock is allocated once across dates and stable meal ids',async()=>{
  const props={camporeeId:'camp',canEdit:false,canEditLists:false,initialLists:[],inventory:[{id:'rice',quantity:5,unit:'kg'}],initialMeals:['b','a'].map(id=>({id,meal_date:'2026-10-27',meal_type:'lunch',menu:id,meal_ingredients:[{id:`ingredient-${id}`,name:'Arroz',required_quantity:4,inventory_item_id:'rice',unit:'kg'}]}))};
  const app=await ui('app/more/meals/meal-manager.tsx',props,{});const tree=app.render();assert.equal(all(tree,n=>n.type==='em'&&n.props.className==='pm-missing').length,1);
  const missing=all(tree,n=>n.type==='span'&&n.props.className==='pm-missing');assert.equal(missing.length,1);assert.match(JSON.stringify(missing[0].props.children),/3/);
});
test('incompatible food units are shown as unverified rather than complete',async()=>{
  const app=await ui('app/more/meals/meal-manager.tsx',{camporeeId:'camp',canEdit:false,canEditLists:false,initialLists:[],inventory:[{id:'rice',quantity:100,unit:'cajas'}],initialMeals:[{id:'meal',meal_date:'2026-10-27',meal_type:'lunch',menu:'Arroz',meal_ingredients:[{id:'ingredient',name:'Arroz',required_quantity:4,inventory_item_id:'rice',unit:'kg'}]}]},{});
  assert.match(JSON.stringify(app.render()),/Unidades incompatibles/);assert.equal(all(app.render(),n=>n.props.className==='pm-complete').length,0);
});
