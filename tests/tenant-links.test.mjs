import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tenantPath,parseTenantPath} from '../lib/tenant-context.ts';
const {loadBindings,transform}=createRequire(import.meta.url)('next/dist/build/swc');
const prefix='/o/50000000-0000-4000-8000-000000000001/c/60000000-0000-4000-8000-000000000001';
async function load(path,pathname,search='') {
 await loadBindings();const {code}=await transform(await readFile(new URL(`../${path}`,import.meta.url),'utf8'),{filename:path,jsc:{parser:{syntax:'typescript',tsx:true},target:'es2022',transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}});
 const module={exports:{}};const jsx=(type,props)=>({type,props});
 const modules={'react/jsx-runtime':{jsx,jsxs:jsx},react:{useState:initial=>[initial,()=>{}],useEffect(){}},'next/link':'link','next/navigation':{usePathname:()=>pathname,useSearchParams:()=>new URLSearchParams(search)},'@/lib/tenant-context':{tenantPath,parseTenantPath},'lucide-react':{}};
 vm.runInNewContext(code,{module,exports:module.exports,require:name=>modules[name],navigator:{onLine:true},URL});
 return module.exports.default;
}
test('shared link retains selected tenant while personal and absolute routes remain global',async()=>{
 const Link=await load('app/components/tenant-link.tsx',`${prefix}/tasks`);
 assert.equal(Link({href:'/more/budget',children:'Presupuesto'}).props.href,`${prefix}/more/budget`);
 assert.equal(Link({href:'/profile',children:'Perfil'}).props.href,'/profile');
 assert.equal(Link({href:'https://example.com',children:'Enlace'}).props.href,'https://example.com');
 const global=await load('app/components/tenant-link.tsx','/organizations');
 assert.equal(global({href:'/profile'}).props.href,'/profile');
});
test('bottom navigation uses scoped destinations and marks selected panel active',async()=>{
 const Nav=await load('app/components/bottom-nav.tsx',`${prefix}/tasks`);
 const tree=Nav();const links=tree.props.children;
 assert.deepEqual(Array.from(links,node=>node.props.href),[prefix,`${prefix}/program`,`${prefix}/tasks`,`${prefix}/more`]);
 assert.equal(links.find(node=>node.props.href===`${prefix}/tasks`).props['aria-current'],'page');
 assert.equal(links.find(node=>node.props.href===prefix).props['aria-current'],undefined);
});

test('return to Inicio when a subpage was opened there and keep that context in list details',async()=>{
 const fromHome=await load('app/components/tenant-link.tsx',`${prefix}/more/lists`,'from=home');
 assert.equal(fromHome({href:'/more',className:'back-btn',children:'Volver'}).props.href,prefix);
 const id='70000000-0000-4000-8000-000000000001';
 assert.equal(fromHome({href:'/more/lists/'+id,children:'Ver lista'}).props.href,`${prefix}/more/lists/${id}?from=home`);
 const detail=await load('app/components/tenant-link.tsx',`${prefix}/more/lists/${id}`,'from=home');
 assert.equal(detail({href:'/more/lists',className:'back-btn'}).props.href,`${prefix}/more/lists?from=home`);
 const fromMore=await load('app/components/tenant-link.tsx',`${prefix}/more/participants`);
 assert.equal(fromMore({href:'/more',className:'back-btn'}).props.href,`${prefix}/more`);
 const onUnrelatedPage=await load('app/components/tenant-link.tsx',`${prefix}/more/lists`,'from=home');
 assert.equal(onUnrelatedPage({href:'/profile',children:'Perfil'}).props.href,'/profile');
});
