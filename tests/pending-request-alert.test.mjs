import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const {loadBindings,transform}=createRequire(import.meta.url)('next/dist/build/swc');

async function edge({secret='trusted',pending=true,rejected=false,archived=false,stale=false}={}) {
  await loadBindings();
  const {code}=await transform(await readFile('supabase/functions/admin-signup-alert/index.ts','utf8'),{
    filename:'admin-signup-alert.ts',jsc:{parser:{syntax:'typescript'},target:'es2022'},module:{type:'commonjs'},
  });
  const deliveries=[],deleted=[];
  let handler;
  const rows={
    system_cron_secrets:[{key:'signup_alerts',secret:'trusted'}],
    organization_members:[
      {organization_id:'club',user_id:'applicant',role:'viewer',is_active:!pending,permissions:{access_pending:pending,access_rejected:rejected}},
      {organization_id:'club',user_id:'director',role:'admin',is_active:true},
      {organization_id:'club',user_id:'inactive',role:'admin',is_active:false},
      {organization_id:'club',user_id:'editor',role:'editor',is_active:true},
      {organization_id:'other-club',user_id:'outsider',role:'admin',is_active:true},
    ],
    camporees:[{id:'camp',organization_id:'club',name:'Camporee del club',status:archived?'archived':'active'}],
    profiles:[{id:'applicant',full_name:'Ana',email:'ana@example.test'}],
    push_vapid_keys:[{singleton:true,public_key:'public',private_key:'private'}],
    push_subscriptions:['director','inactive','editor','outsider'].map(user_id=>({id:user_id,user_id,camporee_ids:['camp'],endpoint:`https://push.test/${user_id}`,p256dh:'key',auth:'secret'})),
  };
  const client={from(table){
    const filters=[];let deleting=false;
    const result=()=>({data:rows[table].filter(row=>filters.every(fn=>fn(row))),error:null});
    return {
      select(){return this;},eq(k,v){filters.push(r=>r[k]===v);return this;},
      neq(k,v){filters.push(r=>r[k]!==v);return this;},
      contains(k,v){filters.push(r=>v.every(x=>(r[k]??[]).includes(x)));return this;},
      in(k,v){filters.push(r=>v.includes(r[k]));return this;},
      delete(){deleting=true;return this;},
      maybeSingle(){return Promise.resolve({...result(),data:result().data[0]??null});},
      then(resolve,reject){if(deleting)deleted.push(...result().data.map(r=>r.id));return Promise.resolve(result()).then(resolve,reject);},
    };
  }};
  const webpush={setVapidDetails(){},async sendNotification(subscription,payload){
    if(stale)throw {statusCode:410};
    deliveries.push({endpoint:subscription.endpoint,payload:JSON.parse(payload)});
  }};
  const module={exports:{}};
  vm.runInNewContext(code,{module,exports:module.exports,Request,Response,console,
    require:name=>name.startsWith('npm:@supabase/')?{createClient:()=>client}:{__esModule:true,default:webpush},
    Deno:{serve(fn){handler=fn;},env:{get:()=> 'test'}},
  });
  const response=await handler(new Request('https://edge.test',{method:'POST',headers:{'x-cron-secret':secret,'content-type':'application/json'},body:JSON.stringify({organizationId:'club',userId:'applicant',fullName:'Forged name',email:'forged@test'})}));
  return {response,deliveries,deleted};
}

test('a pending request alerts only active administrators of its own club',async()=>{
  const {response,deliveries}=await edge();
  assert.equal(response.status,200);
  assert.equal(deliveries.length,1);
  assert.equal(deliveries[0].endpoint,'https://push.test/director');
  assert.match(deliveries[0].payload.body,/Ana/);
  assert.doesNotMatch(deliveries[0].payload.body,/Forged/);
  assert.equal(deliveries[0].payload.url,'/o/club/members');
});
test('an untrusted caller cannot send applicant information',async()=>{
  const {response,deliveries}=await edge({secret:'wrong'});
  assert.equal(response.status,401);assert.equal(deliveries.length,0);
});
test('approved, rejected or archived requests do not alert administrators',async()=>{
  for(const options of [{pending:false},{rejected:true},{archived:true}]){
    const {response,deliveries}=await edge(options);
    assert.equal(response.status,200);assert.equal(deliveries.length,0);
  }
});
test('expired push endpoints are removed',async()=>{
  const {response,deleted}=await edge({stale:true});
  assert.equal(response.status,200);assert.deepEqual(deleted,['director']);
});
