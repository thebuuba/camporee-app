import {deliveryRpc} from './helpers/delivery-rpc.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const {loadBindings,transform}=createRequire(import.meta.url)('next/dist/build/swc');

// America/Santo_Domingo is UTC-4: a run at 13:00Z is 09:00 local.
const MORNING='2026-10-15T13:00:00.000Z';

function defaultRows(){
  return {
    system_cron_secrets:[{key:'camporee_reminders',secret:'trusted'}],
    camporees:[{id:'camp',organization_id:'club',name:'Club',status:'active',time_zone:'America/Santo_Domingo'}],
    schedule_events:[],
    organization_members:[
      {organization_id:'club',user_id:'ana',is_active:true},
      {organization_id:'club',user_id:'inactive',is_active:false},
      {organization_id:'club',user_id:'bob',is_active:true},
      {organization_id:'other',user_id:'outsider',is_active:true},
    ],
    tasks:[
      {id:'t1',camporee_id:'camp',title:'Comprar alimentos',due_at:'2026-10-14T15:00:00.000Z',assigned_to:'ana',status:'pending'},
      {id:'t2',camporee_id:'camp',title:'Confirmar transporte',due_at:'2026-10-15T00:30:00.000Z',assigned_to:'ana',status:'in_progress'},
      {id:'t3',camporee_id:'camp',title:'Revisar inventario',due_at:'2026-10-15T04:00:00.000Z',assigned_to:'ana',status:'pending'},
      {id:'t4',camporee_id:'camp',title:'Llamar proveedor',due_at:'2026-10-16T15:00:00.000Z',assigned_to:'ana',status:'pending'},
      {id:'t5',camporee_id:'camp',title:'Tarea terminada',due_at:'2026-10-10T15:00:00.000Z',assigned_to:'ana',status:'done'},
      {id:'t6',camporee_id:'camp',title:'Sin fecha',due_at:null,assigned_to:'ana',status:'pending'},
      {id:'t7',camporee_id:'camp',title:'Sin responsable',due_at:'2026-10-10T15:00:00.000Z',assigned_to:null,status:'pending'},
      {id:'t8',camporee_id:'camp',title:'De inactivo',due_at:'2026-10-10T15:00:00.000Z',assigned_to:'inactive',status:'pending'},
      {id:'t9',camporee_id:'camp',title:'De otra organizacion',due_at:'2026-10-10T15:00:00.000Z',assigned_to:'outsider',status:'pending'},
      {id:'t10',camporee_id:'camp',title:'Sin suscripcion al camporee',due_at:'2026-10-10T15:00:00.000Z',assigned_to:'bob',status:'pending'},
    ],
    push_subscriptions:[
      {id:'sub-ana',user_id:'ana',camporee_ids:['camp'],endpoint:'https://push.test/ana',p256dh:'key',auth:'secret'},
      {id:'sub-inactive',user_id:'inactive',camporee_ids:['camp'],endpoint:'https://push.test/inactive',p256dh:'key',auth:'secret'},
      {id:'sub-outsider',user_id:'outsider',camporee_ids:['camp'],endpoint:'https://push.test/outsider',p256dh:'key',auth:'secret'},
      {id:'sub-bob',user_id:'bob',camporee_ids:['other-camp'],endpoint:'https://push.test/bob',p256dh:'key',auth:'secret'},
    ],
    push_vapid_keys:[{singleton:true,public_key:'public',private_key:'private'}],
  };
}

