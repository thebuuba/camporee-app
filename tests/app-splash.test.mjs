import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as launch from '../lib/legado-launch.ts';
const { loadBindings, transform } = createRequire(import.meta.url)('next/dist/build/swc');

async function splash(reduced = false, pathname = '/', {online=true,storage=new Map(),storageBlocked=false,standalone=false,iosStandalone=false,navigationType='navigate',referrer='',camporee,scope,now=Date.now(),search='',local=new Map()}={}) {
  await loadBindings();
  const { code } = await transform(await readFile(new URL('../app/components/app-splash.tsx', import.meta.url), 'utf8'), {
    filename: 'app-splash.tsx', jsc: { parser: { syntax: 'typescript', tsx: true }, target: 'es2022', transform: { react: { runtime: 'automatic' } } }, module: { type: 'commonjs' },
  });
  const states = [], effects = [], timers = [], cleared = [], refs=[];
  let cursor = 0;
  const jsx = (type, props) => ({ type, props });
  const modules = {
    'next/navigation': { usePathname: () => pathname },
    '@/lib/legado-launch': launch, './legado-launch': 'legado-screen',
    react: { useState(initial) { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], value => { states[index] = value; }]; }, useRef(initial){const index=cursor++;return refs[index]??= {current:initial}}, useEffect: callback => effects.push(callback) },
    'react/jsx-runtime': { jsx, jsxs: jsx }, 'lucide-react': { Tent: 'tent', TentTree: 'tent-tree' },
  };
  const module = { exports: {} };
  class Clock extends Date { static now(){return now} }
  const attrs=new Map();
  vm.runInNewContext(code, { Date:Clock, Event, module, exports: module.exports, require: name => modules[name], URL, document:{referrer,documentElement:{setAttribute:(key,value)=>attrs.set(key,value),removeAttribute:key=>attrs.delete(key)}}, navigator:{onLine:online,standalone:iosStandalone}, window: { location:{origin:'https://camporee.test',search},localStorage:{getItem:key=>local.get(key)??null,setItem:(key,value)=>local.set(key,value)},dispatchEvent(){}, performance:{getEntriesByType:()=>[{type:navigationType}]}, sessionStorage:{getItem(key){if(storageBlocked)throw new Error('blocked');return storage.get(key)??null},setItem(key,value){if(storageBlocked)throw new Error('blocked');storage.set(key,value)}}, matchMedia: query => ({ matches: query==='(display-mode: standalone)'?standalone:reduced }), setTimeout: (callback, delay) => { timers.push({ callback, delay }); return timers.length; }, clearTimeout: id => cleared.push(id) } });
  const render=()=>{cursor=0;effects.length=0;return module.exports.default({camporee,scope})};
  return { render, start(){render();effects.forEach(effect=>effect());return render()}, navigate(next){pathname=next;return render()}, remount(){states.length=0;refs.length=0;return this.start()}, effects, timers, cleared };
}

test('la bienvenida usa el paisaje y los textos de Polymet sin botón de comenzar', async () => {
  const ui = await splash();
  const tree = JSON.stringify(ui.start());
  assert.match(tree, /Organiza tu camporee antes, durante y después del evento/);
  assert.match(tree, /polymet-camp-preparation.svg/);
  assert.match(tree, /Club de Conquistadores/);
  assert.doesNotMatch(tree, /Comenzar|"type":"button"|"type":"a"/);
});

test('el registro y su confirmación entran directamente sin repetir la bienvenida', async () => {
  const ui = await splash(false, '/signup');
  assert.equal(ui.render(), null);
  ui.effects.forEach(effect => effect());
  assert.equal(ui.timers.length, 0);
});

test('la pantalla pasa a lista y se retira sola sin cambiar la ruta de la sesión', async () => {
  const ui = await splash(); ui.start();
  const cleanup = ui.effects.at(-1)();
  assert.equal(ui.timers.length, 2);
  assert.ok(ui.timers.every(timer => timer.delay <= 1800));
  ui.timers[0].callback();
  assert.match(JSON.stringify(ui.render()), /¡Todo listo!/);
  ui.timers[1].callback();
  assert.equal(ui.render(), null);
  cleanup();
  assert.equal(ui.cleared.length, 2);
});

test('con movimiento reducido entra sin una espera larga', async () => {
  const ui = await splash(true); ui.start(); ui.effects.at(-1)();
  assert.ok(ui.timers.every(timer => timer.delay <= 200));
  ui.timers.forEach(timer => timer.callback());
  assert.equal(ui.render(), null);
});

test('offline navigation never shows the launch screen or starts its loading timers',async()=>{
 for(const pathname of ['/offline','/tasks','/more','/o/50000000-0000-4000-8000-000000000001/c/60000000-0000-4000-8000-000000000001/program']){
  const ui=await splash(false,pathname,{online:false});
  assert.equal(ui.render(),null);assert.equal(ui.start(),null);
  ui.effects.forEach(effect=>effect());assert.equal(ui.timers.length,0);
 }
});

test('native navigation in the same tab does not repeat the launch screen',async()=>{
 const storage=new Map();const first=await splash(false,'/',{storage});
 assert.notEqual(first.start(),null);
 for(const pathname of ['/tasks','/more']){
  const next=await splash(false,pathname,{storage});
  assert.equal(next.render(),null);assert.equal(next.start(),null);
  next.effects.forEach(effect=>effect());assert.equal(next.timers.length,0);
 }
});

