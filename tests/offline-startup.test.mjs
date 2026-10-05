import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const {loadBindings,transform}=createRequire(import.meta.url)('next/dist/build/swc');
async function startup({path='/',controlled=false,online=true,redirected=false,pendingHtml}={}) {
  await loadBindings();
  const {code}=await transform(await readFile(new URL('../app/components/pwa-register.tsx',import.meta.url),'utf8'),{filename:'pwa-register.tsx',jsc:{parser:{syntax:'typescript',tsx:true},target:'es2022'},module:{type:'commonjs'}});
  const effects=[],requests=[],listeners=new Map(),parsed=[];
  const elements=[{getAttribute:name=>name==='src'?'/_next/static/current.js':null},{getAttribute:name=>name==='href'?'/_next/static/current.css':null},{getAttribute:name=>name==='src'?'https://third-party.test/script.js':null}];
  const worker={ready:Promise.resolve({active:{postMessage(){}}}),controller:controlled?{postMessage(){}}:null,register:async()=>({update:async()=>{}}),addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
  const module={exports:{}};
  vm.runInNewContext(code,{module,exports:module.exports,require:name=>name==='react'?{useEffect:fn=>effects.push(fn),useRef:value=>({current:value})}:{usePathname:()=>path},process:{env:{NODE_ENV:'production'}},caches:{delete:async()=>true},navigator:{onLine:online,serviceWorker:worker},window:{setTimeout(){},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)},location:{origin:'https://camporee.test'},document:{querySelectorAll:()=>[]},DOMParser:class{parseFromString(html){parsed.push(html);return {querySelectorAll:()=>elements}}},fetch:async(url,options)=>{requests.push({url,options});return {ok:true,redirected,headers:new Headers({'Content-Type':'text/html'}),text:async()=>typeof pendingHtml==='function'?pendingHtml():pendingHtml??'<html>Current deployment</html>'}},URL,AbortController});
  module.exports.default();const cleanups=effects.map(effect=>effect());
  const settle=()=>new Promise(resolve=>setImmediate(resolve));await settle();
  return {worker,listeners,requests,parsed,settle,cleanups};
}
test('la primera apertura guarda Inicio y sus archivos cuando el worker toma control',async()=>{
  const app=await startup();assert.equal(app.requests.length,0);
  app.worker.controller={};app.listeners.get('controllerchange')?.();await app.settle();
  assert.equal(app.requests[0]?.url,'/');assert.equal(app.requests[0]?.options.headers.Accept,'text/html');
  assert.ok(app.requests.some(req=>req.url==='https://camporee.test/_next/static/current.js'));
  assert.ok(app.requests.some(req=>req.url==='https://camporee.test/_next/static/current.css'));
  assert.equal(app.requests.some(req=>req.url.includes('third-party')),false);
});
test('navegar dentro de la app prepara tambien el HTML completo de Tareas',async()=>{
  const app=await startup({path:'/tasks',controlled:true});assert.equal(app.requests[0]?.url,'/tasks');assert.equal(app.parsed.length,1);
});
test('sin conexion o en login no se guarda una copia privada',async()=>{
  for(const options of [{online:false,controlled:true},{path:'/login',controlled:true},{path:'/offline',controlled:true}])assert.equal((await startup(options)).requests.length,0);
});
test('una redireccion de sesion no prepara recursos de una pagina privada',async()=>{
  const app=await startup({controlled:true,redirected:true});assert.equal(app.requests.length,1);assert.equal(app.parsed.length,0);
});

test('cambiar de ruta deja finalizar la copia pendiente de la pantalla visitada',async()=>{
  let finish;const pendingHtml=new Promise(resolve=>{finish=resolve});
  const app=await startup({path:'/tasks',controlled:true,pendingHtml});
  app.cleanups[1]();assert.equal(app.requests[0].options.signal.aborted,false);
  finish('<html>Tareas</html>');await app.settle();
  assert.ok(app.requests.some(req=>req.url.endsWith('/current.js')));
});

test('el menu inferior usa navegacion completa offline para recuperar HTML guardado',async()=>{
  await loadBindings();const {code}=await transform(await readFile(new URL('../app/components/bottom-nav.tsx',import.meta.url),'utf8'),{filename:'bottom-nav.tsx',jsc:{parser:{syntax:'typescript',tsx:true},target:'es2022',transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}});
  const effects=[],navigations=[];let prefetched=0,timers=0,prevented=false;const jsx=(type,props)=>({type,props});const module={exports:{}};
  const modules={react:{useEffect:fn=>effects.push(fn),useRef:value=>({current:value}),useState:value=>[value,()=>{}]},'react/jsx-runtime':{jsx,jsxs:jsx},'next/link':'link','next/navigation':{usePathname:()=> '/',useRouter:()=>({prefetch(){prefetched++}})},'lucide-react':{}};
  vm.runInNewContext(code,{module,exports:module.exports,require:name=>modules[name],navigator:{onLine:false},window:{location:{assign:href=>navigations.push(href)},setTimeout(){timers++},clearTimeout(){}}});
  const nav=module.exports.default();for(const effect of effects)effect();
  const tasks=nav.props.children.find(node=>node.props.href==='/tasks');tasks.props.onPointerDown();tasks.props.onClick({button:0,preventDefault(){prevented=true}});
  assert.equal(prevented,true);assert.deepEqual(navigations,['/tasks']);assert.equal(prefetched,0);assert.equal(timers,0);
});

test('una mutacion durante el guardado vuelve a preparar la ultima copia al finalizar',async()=>{
  let finish,reads=0;const pending=new Promise(resolve=>{finish=resolve});
  const app=await startup({path:'/more/songs',controlled:true,pendingHtml:()=>++reads===1?pending:'<html>Updated lyric</html>'});
  app.listeners.get('camporee:mutation-success')();
  assert.equal(app.requests.filter(req=>req.url==='/more/songs').length,1);
  finish('<html>Old lyric</html>');await app.settle();
  assert.equal(app.requests.filter(req=>req.url==='/more/songs').length,2);assert.equal(app.parsed.at(-1),'<html>Updated lyric</html>');
});
