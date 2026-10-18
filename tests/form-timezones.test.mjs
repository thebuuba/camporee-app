import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as locale from '../lib/camporee-locale.ts';
const {loadBindings,transform}=createRequire(import.meta.url)('next/dist/build/swc');

async function submit(path, props, fields) {
  await loadBindings();
  const {code}=await transform(await readFile(new URL(`../${path}`,import.meta.url),'utf8'),{filename:path,jsc:{parser:{syntax:'typescript',tsx:true},target:'es2022',transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}});
  let payload;
  let saved, failed;
  const finished=new Promise((resolve,reject)=>{saved=resolve;failed=reject});
  const jsx=(type,props)=>({type,props});
  const builder={insert(value){payload=value;return this},delete(){return this},eq(){return this},select(){return this},then(resolve){resolve({error:null})},async single(){return {data:{id:'created',...payload},error:null}}};
  const modules={react:{useState:value=>[value,()=>{}],useEffect(){},useMemo:fn=>fn()},'react/jsx-runtime':{jsx,jsxs:jsx},'next/navigation':{useRouter:()=>({refresh(){}})},'lucide-react':{},'@/app/components/bottom-sheet':'sheet','@/lib/camporee-locale':locale,'@/lib/supabase/client':{createClient:()=>({from:()=>builder})},'@/lib/client-ui':{reportMutationSuccess:saved,reportMutationError:failed,confirmRemoval:()=>false}};
  const module={exports:{}};
  vm.runInNewContext(code,{module,exports:module.exports,require:name=>modules[name],Date,Map,FormData:class {constructor(){return fields}}});
  const tree=module.exports.default({camporeeId:'camp',userId:'user',canEdit:true,initialTasks:[],initialSessions:[],initialActivities:[],areas:[],assignees:[],participants:[],...props});
  function find(node){if(!node||typeof node!=='object')return;if(node.type==='form')return node;for(const child of [node.props?.children].flat(Infinity)){const match=find(child);if(match)return match}}
  find(tree).props.onSubmit({preventDefault(){},currentTarget:{}});
  await finished;
  return payload;
}

test('la fecha límite de una tarea usa la zona del camporee, no la del dispositivo',{timeout:3000},async()=>{
  const fields=new FormData();fields.set('title','Preparar');fields.set('due_at','2027-01-02');
  for(const [timeZone,expected] of [['UTC','2027-01-02T00:00:00.000Z'],['Asia/Tokyo','2027-01-01T15:00:00.000Z']]){
    const payload=await submit('app/tasks/task-manager.tsx',{timeZone},fields);
    assert.equal(payload.due_at,expected);
  }
});

test('la hora del pase de lista se guarda en la zona del camporee',{timeout:3000},async()=>{
  const fields=new FormData();fields.set('title','Salida');fields.set('occurred_at','2027-01-02T09:30');
  for(const [timeZone,expected] of [['UTC','2027-01-02T09:30:00.000Z'],['Asia/Tokyo','2027-01-02T00:30:00.000Z']]){
    const payload=await submit('app/more/attendance/attendance-manager.tsx',{timeZone},fields);
    assert.equal(payload.occurred_at,expected);
  }
});

test('las competencias usan la misma zona horaria que Programa',{timeout:3000},async()=>{
  const fields=new FormData();fields.set('title','Marcha');fields.set('starts_at','2027-01-02T09:30');
  for(const [timeZone,expected] of [['UTC','2027-01-02T09:30:00.000Z'],['Asia/Tokyo','2027-01-02T00:30:00.000Z']]){
    const payload=await submit('app/more/activities/activity-manager.tsx',{timeZone},fields);
    assert.equal(payload.starts_at,expected);
  }
});
