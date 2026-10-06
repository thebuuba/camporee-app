import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dateKeyInTimeZone, dateOnlyDistance } from '../lib/date.ts';
import { camporeePhase, preparationProgress } from '../lib/camporee-preparation.ts';

const { loadBindings, transform } = createRequire(import.meta.url)('next/dist/build/swc');
async function loadModule(path, modules = {}, globals = {}) {
  await loadBindings();
  const { code } = await transform(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'), {
    filename:path, jsc:{parser:{syntax:'typescript',tsx:true},target:'es2022',transform:{react:{runtime:'automatic'}}}, module:{type:'commonjs'},
  });
  const module = {exports:{}};
  vm.runInNewContext(code, {module,exports:module.exports,require:name => modules[name],console,setTimeout,...globals});
  return module.exports;
}

function homeClient(taskError = null) {
  const rows = {
    profiles:{full_name:'Ana',avatar_url:null}, app_members:{role:'admin',is_active:true},
    camporees:[{id:'event',name:'Camporee',starts_on:'2026-11-06',ends_on:'2026-11-09',status:'planning'}],
    tasks:[{id:'task',title:'Preparar',phase:'before',status:'done',priority:'normal',due_at:null}],
    participants:[], expenses:[], income_entries:[], schedule_events:[],
  };
  return {auth:{getUser:async()=>({data:{user:{id:'user',user_metadata:{}}},error:null})},from(table){
    const builder = {select(){return this},eq(){return this},order(){return this},maybeSingle(){return this},then(resolve,reject){
      return new Promise(done => setTimeout(()=>done({data:taskError && table==='tasks' ? null : rows[table],error:table==='tasks'?taskError:null}), table==='tasks'?35:0)).then(resolve,reject);
    }};
    return builder;
  }};
}

async function loadHome(client) {
  return loadModule('lib/home-data.ts', {
    '@/lib/supabase/server':{createClient:async()=>client},
    '@/lib/date':{dateKeyInTimeZone,dateOnlyDistance},
    '@/lib/camporee-preparation':{camporeePhase,preparationProgress},
  }, {setTimeout:(callback,ms)=>setTimeout(callback,ms>=1200?1:ms)});
}

test('Inicio espera una consulta lenta sin convertir tareas reales en ceros', async () => {
  const {loadHomeData} = await loadHome(homeClient());
  const data = await loadHomeData();
  assert.equal(data.totalTasks,1);
  assert.equal(data.completedTasks,1);
  assert.equal(data.preparation.percent,100);
});

test('Inicio comunica un error de datos en vez de mostrar un resumen vacío', async () => {
  const {loadHomeData} = await loadHome(homeClient({message:'network unavailable'}));
  await assert.rejects(loadHomeData(), /network unavailable/);
});

test('un fallo temporal de autenticación no convierte una sesión en cierre de sesión', async () => {
  const client = homeClient();
  client.auth.getUser = async () => ({ data: { user: null }, error: Object.assign(new Error('Auth unavailable'), { name: 'AuthRetryableFetchError', status: 503 }) });
  const { loadHomeData } = await loadHome(client);
  await assert.rejects(loadHomeData(), /Auth unavailable/);
});

test('Inicio sin una sesión sigue solicitando iniciar sesión', async () => {
  const client = homeClient();
  client.auth.getUser = async () => ({ data: { user: null }, error: null });
  const { loadHomeData } = await loadHome(client);
  assert.equal(await loadHomeData(), null);
});

async function offlineQueue(initialRows, status = 204) {
  const rows = [...initialRows];
  const events = [];
  const request = value => {const req={}; queueMicrotask(()=>{req.result=value;req.onsuccess?.()});return req};
  const db = {close(){},transaction(){
    const tx={objectStore:()=>({getAll:()=>request([...rows]),count:()=>request(rows.length),delete(id){rows.splice(rows.findIndex(row=>row.id===id),1);queueMicrotask(()=>tx.oncomplete?.())}})};
    return tx;
  }};
  const api = await loadModule('lib/offline-fetch.ts', {}, {
    indexedDB:{open:()=>request(db)}, navigator:{onLine:true},
    window:{addEventListener(){},dispatchEvent:event=>events.push(event.type)},
    CustomEvent:class {constructor(type){this.type=type}}, Headers,
    fetch:async()=>new Response(null,{status}),
  });
  return {api,events};
}

test('sin cambios pendientes no se dispara un refresco de sincronización', async () => {
  const {api,events} = await offlineQueue([]);
  await api.flushOfflineWrites('Bearer test');
  assert.equal(events.includes('camporee:queue-flushed'),false);
});

test('una cola real completada avisa para recargar los datos una vez', async () => {
  const {api,events} = await offlineQueue([{id:'one',url:'https://test.supabase.co/rest/v1/tasks',method:'PATCH',headers:[],body:'{}',createdAt:1}]);
  assert.equal((await api.flushOfflineWrites('Bearer test')).remaining,0);
  assert.equal(events.filter(type=>type==='camporee:queue-flushed').length,1);
});

