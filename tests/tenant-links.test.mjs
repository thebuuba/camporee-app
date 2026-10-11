import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {tenantPath,parseTenantPath} from '../lib/tenant-context.ts';
const {loadBindings,transform}=createRequire(import.meta.url)('next/dist/build/swc');
const prefix='/o/50000000-0000-4000-8000-000000000001/c/60000000-0000-4000-8000-000000000001';
async function load(path,pathname) {
 await loadBindings();const {code}=await transform(await readFile(new URL(`../${path}`,import.meta.url),'utf8'),{filename:path,jsc:{parser:{syntax:'typescript',tsx:true},target:'es2022',transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}});
 const module={exports:{}};const jsx=(type,props)=>({type,props});
 const modules={'react/jsx-runtime':{jsx,jsxs:jsx},react:{useState:initial=>[initial,()=>{}],useEffect(){}},'next/link':'link','next/navigation':{usePathname:()=>pathname},'@/lib/tenant-context':{tenantPath,parseTenantPath},'lucide-react':{}};
 vm.runInNewContext(code,{module,exports:module.exports,require:name=>modules[name],navigator:{onLine:true}});
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
