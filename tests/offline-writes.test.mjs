import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const {loadBindings,transform}=createRequire(import.meta.url)('next/dist/build/swc');
const owner='10000000-0000-4000-8000-000000000001', org='50000000-0000-4000-8000-000000000001', camp='60000000-0000-4000-8000-000000000001';
const authorization='Bearer a.'+Buffer.from(JSON.stringify({sub:owner})).toString('base64url')+'.sig';
const base='https://test.supabase.co/rest/v1/';

async function client({online=false,storageBlocked=false,fetcher=async()=>{throw new TypeError('offline')}}={}) {
  await loadBindings();
  const {code}=await transform(await readFile(new URL('../lib/offline-fetch.ts',import.meta.url),'utf8'),{filename:'offline-fetch.ts',jsc:{parser:{syntax:'typescript'},target:'es2022'},module:{type:'commonjs'}});
  const rows=[];
  const request=result=>{const req={};queueMicrotask(()=>{req.result=result;req.onsuccess?.()});return req};
  const db={close(){},transaction(){const tx={objectStore:()=>({getAll:()=>request([...rows]),count:()=>request(rows.length),put(row){rows.push(row);queueMicrotask(()=>tx.oncomplete?.())},delete(id){rows.splice(rows.findIndex(row=>row.id===id),1);queueMicrotask(()=>tx.oncomplete?.())}})};return tx}};
  const navigator={onLine:online};const module={exports:{}};
  const location={pathname:`/o/${org}/c/${camp}/tasks`};
  vm.runInNewContext(code,{module,exports:module.exports,Request,Response,Headers,URL,crypto,atob,fetch:fetcher,navigator,indexedDB:{open:()=>{if(storageBlocked)throw Object.assign(new Error('Storage blocked'),{name:'SecurityError'});return request(db)}},window:{location,dispatchEvent(){}},CustomEvent:class{}});
  const write=(path,payload,method='POST')=>module.exports.camporeeFetch(base+path,{method,headers:{authorization,'content-type':'application/json'},body:JSON.stringify(payload)});
  return {...module.exports,rows,navigator,write,location};
}

test('un RPC sin conexión falla y no se presenta como una operación guardada',async()=>{
  const api=await client();
  await assert.rejects(api.write('rpc/register_camporee_push',{target_camporee:camp}),/offline/);
  assert.equal(api.rows.length,0);
});

test('una inserción offline de varias filas mantiene una respuesta plana',async()=>{
  const api=await client();
  const payload=[{session_id:'session',participant_id:'one',present:true},{session_id:'session',participant_id:'two',present:true}];
  const response=await api.write('attendance_marks',payload);
  assert.deepEqual(await response.json(),payload);
  assert.equal(api.rows.length,1);
});

test('al recuperar conexión se guarda primero el cambio pendiente y luego el nuevo',async()=>{
  const sent=[];
  const api=await client({fetcher:async(input,init)=>{sent.push(JSON.parse(input instanceof Request?await input.clone().text():init.body).title);return new Response(null,{status:204})}});
  await api.write('tasks?id=eq.task',{title:'anterior'},'PATCH');
  api.navigator.onLine=true;
  await api.write('tasks?id=eq.task',{title:'nuevo'},'PATCH');
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(sent,['anterior','nuevo']);
  assert.equal(api.rows.length,0);
});

test('un conflicto pendiente conserva también la nueva edición en orden',async()=>{
  const sent=[];
  const api=await client({fetcher:async(input,init)=>{sent.push(JSON.parse(input instanceof Request?await input.clone().text():init.body).title);return new Response(null,{status:409})}});
  await api.write('tasks?id=eq.task',{title:'anterior'},'PATCH');
  api.navigator.onLine=true;
  const response=await api.write('tasks?id=eq.task',{title:'nuevo'},'PATCH');
  assert.equal(response.headers.get('x-camporee-offline'),'queued');
  assert.deepEqual(sent,['anterior']);
  assert.deepEqual(api.rows.map(row=>JSON.parse(row.body).title),['anterior','nuevo']);
});

test('una edición espera un replay que ya estaba en curso',async()=>{
  let release;const gate=new Promise(resolve=>{release=resolve});const sent=[];
  const api=await client({fetcher:async(input,init)=>{const title=JSON.parse(input instanceof Request?await input.clone().text():init.body).title;sent.push(title);if(title==='anterior')await gate;return new Response(null,{status:204})}});
  await api.write('tasks?id=eq.task',{title:'anterior'},'PATCH');api.navigator.onLine=true;
  const replay=api.flushOfflineWrites(authorization);
  await new Promise(resolve=>setImmediate(resolve));
  const write=api.write('tasks?id=eq.task',{title:'nuevo'},'PATCH');
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(sent,['anterior']);release();
  await Promise.all([replay,write]);
  assert.deepEqual(sent,['anterior','nuevo']);assert.equal(api.rows.length,0);
});

test('un cambio de camporee durante un error de red no cambia el dueño del pendiente',async()=>{
  let fail;const network=new Promise((_,reject)=>{fail=reject});
  const api=await client({online:true,fetcher:()=>network});
  const pending=api.write('tasks?id=eq.task',{title:'cambio'},'PATCH');
  await new Promise(resolve=>setImmediate(resolve));
  api.location.pathname=`/o/${org}/c/60000000-0000-4000-8000-000000000002/tasks`;
  fail(new TypeError('lost connection'));await pending;
  assert.equal(api.rows[0].camporeeId,camp);
});

test('el navegador que bloquea IndexedDB todavía puede guardar con conexión',async()=>{
  let sent=0;
  const api=await client({online:true,storageBlocked:true,fetcher:async()=>{sent++;return new Response(null,{status:204})}});
  assert.equal((await api.write('tasks?id=eq.task',{title:'nuevo'},'PATCH')).status,204);
  assert.equal(sent,1);
});
