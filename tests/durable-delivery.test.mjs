import test from 'node:test';
import assert from 'node:assert/strict';
import { drainDeliveries } from '../supabase/functions/camporee-reminders/delivery.ts';

function fixture({accepted=[],reject=false,owns=true}={}) {
  const calls=[], sent=[], devices=[{id:'a',endpoint:'https://push/a',p256dh:'p',auth:'a'},{id:'b',endpoint:'https://push/b',p256dh:'p',auth:'a'}];
  let claimed=false;
  const client={
    async rpc(name,args){
      calls.push({name,args});
      if(name==='claim_push_delivery') {const data=claimed?[]:[{id:'job',camporee_id:'camp',user_id:'user',lease_token:'owner',accepted_subscription_ids:accepted,payload:{title:'Notice'},ttl:300,expires_at:new Date(Date.now()+300000).toISOString()}];claimed=true;return {data,error:null};}
      return {data:owns,error:null};
    },
    from(table){return {select(){return this},eq(){return this},contains(){return this},in(){return this},delete(){return this},
      maybeSingle:async()=>({data:{public_key:'p',private_key:'s'},error:null}),
      then(resolve,reject){return Promise.resolve({data:devices,error:null}).then(resolve,reject)},
    }},
  };
  const webpush={setVapidDetails(){},async sendNotification(device,payload,options){assert.equal(options.timeout,10000);if(reject&&device.endpoint.endsWith('/b'))throw {statusCode:503};sent.push(device.endpoint)}};
  return {client,webpush,calls,sent};
}

test('durable worker retries unavailable devices and retains accepted endpoints',async()=>{
  const f=fixture({reject:true});await drainDeliveries(f.client,f.webpush);
  assert.deepEqual(f.sent,['https://push/a']);
  const done=f.calls.find(x=>x.name==='finish_push_delivery').args;
  assert.deepEqual(done.accepted_ids,['a']);assert.equal(done.retry,true);assert.equal(done.owner_token,'owner');
});
test('recovered jobs do not resend to devices already accepted',async()=>{
  const f=fixture({accepted:['a']});await drainDeliveries(f.client,f.webpush);
  assert.deepEqual(f.sent,['https://push/b']);assert.equal(f.calls.find(x=>x.name==='finish_push_delivery').args.retry,false);
});
test('a worker that lost ownership or membership sends and finalizes nothing',async()=>{
  const f=fixture({owns:false});await drainDeliveries(f.client,f.webpush);
  assert.equal(f.sent.length,0);assert.equal(f.calls.some(x=>x.name==='finish_push_delivery'),false);
});