async function reminder({failed=false,secret='trusted',now=MORNING,stale=[],rows:overrides={}}={}){
  await loadBindings();
  const compile=async path=>(await transform(await readFile(path,'utf8'),{filename:path,jsc:{parser:{syntax:'typescript'},target:'es2022'},module:{type:'commonjs'}})).code;
  let pushFailed=failed;
  let clock=now;
  const sent=[],logs=[],deleted=[];
  const rows={...defaultRows(),...overrides};
  rows.system_push_reminder_log=logs;
  const client={from(table){
    const filters=[];let insert=null,deleting=false;
    const result=()=>{
      if(insert){
        const value=insert;insert=null;
        if((rows.system_push_reminder_log).some(r=>r.camporee_id===value.camporee_id&&r.user_id===value.user_id&&r.milestone===value.milestone))return {data:null,error:{code:'23505'}};
        const row={...value,id:String(rows.system_push_reminder_log.length+1)};rows.system_push_reminder_log.push(row);return {data:[row],error:null};
      }
      const data=(rows[table]??[]).filter(r=>filters.every(f=>f(r)));
      if(deleting)for(const row of data)rows[table].splice(rows[table].indexOf(row),1);
      return {data,error:null};
    };
    return {select(){return this;},order(){return this;},
      eq(k,v){filters.push(r=>r[k]===v);return this;},neq(k,v){filters.push(r=>r[k]!==v);return this;},
      gte(k,v){filters.push(r=>r[k]>=v);return this;},lte(k,v){filters.push(r=>r[k]<=v);return this;},
      in(k,v){filters.push(r=>v.includes(r[k]));return this;},contains(k,v){filters.push(r=>v.every(x=>(r[k]??[]).includes(x)));return this;},
      insert(v){insert=v;return this;},delete(){deleting=true;return this;},
      maybeSingle(){const r=result();return Promise.resolve({...r,data:r.data?.[0]??null});},single(){return this.maybeSingle();},
      then(a,b){return Promise.resolve(result()).then(a,b);},
    };
  }};
  client.rpc=deliveryRpc(rows,()=>clock);
  const webpush={setVapidDetails(){},async sendNotification(subscription,payload){
    if(stale.includes(subscription.endpoint)||pushFailed)throw {statusCode:stale.includes(subscription.endpoint)?410:503};
    sent.push({endpoint:subscription.endpoint,payload:JSON.parse(payload)});
  }};
  const FixedDate=class extends Date{constructor(value){super(value??clock);}static now(){return Date.parse(clock);}};
  let handler;const dependencies={};
  const context={Request,Response,Date:FixedDate,console:{error(){}},Deno:{serve(fn){handler=fn;},env:{get:()=> 'test'}},require:name=>name.startsWith('npm:@supabase/')?{createClient:()=>client}:name.startsWith('npm:web-push')?{__esModule:true,default:webpush}:dependencies[name]};
  for(const name of ['delivery.ts','messages.ts','schedule.ts','tasks.ts']){
    let code;try{code=await compile(`supabase/functions/camporee-reminders/${name}`);}catch(e){if(e.code==='ENOENT')continue;throw e;}
    const module={exports:{}};vm.runInNewContext(code,{...context,module,exports:module.exports});dependencies[`./${name}`]=module.exports;
  }
  const module={exports:{}};vm.runInNewContext(await compile('supabase/functions/camporee-reminders/index.ts'),{...context,module,exports:module.exports});
  const invoke=()=>handler(new Request('https://edge.test',{method:'POST',headers:{'x-cron-secret':secret},body:JSON.stringify({action:'schedule'})}));
  return {invoke,sent,logs,rows,deleted,recover(){pushFailed=false;clock=new Date(new Date(clock).getTime()+31000).toISOString();},setNow(value){clock=value;}};
}

test('agrupa las tareas atrasadas por responsable en un resumen diario con enlace /tasks',async()=>{
  const api=await reminder();assert.equal((await api.invoke()).status,200);
  assert.equal(api.sent.length,1);
  assert.equal(api.sent[0].endpoint,'https://push.test/ana');
  assert.match(api.sent[0].payload.body,/2 tareas atrasadas/);
  assert.match(api.sent[0].payload.body,/Comprar alimentos/);
  assert.match(api.sent[0].payload.body,/Confirmar transporte/);
  assert.doesNotMatch(api.sent[0].payload.body,/Revisar inventario/);
  assert.equal(api.sent[0].payload.url,'/o/club/c/camp/tasks');
  assert.equal(api.logs.length,1);
  assert.equal(api.logs[0].milestone,'task-overdue:2026-10-15');
});

test('solo notifica a responsables activos con un dispositivo suscrito al camporee',async()=>{
  const api=await reminder();await api.invoke();
  assert.deepEqual(api.sent.map(push=>push.endpoint),['https://push.test/ana']);
});

test('la fecha local del camporee decide el dia limite de vencimiento',async()=>{
  const rows=defaultRows();
  rows.tasks=[
    {id:'edge-overdue',camporee_id:'camp',title:'Borde atrasado',due_at:'2026-10-15T03:59:00.000Z',assigned_to:'ana',status:'pending'},
    {id:'edge-today',camporee_id:'camp',title:'Borde de hoy',due_at:'2026-10-15T04:00:00.000Z',assigned_to:'ana',status:'pending'},
  ];
  const api=await reminder({rows});await api.invoke();
  assert.equal(api.sent.length,1);
  assert.match(api.sent[0].payload.body,/1 tarea atrasada/);
  assert.match(api.sent[0].payload.body,/Borde atrasado/);
  assert.doesNotMatch(api.sent[0].payload.body,/Borde de hoy/);
});

