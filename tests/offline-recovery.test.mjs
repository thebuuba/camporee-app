import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const { loadBindings, transform } = createRequire(import.meta.url)('next/dist/build/swc');
const tick = () => new Promise(setImmediate);
const find = (node, predicate) => Array.isArray(node) ? node.flatMap(n => find(n, predicate)) :
  !node || typeof node !== 'object' ? [] : [...(predicate(node) ? [node] : []), ...find(node.props?.children, predicate)];

async function recovery() {
  await loadBindings();
  const path = 'app/components/offline-recovery.tsx';
  const { code } = await transform(await readFile(path, 'utf8'), { filename:path,
    jsc:{parser:{syntax:'typescript',tsx:true},target:'es2022',transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'} });
  const states=[],refs=[],effects=[];let index=0,refIndex=0,authChange,downloads=0,read;
  const jsx=(type,props)=>({type,props});
  const modules={react:{useState(initial){const i=index++;if(!(i in states))states[i]=initial;return [states[i],value=>states[i]=typeof value==='function'?value(states[i]):value]},useRef(initial){const i=refIndex++;return refs[i]??=( {current:initial} )},useEffect(fn){effects.push(fn)}},
    'react/jsx-runtime':{jsx,jsxs:jsx},'react-dom':{createPortal:node=>node},'next/navigation':{usePathname:()=>'/o/org/c/camp/tasks'},
    './bottom-sheet':{default:'sheet'},'./offline-recovery.module.css':{default:{}},
    '@/lib/supabase/client':{createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'token'}}}),onAuthStateChange(fn){authChange=fn;return {data:{subscription:{unsubscribe(){}}}}}}})},
    '@/lib/offline-fetch':{readScopedOfflineWrites:async()=>read(),flushOfflineWrites:async()=>({failed:false}),discardScopedOfflineWrite:async()=>{}}};
  const document={body:{append(){}},createElement:()=>({click(){downloads++},remove(){}})};
  const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,require:n=>modules[n],document,URL,Blob,Date,window:{setTimeout,confirm:()=>true}});
  const render=()=>{index=0;refIndex=0;return module.exports.default()};
  render();effects[0]();
  return {render,states,setRead(fn){read=fn},changeAuth(){authChange()},get downloads(){return downloads}};
}

test('recovery ignores reads completed after an account change',async()=>{
  const h=await recovery();let resolve;h.setRead(()=>new Promise(done=>{resolve=done}));
  find(h.render(),n=>n.type==='button')[0].props.onClick();await tick();h.changeAuth();
  resolve([{id:'private',body:'secret'}]);await tick();assert.equal(h.states[0],false);assert.equal(h.states[1].length,0);
});

test('recovery renders malformed legacy JSON safely and cancels exports after account change',async()=>{
  const h=await recovery();h.setRead(async()=>[{id:'entry',url:'https://x.supabase.co/rest/v1/tasks',method:'PATCH',body:'{incomplete',createdAt:1}]);
  find(h.render(),n=>n.type==='button')[0].props.onClick();await tick();
  const tree=h.render();assert.match(find(tree,n=>n.type==='pre')[0].props.children,/incomplete/);
  let resolve;h.setRead(()=>new Promise(done=>{resolve=done}));
  find(tree,n=>n.type==='button'&&n.props.children==='Exportar copia')[0].props.onClick();await tick();
  h.changeAuth();resolve([{id:'private',body:'secret'}]);await tick();assert.equal(h.downloads,0);
});
