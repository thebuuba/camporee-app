import {deliveryRpc} from './helpers/delivery-rpc.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const {loadBindings,transform}=createRequire(import.meta.url)('next/dist/build/swc');

async function reminder({failed=false,secret='trusted',now='2026-10-11T22:00:30.000Z',sunsets=[]}={}){
  let pushFailed=failed;
  await loadBindings();
  const compile=async path=>(await transform(await readFile(path,'utf8'),{filename:path,jsc:{parser:{syntax:'typescript'},target:'es2022'},module:{type:'commonjs'}})).code;
  let clock=now;
  const sent=[],logs=[];
  const rows={
    system_cron_secrets:[{key:'camporee_reminders',secret:'trusted'}],
    camporees:[{id:'camp',organization_id:'club',name:'Club',location:'Santiago',status:'planning',starts_on:'2026-11-06',time_zone:'America/Santo_Domingo'}],
    schedule_events:[
      {id:'meeting',camporee_id:'camp',title:'Reunión directiva',starts_at:'2026-10-11T22:00:00.000Z',ends_at:null},
      {id:'future',camporee_id:'camp',title:'Después',starts_at:'2026-10-11T22:01:00.000Z'},
      {id:'past',camporee_id:'camp',title:'Antes',starts_at:'2026-10-11T21:00:00.000Z'},
    ],
    organization_members:[{organization_id:'club',user_id:'admin',is_active:true},{organization_id:'club',user_id:'inactive',is_active:false},{organization_id:'other',user_id:'outsider',is_active:true}],
    push_subscriptions:['admin','inactive','outsider'].map(user_id=>({id:user_id,user_id,camporee_ids:['camp'],endpoint:`https://push.test/${user_id}`,p256dh:'key',auth:'secret'})),
    push_vapid_keys:[{singleton:true,public_key:'public',private_key:'private'}],
    system_push_reminder_log:logs,
  };
  const client={from(table){
    const filters=[];let insert=null,deleting=false;
    const result=()=>{
      if(insert){
        const value=insert;insert=null;
        if(logs.some(r=>r.camporee_id===value.camporee_id&&r.user_id===value.user_id&&r.milestone===value.milestone))return {data:null,error:{code:'23505'}};
        const row={...value,id:String(logs.length+1)};logs.push(row);return {data:[row],error:null};
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
  const webpush={setVapidDetails(){},async sendNotification(subscription,payload){if(pushFailed)throw {statusCode:503};sent.push({endpoint:subscription.endpoint,payload:JSON.parse(payload)});}};
  const FixedDate=class extends Date{constructor(value){super(value??clock);}static now(){return Date.parse(clock);}};
  let handler;const dependencies={'../_shared/sunset.ts':{...await import('../supabase/functions/_shared/sunset.ts'),dailySunsetTimes:async()=>sunsets}};
  const context={Request,Response,Date:FixedDate,console:{error(){}},Deno:{serve(fn){handler=fn;},env:{get:()=> 'test'}},require:name=>name.startsWith('npm:@supabase/')?{createClient:()=>client}:name.startsWith('npm:web-push')?{__esModule:true,default:webpush}:dependencies[name]};
  for(const name of ['delivery.ts','messages.ts','schedule.ts','tasks.ts','sunset.ts']){
    let code;try{code=await compile(`supabase/functions/camporee-reminders/${name}`);}catch(e){if(e.code==='ENOENT')continue;throw e;}
    const module={exports:{}};vm.runInNewContext(code,{...context,module,exports:module.exports});dependencies[`./${name}`]=module.exports;
  }
  const module={exports:{}};vm.runInNewContext(await compile('supabase/functions/camporee-reminders/index.ts'),{...context,module,exports:module.exports});
  const invoke=(action='schedule')=>handler(new Request('https://edge.test',{method:'POST',headers:{'x-cron-secret':secret},body:JSON.stringify({action})}));
  return {invoke,sent,logs,rows,setNow(value){clock=value;},recover(){pushFailed=false;clock=new Date(new Date(clock).getTime()+31000).toISOString();}};
}
test('a planning meeting starting now alerts only active members of its camporee',async()=>{
  const api=await reminder();assert.equal((await api.invoke()).status,200);
  assert.equal(api.sent.length,1);assert.equal(api.sent[0].endpoint,'https://push.test/admin');
  assert.match(api.sent[0].payload.body,/Reunión directiva/);assert.equal(api.sent[0].payload.url,'/o/club/c/camp/program');
});
test('repeated or concurrent cron calls do not duplicate an activity notification',async()=>{
  const api=await reminder();await Promise.all([api.invoke(),api.invoke()]);await api.invoke();
  assert.equal(api.sent.length,1);assert.equal(api.logs.length,1);
});
test('failed delivery remains retryable without recording a successful reminder',async()=>{
  const api=await reminder({failed:true});api.rows.schedule_events.length=1;await api.invoke();assert.equal(api.logs.length,1);assert.equal(api.logs[0].state,'pending');
  api.recover();await api.invoke();assert.equal(api.sent.length,1);assert.equal(api.logs.length,1);
});
test('a persisted activity delivery is retried after the candidate polling window',async()=>{
  const api=await reminder({failed:true});api.rows.schedule_events.length=1;
  await api.invoke();assert.equal(api.logs[0].state,'pending');
  api.recover();api.setNow('2026-10-11T22:06:00.000Z');await api.invoke();
  assert.equal(api.sent.length,1);assert.equal(api.logs[0].state,'delivered');
});
test('unauthorized calls, ended activities and archived camporees send nothing',async()=>{
  const unauthorized=await reminder({secret:'wrong'});assert.equal((await unauthorized.invoke()).status,401);assert.equal(unauthorized.sent.length,0);
  const ended=await reminder();ended.rows.schedule_events[0].ends_at='2026-10-11T22:00:10.000Z';await ended.invoke();assert.equal(ended.sent.length,0);
  const archived=await reminder();archived.rows.camporees[0].status='archived';await archived.invoke();assert.equal(archived.sent.length,0);
});

test('el aviso del primer día se envía a las 08:00 de la zona del camporee una sola vez',async()=>{
  for(const [time_zone,now] of [
    ['America/La_Paz','2026-11-06T12:00:00.000Z'],
    ['America/Lima','2026-11-06T13:00:00.000Z'],
    ['America/New_York','2026-11-06T13:00:00.000Z'],
    ['Pacific/Kiritimati','2026-11-05T18:00:00.000Z'],
  ]){
    const api=await reminder({now});api.rows.camporees[0].time_zone=time_zone;
    await Promise.all([api.invoke(),api.invoke()]);
    assert.equal(api.sent.length,1,`${time_zone}: cron por minuto`);
    await api.invoke('daily');
    assert.equal(api.sent.length,1,time_zone);
    assert.match(api.sent[0].payload.body,/comienza hoy|Hoy comienza/);
    assert.equal(api.logs[0].milestone,'d0');
  }
});

test('el aviso de inicio no sale antes de las 8, otro día ni fuera de su ventana',async()=>{
  for(const now of ['2026-11-06T11:59:59.000Z','2026-11-05T12:00:00.000Z','2026-11-06T13:00:00.000Z']){
    const api=await reminder({now});
    await api.invoke();assert.equal(api.sent.length,0,now);
    if(now.startsWith('2026-11-06')){
      await api.invoke('daily');assert.equal(api.sent.length,0,`${now}: cron diario`);
    }
  }
});

test('los avisos previos conservan el cron diario y no se repiten cada minuto',async()=>{
  const api=await reminder({now:'2026-11-05T12:00:00.000Z'});
  await api.invoke();assert.equal(api.sent.length,0);
  await api.invoke('daily');assert.equal(api.sent.length,1);assert.equal(api.logs[0].milestone,'d1');
});

test('el aviso del primer día puede reintentarse si ningún dispositivo acepta el envío',async()=>{
  const api=await reminder({now:'2026-11-06T12:00:00.000Z',failed:true});
  await api.invoke();assert.equal(api.logs.length,1);assert.equal(api.logs[0].state,'pending');
  api.recover();await api.invoke();assert.equal(api.sent.length,1);assert.equal(api.logs.length,1);
});

test('Friday sunset queues one durable alert per active subscribed member, ninety minutes before the shown time',async()=>{
 const sunsets=['santiago','moca'].map(id=>({id,label:id,timeZone:'America/Santo_Domingo',date:'2026-10-30',sunrise:'2026-10-30T06:43:00-04:00',sunset:'2026-10-30T18:10:42-04:00'}));
 const api=await reminder({now:'2026-10-30T20:40:00Z',sunsets,failed:true});
 assert.equal((await api.invoke()).status,200);
 assert.equal(api.logs.length,1);assert.equal(api.logs[0].milestone,'sunset:2026-10-30');
 assert.equal(api.logs[0].user_id,'admin');assert.equal(api.logs[0].state,'pending');
 api.recover();await api.invoke();await api.invoke();
 assert.equal(api.sent.length,1);assert.equal(api.sent[0].endpoint,'https://push.test/admin');
 assert.equal(api.sent[0].payload.url,'/o/club/c/camp');
 assert.equal(api.logs.length,1);
});

test('sunset alerts skip unavailable daily data, unrelated regions and finished camporees',async()=>{
 const sunsets=['santiago','moca'].map(id=>({id,label:id,timeZone:'America/Santo_Domingo',date:'2026-10-30',sunrise:'2026-10-30T06:43:00-04:00',sunset:'2026-10-30T18:10:42-04:00'}));
 for(const change of [{},{location:'Madrid'},{status:'finished'}]){
  const api=await reminder({now:'2026-10-30T20:40:00Z',sunsets:Object.keys(change).length?sunsets:[]});
  Object.assign(api.rows.camporees[0],change);await api.invoke();
  assert.equal(api.logs.length,0);assert.equal(api.sent.length,0);
 }
});

for(const [date,title] of [['2026-10-30','¡Feliz sábado!'],['2026-10-31','¡Feliz semana!']])test(`${title}: sunset greeting retries and deduplicates for active subscribed recipients`,async()=>{
 const sunsets=[{id:'santiago',label:'Santiago',timeZone:'America/Santo_Domingo',date,sunrise:`${date}T06:43:00-04:00`,sunset:`${date}T18:10:42-04:00`}];
 const api=await reminder({now:`${date}T22:10:42Z`,sunsets,failed:true});
 assert.equal((await api.invoke()).status,200);
 assert.equal(api.logs.length,1);assert.equal(api.logs[0].milestone,`sunset-passed:${date}`);
 assert.equal(api.logs[0].user_id,'admin');assert.equal(api.logs[0].state,'pending');
 api.recover();await api.invoke();await api.invoke();
 assert.equal(api.logs.length,1);assert.equal(api.sent.length,1);
 assert.equal(api.sent[0].payload.title,title);assert.match(api.sent[0].payload.body,/puesta de sol ya pasó/);
 assert.equal(api.sent[0].payload.url,'/o/club/c/camp');
});

test('Friday preparation reminder and sunset greeting have separate delivery identities',async()=>{
 const date='2026-10-30',sunsets=[{id:'santiago',label:'Santiago',timeZone:'America/Santo_Domingo',date,sunrise:`${date}T06:43:00-04:00`,sunset:`${date}T18:10:42-04:00`}];
 const api=await reminder({now:`${date}T20:40:00Z`,sunsets});
 await api.invoke();api.setNow(`${date}T22:10:42Z`);await api.invoke();await api.invoke();
 assert.deepEqual(api.logs.map(log=>log.milestone),[`sunset:${date}`,`sunset-passed:${date}`]);
 assert.equal(api.sent.length,2);assert.equal(api.sent[1].payload.title,'¡Feliz sábado!');
});
