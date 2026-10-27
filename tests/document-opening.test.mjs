import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const {loadBindings,transform}=createRequire(import.meta.url)('next/dist/build/swc');

async function documentView() {
  await loadBindings();
  const {code}=await transform(await readFile(new URL('../app/more/documents/document-manager.tsx',import.meta.url),'utf8'),{filename:'document-manager.tsx',jsc:{parser:{syntax:'typescript',tsx:true},target:'es2022',transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}});
  let finish;const signed=new Promise(resolve=>{finish=resolve});const opened=[],navigations=[],errors=[];
  const popup={opener:{},closed:false,location:{replace:url=>navigations.push(url)},close(){this.closed=true}};
  const jsx=(type,props)=>({type,props});const module={exports:{}};
  const modules={react:{useEffect(){},useMemo:fn=>fn(),useState:value=>[value,()=>{}]},'react/jsx-runtime':{jsx,jsxs:jsx},'lucide-react':{},'next/navigation':{useRouter:()=>({refresh(){}})},'@/app/components/bottom-sheet':'sheet','@/lib/client-ui':{reportMutationError:error=>errors.push(error)},'@/lib/supabase/client':{createClient:()=>({storage:{from:()=>({createSignedUrl:()=>signed})}})}};
  vm.runInNewContext(code,{module,exports:module.exports,require:name=>modules[name],window:{open:(...args)=>{opened.push(args);return popup}}});
  const tree=module.exports.default({camporeeId:'camp',userId:'user',canEdit:false,initialDocuments:[{id:'doc',title:'Mapa',file_path:'camp/map.pdf',created_at:'2027-01-01'}]});
  function find(node){if(!node||typeof node!=='object')return;if(node.props?.['aria-label']==='Abrir Mapa')return node;for(const child of [node.props?.children].flat(Infinity)){const match=find(child);if(match)return match}}
  return {opened,navigations,errors,popup,finish,open:()=>find(tree).props.onClick()};
}

test('abrir un archivo reserva la pestaña durante el clic y luego navega al enlace firmado',async()=>{
  const view=await documentView();const pending=view.open();
  view.finish({data:{signedUrl:'https://storage.test/map.pdf'},error:null});
  assert.equal(view.opened.length,1);assert.equal(view.popup.opener,null);
  await pending;assert.deepEqual(view.navigations,['https://storage.test/map.pdf']);
});

test('un error al firmar el archivo cierra la pestaña de carga y se comunica en la app',async()=>{
  const view=await documentView();const pending=view.open();
  view.finish({data:null,error:{message:'network failed'}});await pending;
  assert.equal(view.popup.closed,true);assert.equal(view.errors.length,1);
});
