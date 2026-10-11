import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const {loadBindings,transform}=createRequire(import.meta.url)('next/dist/build/swc');

const org='50000000-0000-4000-8000-000000000001';
const camp='60000000-0000-4000-8000-000000000001';
const other='60000000-0000-4000-8000-000000000002';
const actor='10000000-0000-4000-8000-000000000001';
const active='10000000-0000-4000-8000-000000000002';
const inactive='10000000-0000-4000-8000-000000000003';

async function edge({verified=true,member=true}={}) {
  await loadBindings();
  const source=await readFile(new URL('../supabase/functions/camporee-push/index.ts',import.meta.url),'utf8');
  const {code}=await transform(source,{filename:'camporee-push/index.ts',jsc:{parser:{syntax:'typescript'},target:'es2022'},module:{type:'commonjs'}});
  const deliveries=[];
  let handler;
  const rows={
    camporees:[{id:camp,organization_id:org,status:'active'}],
    organization_members:[
      ...(member?[{organization_id:org,user_id:actor,is_active:true,role:'admin',permissions:{}}]:[]),
      {organization_id:org,user_id:active,is_active:true,role:'viewer',permissions:{}},
      {organization_id:org,user_id:inactive,is_active:false,role:'viewer',permissions:{}},
    ],
    push_vapid_keys:[{singleton:true,public_key:'public-test',private_key:'private-test'}],
    push_subscriptions:[
      {id:'sub-active',user_id:active,camporee_ids:[camp],endpoint:'https://push.test/active',p256dh:'key',auth:'secret'},
      {id:'sub-inactive',user_id:inactive,camporee_ids:[camp],endpoint:'https://push.test/inactive',p256dh:'key',auth:'secret'},
      {id:'sub-self',user_id:actor,camporee_ids:[camp],endpoint:'https://push.test/self',p256dh:'key',auth:'secret'},
      {id:'sub-other',user_id:active,camporee_ids:[other],endpoint:'https://push.test/other',p256dh:'key',auth:'secret'},
    ],
  };
  const client={
    auth:{getUser:async()=>verified?{data:{user:{id:actor}},error:null}:{data:{user:null},error:new Error('invalid token')}},
    from(table){
      const conditions=[];
      const builder={
        select(){return this;},
        eq(key,value){conditions.push(row=>row[key]===value);return this;},
        contains(key,values){conditions.push(row=>values.every(v=>(row[key]??[]).includes(v)));return this;},
        maybeSingle(){return Promise.resolve({data:(rows[table]??[]).filter(row=>conditions.every(fn=>fn(row)))[0]??null,error:null});},
        then(resolve,reject){return Promise.resolve({data:(rows[table]??[]).filter(row=>conditions.every(fn=>fn(row))),error:null}).then(resolve,reject);},
        delete(){return this;},in(){return Promise.resolve({error:null});},
      };
      return builder;
    },
  };
  const webpush={
    generateVAPIDKeys:()=>({publicKey:'public-test',privateKey:'private-test'}),
    setVapidDetails(){},
    sendNotification:async (subscription,payload)=>{deliveries.push({subscription,payload:JSON.parse(payload)});},
  };
  const exports={};
  vm.runInNewContext(code,{
    module:{exports},exports,
    require:name=>name.startsWith('npm:@supabase/')?{createClient:()=>client}:
      name.startsWith('npm:web-push')?{__esModule:true,default:webpush}:
      (()=>{throw new Error('Unexpected dependency '+name)})(),
    Deno:{serve(fn){handler=fn;},env:{get:()=> 'mock-secret'}},
    Request,Response,console,
  });
  return {
    deliveries,
    invoke:()=>handler(new Request('https://edge.test/',{
      method:'POST',headers:{authorization:'Bearer fabricated.jwt.signature','content-type':'application/json'},
      body:JSON.stringify({action:'send',camporeeId:camp,title:'Aviso',message:'Solo miembros activos'}),
    })),
  };
}
test('JWT sin validación de Supabase Auth no autoriza enviar notificaciones',async()=>{
  const fn=await edge({verified:false});
  const result=await fn.invoke();
  assert.equal(result.status,401);
  assert.equal(fn.deliveries.length,0);
});
test('un administrador ajeno al camporee no puede enviar notificaciones',async()=>{
  const fn=await edge({member:false});
  const result=await fn.invoke();
  assert.equal(result.status,403);
  assert.equal(fn.deliveries.length,0);
});
test('solo el destino activo y asociado al camporee recibe la alerta',async()=>{
  const fn=await edge();
  const result=await fn.invoke();
  assert.equal(result.status,200);
  assert.equal(fn.deliveries.length,1);
  assert.equal(fn.deliveries[0].subscription.endpoint,'https://push.test/active');
  assert.equal(fn.deliveries[0].payload.url,`/o/${org}/c/${camp}/more/announcements`);
});
