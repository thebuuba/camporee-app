import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';

const {loadBindings, transform}=createRequire(import.meta.url)('next/dist/build/swc');

const sampleLists=Array.from({length:6},(_,index)=>({
 id:'70000000-0000-4000-8000-'+String(index+1).padStart(12,'0'),
 title:'Lista '+(index+1),
 category:'Materiales',
 list_items:[{id:'item-'+index,label:'Elemento',is_done:false}],
}));

function all(node,predicate,result=[]) {
 if(!node||typeof node!=='object')return result;
 if(predicate(node))result.push(node);
 const children=node.props?.children;
 for(const child of Array.isArray(children)?children:[children])all(child,predicate,result);
 return result;
}

async function manager(pending=false) {
 await loadBindings();
 const path='app/more/lists/list-manager.tsx';
 const {code}=await transform(await readFile(new URL('../'+path,import.meta.url),'utf8'),{
  filename:path,
  jsc:{parser:{syntax:'typescript',tsx:true},target:'es2022',transform:{react:{runtime:'automatic'}}},
  module:{type:'commonjs'}
 });
 const module={exports:{}};
 const jsx=(type,props)=>({type,props:props??{}});
 const modules={
  react:{
   useState:initial=>[initial,()=>{}],
   useEffect(){},
   useMemo:callback=>callback(),
  },
  'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'},
  'next/link':{useLinkStatus:()=>({pending})},
  'next/navigation':{useRouter:()=>({refresh(){}})},
  'lucide-react':{
   Backpack:'backpack',ChevronRight:'chevron-right',Hammer:'hammer',
   ListChecks:'list-checks',LoaderCircle:'loader-circle',
   Plus:'plus',ShoppingCart:'cart',X:'close',
  },
  '@/app/components/tenant-link':{default:'tenant-link'},
  '@/app/components/bottom-sheet':{default:'bottom-sheet'},
  '@/lib/supabase/client':{createClient:()=>({})},
  '@/lib/client-ui':{reportMutationError(){},reportMutationSuccess(){}},
 };
 vm.runInNewContext(code,{module,exports:module.exports,require:name=>{
  if(!(name in modules))throw new Error('Unexpected import: '+name);
  return modules[name];
 },console});
 return module.exports.default({camporeeId:'camporee',canEdit:false,initialLists:sampleLists});
}

test('visible list cards prefetch only the first four details, preventing a request storm',async()=>{
 const tree=await manager();
 const links=all(tree,node=>node.type==='tenant-link' && node.props?.className==='pm-list-card-main');
 assert.equal(links.length,6);
 assert.deepEqual(Array.from(links,link=>link.props.prefetch),[true,true,true,true,false,false]);
 assert.equal(links[0].props.href,'/more/lists/'+sampleLists[0].id);
});

test('the chevron becomes an accessible loading spinner during actual route transitions',async()=>{
 for(const pending of [false,true]){
  const tree=await manager(pending);
  const link=all(tree,node=>node.type==='tenant-link' && node.props?.className==='pm-list-card-main')[0];
  const status=all(link,node=>typeof node.type==='function')[0]?.type();
  assert.ok(status);
  assert.equal(status.props.role,pending?'status':undefined);
  assert.equal(status.props['aria-label'],pending?'Abriendo lista':undefined);
  const icon=all(status,node=>node.type=== (pending?'loader-circle':'chevron-right'))[0];
  assert.ok(icon);
  if(pending)assert.equal(icon.props.className,'pm-list-link-spinner');
 }
});

test('the detail has a streamed loading state and a route-scoped arrival animation',async()=>{
 const root=await readFile(new URL('../app/o/[organizationId]/c/[camporeeId]/[[...panel]]/page.tsx',import.meta.url),'utf8');
 const css=await readFile(new URL('../app/lists.css',import.meta.url),'utf8');
 const fallback=await readFile(new URL('../app/more/lists/[listId]/list-detail-loading.tsx',import.meta.url),'utf8');
 assert.match(root, /<Suspense key=\{listId\} fallback=\{<ListDetailLoading\/>\}>/);
 assert.match(css, /@keyframes pm-list-screen-enter/);
 assert.match(css, /\.polymet-list-detail-page \.pm-list-detail-summary/);
 assert.match(css, /\.polymet-lists > :is\(\.subpage-top/);
 assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
 assert.match(fallback, /aria-busy="true"/);
 assert.match(fallback, /Abriendo lista/);
});