test('no avisa tareas sin fecha ni sin responsable ni terminadas o canceladas',async()=>{
  const rows=defaultRows();
  rows.tasks=[
    {id:'a',camporee_id:'camp',title:'Sin fecha',due_at:null,assigned_to:'ana',status:'pending'},
    {id:'b',camporee_id:'camp',title:'Sin responsable',due_at:'2026-10-01T12:00:00.000Z',assigned_to:null,status:'pending'},
    {id:'c',camporee_id:'camp',title:'Terminada',due_at:'2026-10-01T12:00:00.000Z',assigned_to:'ana',status:'done'},
    {id:'d',camporee_id:'camp',title:'Cancelada',due_at:'2026-10-01T12:00:00.000Z',assigned_to:'ana',status:'cancelled'},
  ];
  const api=await reminder({rows});await api.invoke();
  assert.equal(api.sent.length,0);assert.equal(api.logs.length,0);
});

test('no avisa camporees finalizados o archivados',async()=>{
  for(const status of ['finished','archived']){
    const rows=defaultRows();rows.camporees=[{...rows.camporees[0],status}];
    const api=await reminder({rows});await api.invoke();
    assert.equal(api.sent.length,0,status);
  }
});

test('antes de las 09:00 locales no envia el resumen',async()=>{
  const api=await reminder({now:'2026-10-15T12:30:00.000Z'});await api.invoke();
  assert.equal(api.sent.length,0);assert.equal(api.logs.length,0);
});

test('llamadas concurrentes o repetidas no duplican el resumen del dia',async()=>{
  const api=await reminder();
  await Promise.all([api.invoke(),api.invoke()]);await api.invoke();
  assert.equal(api.sent.length,1);assert.equal(api.logs.length,1);
});

test('al cambiar el dia local vuelve a enviar un resumen nuevo',async()=>{
  const api=await reminder();await api.invoke();
  assert.equal(api.logs[0].milestone,'task-overdue:2026-10-15');
  api.setNow('2026-10-16T13:00:00.000Z');await api.invoke();
  assert.equal(api.logs.length,2);
  assert.equal(api.logs[1].milestone,'task-overdue:2026-10-16');
});

test('si todos los envios fallan conserva el trabajo pendiente para reintentar',async()=>{
  const api=await reminder({failed:true});await api.invoke();
  assert.equal(api.sent.length,0);assert.equal(api.logs.length,1);assert.equal(api.logs[0].state,'pending');
  api.recover();await api.invoke();
  assert.equal(api.sent.length,1);assert.equal(api.logs.length,1);
});

test('elimina dispositivos con endpoints vencidos 404/410',async()=>{
  const api=await reminder({stale:['https://push.test/ana']});await api.invoke();
  assert.equal(api.rows.push_subscriptions.some(sub=>sub.id==='sub-ana'),false);
  assert.equal(api.logs.length,1);assert.equal(api.logs[0].state,'pending');
});

test('trunca titulos largos y mantiene el payload por debajo de 4KB aunque sea Unicode',async()=>{
  const rows=defaultRows();
  const long='😀'.repeat(10000);
  rows.tasks=[
    {id:'l1',camporee_id:'camp',title:long,due_at:'2026-10-14T15:00:00.000Z',assigned_to:'ana',status:'pending'},
    {id:'l2',camporee_id:'camp',title:long,due_at:'2026-10-14T16:00:00.000Z',assigned_to:'ana',status:'pending'},
    {id:'l3',camporee_id:'camp',title:long,due_at:'2026-10-14T17:00:00.000Z',assigned_to:'ana',status:'pending'},
  ];
  const api=await reminder({rows});await api.invoke();
  assert.equal(api.sent.length,1);
  assert.match(api.sent[0].payload.body,/3 tareas atrasadas/);
  assert.ok(Buffer.byteLength(JSON.stringify(api.sent[0].payload),'utf8')<3500);
});

test('un llamador sin el secreto de cron no envia nada',async()=>{
  const api=await reminder({secret:'wrong'});assert.equal((await api.invoke()).status,401);
  assert.equal(api.sent.length,0);assert.equal(api.logs.length,0);
});
