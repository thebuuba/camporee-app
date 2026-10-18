import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const {loadBindings,transform}=createRequire(import.meta.url)('next/dist/build/swc');

test('bloquear sessionStorage no rompe ni impide cerrar el aviso de notificaciones',async()=>{
  await loadBindings();
  const {code}=await transform(await readFile(new URL('../app/components/notification-controls.tsx',import.meta.url),'utf8'),{filename:'notification-controls.tsx',jsc:{parser:{syntax:'typescript',tsx:true},target:'es2022',transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}});
  const states=[],effects=[];let index=0;const jsx=(type,props)=>({type,props});
  const modules={react:{useState:value=>{const i=index++;if(!(i in states))states[i]=value;return [states[i],value=>{states[i]=value}]},useMemo:fn=>fn(),useEffect:fn=>effects.push(fn)},'react/jsx-runtime':{jsx,jsxs:jsx},'lucide-react':{},'@/lib/supabase/client':{createClient:()=>({})}};
  const module={exports:{}};
  vm.runInNewContext(code,{module,exports:module.exports,require:name=>modules[name],navigator:{serviceWorker:{}},window:{Notification:{},PushManager:{},matchMedia:()=>({matches:true})},Notification:{permission:'default'},sessionStorage:{getItem(){throw new Error('SecurityError')},setItem(){throw new Error('SecurityError')}}});
  function render(){index=0;return module.exports.default({camporeeId:'camp',userId:'user',mode:'prompt'})}
  render();assert.doesNotThrow(()=>effects[0]());
  const prompt=render();assert.ok(prompt);
  const actions=prompt.props.children.find(node=>node.props?.className==='notification-prompt-actions');
  assert.doesNotThrow(()=>actions.props.children[1].props.onClick());
  assert.equal(render(),null);
});
