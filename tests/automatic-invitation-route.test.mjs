import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const {loadBindings,transform}=createRequire(import.meta.url)('next/dist/build/swc');
const token='a'.repeat(64);

async function render({user=null,joinError=null}={}){
  await loadBindings();
  const source=await readFile(new URL('../app/join/[code]/page.tsx',import.meta.url),'utf8');
  const {code}=await transform(source,{filename:'page.tsx',jsc:{parser:{syntax:'typescript',tsx:true},target:'es2022',transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}});
  const calls=[];
  const client={
    auth:{getUser:async()=>({data:{user},error:null})},
    rpc:async(name,args)=>{calls.push({name,args});return {data:null,error:joinError};},
  };
  const jsx=(type,props)=>({type,props});
  const module={exports:{}};
  vm.runInNewContext(code,{
    module,exports:module.exports,
    require:name=>({
      'react/jsx-runtime':{jsx,jsxs:jsx},
      'next/link':{default:'link'},
      'next/navigation':{
        redirect:path=>{throw new Error('redirect:'+path);},
        notFound:()=>{throw new Error('notFound');},
      },
      '@/lib/supabase/server':{createClient:async()=>client},
    })[name],
  });
  return {page:module.exports.default,calls};
}
function dump(node){return JSON.stringify(node);}
test('secure invitation landing retains the token through new signup',async()=>{
  const {page,calls}=await render();
  const view=await page({params:Promise.resolve({code:token})});
  assert.match(dump(view),new RegExp('/signup\\?next='));
  assert.match(dump(view),new RegExp(encodeURIComponent('/join/'+token)));
  assert.equal(calls.length,0);
});
test('verified authenticated invitee automatically joins without another button',async()=>{
  const {page,calls}=await render({user:{id:'verified-user',email:'guest@club.test'}});
  await assert.rejects(page({params:Promise.resolve({code:token})}),/redirect:\//);
  assert.equal(calls.length,1);
  assert.equal(calls[0].name,'join_camporee_by_token');
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0].args)),{invite_token:token});
});
test('short public code cannot be used as a shareable URL',async()=>{
  const {page,calls}=await render({user:{id:'verified-user'}});
  await assert.rejects(page({params:Promise.resolve({code:'4827'})}),/notFound/);
  assert.equal(calls.length,0);
});
test('join failure never silently authorizes an account or creates a second club',async()=>{
  const {page,calls}=await render({
    user:{id:'verified-user',email:'guest@club.test'},
    joinError:{code:'23505',message:'account already belongs to club'},
  });
  const view=await page({params:Promise.resolve({code:token})});
  assert.match(dump(view),/No puedes unirte a dos clubes/);
  assert.equal(calls.length,1);
});
