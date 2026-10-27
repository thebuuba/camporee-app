import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import * as mutation from '../lib/mutation-result.ts';
const {loadBindings,transform}=createRequire(import.meta.url)('next/dist/build/swc');

async function publish(status) {
  await loadBindings();
  const path='app/more/announcements/announcement-manager.tsx';
  const {code}=await transform(await readFile(path,'utf8'),{filename:path,jsc:{parser:{syntax:'typescript',tsx:true},target:'es2022',transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}});
  const successes=[],calls=[],states=[];let cursor=0;
  const jsx=(type,props)=>({type,props});
  const client={from(){return {insert(payload){return {select(){return this},single:async()=>({data:{...payload,id:'notice'},error:null,status})}}}},functions:{invoke(){calls.push('push');return Promise.resolve({error:null})}}};
  const fields=new FormData();fields.set('title','Urgente');fields.set('message','Cambio de salida');
  const modules={
    react:{useEffect(){},useState(value){const i=cursor++;states[i]??=value;return [states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v}]}},
    'react/jsx-runtime':{jsx,jsxs:jsx},'next/navigation':{useRouter:()=>({refresh(){calls.push('refresh')}})},
    '@/lib/supabase/client':{createClient:()=>client},'lucide-react':{},
    '@/lib/mutation-result':mutation,
    '@/app/components/bottom-sheet':{__esModule:true,default:'sheet'},
    '@/lib/client-ui':{confirmRemoval:()=>true,reportMutationError:()=>{},reportMutationSuccess:m=>successes.push(m)},
  };
  const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,require:n=>modules[n],navigator:{onLine:status!==202},FormData:class{constructor(){return fields}},console,Date});
  const tree=module.exports.default({camporeeId:'camp',userId:'user',canEdit:true,initialAnnouncements:[]});
  function find(node){if(Array.isArray(node))return node.flatMap(find);if(!node||typeof node!=='object')return [];return [...(node.type==='form'?[node]:[]),...find(node.props?.children)]}
  find(tree)[0].props.onSubmit({preventDefault(){},currentTarget:{}});await new Promise(setImmediate);
  return {successes,calls,states};
}
test('queued announcement explicitly waits for synchronization and publication',async()=>{
  const result=await publish(202);assert.match(result.successes[0],/pendiente/i);assert.doesNotMatch(result.successes[0],/publicado/i);assert.deepEqual(result.calls,[]);
});
test('confirmed announcement reports publication and server delivery request without browser push',async()=>{
  const result=await publish(201);assert.match(result.successes[0],/publicado/i);assert.match(result.successes[0],/envío solicitado/i);assert.deepEqual(result.calls,['refresh']);
});