test('un error del servidor conserva los cambios pendientes para reintentar', async () => {
  const {api,events} = await offlineQueue([{id:'one',url:'https://test.supabase.co/rest/v1/tasks',method:'PATCH',headers:[],body:'{}',createdAt:1}], 503);
  const result = await api.flushOfflineWrites('Bearer test');
  assert.equal(result.remaining,1);
  assert.equal(result.failed,true);
  assert.equal(events.includes('camporee:queue-flushed'),false);
  assert.equal(events.includes('camporee:sync-error'),true);
});

function findElement(node, predicate) {
  if (!node || typeof node !== 'object') return undefined;
  if (predicate(node)) return node;
  const children = node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const match = findElement(child, predicate);
    if (match) return match;
  }
}

async function saveActivityInTest(editing, fields, program = false) {
  let payload;
  let resolveSaved, rejectSaved;
  const saved = new Promise((resolve,reject)=>{resolveSaved=resolve;rejectSaved=reject});
  const supabase = {from(table){
    if (table === 'camporee_activity_participants') return {delete:()=>({eq:async()=>({error:null})})};
    assert.equal(table,program ? 'schedule_events' : 'camporee_activities');
    const builder = {insert(value){payload=value;return this},update(value){payload=value;return this},eq(){return this},select(){return this},single:async()=>({data:{id:editing?.id??'new',...payload,schedule_event_id:null},error:null})};
    return builder;
  }};
  let stateIndex=0;
  const jsx=(type,props)=>({type,props:props??{}});
  const {default:ActivityManager} = await loadModule(program ? 'app/program/program-manager.tsx' : 'app/more/activities/activity-manager.tsx', {
    'react/jsx-runtime':{jsx,jsxs:jsx},
    react:{useEffect(){},useMemo:callback=>callback(),useState(value){const index=stateIndex++;return [index===2?editing:value,()=>{}]}},
    'next/navigation':{useRouter:()=>({refresh(){}})},
    'lucide-react':{}, '@/app/components/bottom-sheet':()=>null,
    '@/lib/supabase/client':{createClient:()=>supabase},
    '@/lib/client-ui':{confirmRemoval:()=>false,reportMutationError:rejectSaved,reportMutationSuccess:resolveSaved},
  }, {FormData:class {constructor(){return fields}}});
  const tree=ActivityManager({camporeeId:'event',canEdit:true,initialActivities:[],participants:[],initialEvents:[],areas:[]});
  const form=findElement(tree,node=>node.type==='form');
  const location=findElement(form,node=>node.type==='input'&&node.props.name==='location');
  form.props.onSubmit({preventDefault(){},currentTarget:{}});
  await saved;
  return {payload,location};
}

test('Nueva actividad guarda sin Lugar y mantiene los demás datos', {timeout:2000}, async () => {
  const fields=new FormData(); fields.set('title','Marcha');fields.set('responsible_name','Ana');fields.set('score','12');
  const {payload,location}=await saveActivityInTest(null,fields);
  assert.equal(location,undefined);
  assert.equal(payload.location,null);
  assert.equal(payload.title,'Marcha');
  assert.equal(payload.responsible_name,'Ana');
  assert.equal(payload.score,12);
});

test('editar sin enviar Lugar conserva la ubicación anterior', {timeout:2000}, async () => {
  const fields=new FormData();fields.set('title','Marcha actualizada');
  const {payload,location}=await saveActivityInTest({id:'old',location:'Cancha'},fields);
  assert.equal(location.props.defaultValue,'Cancha');
  assert.equal(payload.location,'Cancha');
});

test('Nueva actividad de Programa no muestra Lugar y guarda horario y responsable', {timeout:2000}, async () => {
  const fields=new FormData();fields.set('title','Culto');fields.set('starts_at','2026-11-06T09:00');fields.set('ends_at','2026-11-06T10:00');fields.set('responsible_name','Ana');
  const {payload,location}=await saveActivityInTest(null,fields,true);
  assert.equal(location,undefined);
  assert.equal(payload.location,null);
  assert.equal(payload.title,'Culto');
  assert.equal(payload.starts_at,new Date('2026-11-06T09:00').toISOString());
  assert.equal(payload.ends_at,new Date('2026-11-06T10:00').toISOString());
  assert.equal(payload.responsible_name,'Ana');
});

test('editar Programa conserva el lugar anterior si no se envía', {timeout:2000}, async () => {
  const fields=new FormData();fields.set('title','Culto');fields.set('starts_at','2026-11-06T09:00');
  const {payload,location}=await saveActivityInTest({id:'old',location:'Capilla'},fields,true);
  assert.equal(location.props.defaultValue,'Capilla');
  assert.equal(payload.location,'Capilla');
});