test('blocked session storage does not prevent dismissal or restart splash on effect replay',async()=>{
 const ui=await splash(false,'/',{storageBlocked:true});assert.notEqual(ui.start(),null);
 ui.effects.forEach(effect=>effect());ui.timers.forEach(timer=>timer.callback());
 assert.equal(ui.render(),null);ui.effects.forEach(effect=>effect());assert.equal(ui.render(),null);
});

test('installed PWA does not show another launch cover on Android or iOS',async()=>{
 for(const options of [{standalone:true},{iosStandalone:true}]){
  const ui=await splash(false,'/',options);
  assert.equal(ui.start(),null);ui.effects.forEach(effect=>effect());assert.equal(ui.timers.length,0);
 }
});

test('reload and history restoration never replay the welcome even without a session marker',async()=>{
 for(const navigationType of ['reload','back_forward']){
  const ui=await splash(false,'/',{navigationType});
  assert.equal(ui.start(),null);ui.effects.forEach(effect=>effect());assert.equal(ui.timers.length,0);
 }
});

test('internal full-page navigation does not replay the launch when session storage is blocked or cleared',async()=>{
 for(const storageBlocked of [false,true]){
  const ui=await splash(false,'/tasks',{referrer:'https://camporee.test/program',storageBlocked});
  assert.equal(ui.start(),null);ui.effects.forEach(effect=>effect());assert.equal(ui.timers.length,0);
 }
});

test('component remount in the same document cannot repeat the welcome with blocked storage',async()=>{
 const ui=await splash(false,'/',{storageBlocked:true});assert.notEqual(ui.start(),null);
 ui.effects.forEach(effect=>effect());ui.timers.forEach(timer=>timer.callback());assert.equal(ui.render(),null);
 assert.equal(ui.remount(),null);
});

test('changing route dismisses the startup cover immediately and returning does not restore it',async()=>{
 const ui=await splash();assert.notEqual(ui.start(),null);
 assert.equal(ui.navigate('/tasks'),null);ui.effects.forEach(effect=>effect());
 assert.equal(ui.navigate('/'),null);
});

test('a fresh browser visit from an external site may still show the welcome once',async()=>{
 const ui=await splash(false,'/',{referrer:'https://example.com/'});
 assert.notEqual(ui.start(),null);
});

const event={name:'Bi-Camporee',theme:'Legado',status:'active',starts_on:'2026-11-06',ends_on:'2026-11-09',time_zone:'America/Santo_Domingo'};
const scope='00000000-0000-4000-8000-000000000001:57ad4342-8b3f-4735-a467-7e04c318a705';
const scopedPath='/o/'+scope.replace(':','/c/');
const during=Date.parse('2026-11-06T12:00:00Z');
test('active Legado launches animate in installed apps and dismiss within 2.3 seconds',async()=>{
 const ui=await splash(false,scopedPath,{camporee:event,scope,standalone:true,now:during});
 assert.equal(ui.start().type,'legado-screen');ui.effects.at(-1)();
 assert.equal(Math.max(...ui.timers.map(t=>t.delay)),2300);
 ui.timers.forEach(t=>t.callback());assert.equal(ui.render(),null);
});
test('cached active branding can launch offline, with reduced motion and no repeated internal navigation',async()=>{
 const local=new Map([[`camporee:launch:${scope}`,JSON.stringify(launch.launchSchedule(event))]]);
 const ui=await splash(true,'/offline',{online:false,standalone:true,local,search:'?from='+encodeURIComponent(scopedPath),now:during});
 assert.equal(ui.start().type,'legado-screen');ui.effects.at(-1)();
 assert.ok(ui.timers.every(t=>t.delay<=200));
 const internal=await splash(false,scopedPath+'/program',{camporee:event,scope,now:during,referrer:'https://camporee.test'+scopedPath});
 assert.equal(internal.start(),null);
});
test('no Legado screen before the start, after the last local day, for another camporee or missing offline branding',async()=>{
 for(const options of [{now:Date.parse('2026-11-06T03:59:59Z')},{now:Date.parse('2026-11-10T04:00:00Z')},{camporee:{...event,theme:'Otro'}},{camporee:{...event,status:'finished'}}]){
  const ui=await splash(false,scopedPath,{camporee:event,scope,standalone:true,now:during,...options});assert.equal(ui.start(),null);
 }
 const root=await splash(false,scopedPath,{now:during});assert.equal(root.start(),null);
});
test('offline startup at / uses the last event but never overrides another explicit event',async()=>{
 const local=new Map([['camporee:launch:last-scope',scope],[`camporee:launch:${scope}`,JSON.stringify(launch.launchSchedule(event))]]);
 const ui=await splash(false,'/offline',{online:false,standalone:true,local,search:'?from=%2F',now:during});
 assert.equal(ui.start().type,'legado-screen');
 const other=scopedPath.replace('57ad4342','77ad4342');
 const unprepared=await splash(false,'/offline',{online:false,local,search:'?from='+encodeURIComponent(other),now:during});
 assert.equal(unprepared.start(),null);
 const invalid=await splash(false,'/offline',{online:false,local:new Map([['camporee:launch:last-scope','invalid']]),now:during});
 assert.equal(invalid.start(),null);
});
