import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { launchInitScript } from '../lib/launch-bootstrap.ts';
import { isLegadoLaunch } from '../lib/legado-launch.ts';

const scope='50000000-0000-4000-8000-000000000001:60000000-0000-4000-8000-000000000001';
const path='/o/'+scope.replace(':','/c/');
const schedule={legado:true,status:'planning',startsOn:'2026-11-06',endsOn:'2026-11-09',timeZone:'America/Santo_Domingo'};
const localBrand=()=>new Map([['camporee:launch:last-scope',scope],[`camporee:launch:${scope}`,JSON.stringify(schedule)]]);
function boot({pathname=path,search='',online=true,referrer='',navigationType='navigate',local=localBrand(),session=new Map(),storageBlocked=false,reduced=false,imageFails=false,instant='2026-11-05T12:00:00Z'}={}){
 let now=0,id=0,queries=0;const timers=new Map(),attrs=new Map(),events=[],listeners=new Map();
 const setTimeout=(callback,delay=0)=>{timers.set(++id,{callback,at:now+delay});return id;};
 const storage=rows=>({getItem:key=>{if(storageBlocked)throw Error('blocked');return rows.get(key)??null;},setItem:(key,value)=>{if(storageBlocked)throw Error('blocked');rows.set(key,value);}});
 const dataset=new Proxy({}, {get:(_,key)=>attrs.get('data-'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())),set:(_,key,value)=>{attrs.set('data-'+key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase()),value);return true;}});
 const root={dataset,removeAttribute:key=>attrs.delete(key)};
 const window={matchMedia:()=>({matches:reduced}),addEventListener:(name,cb)=>listeners.set(name,cb),dispatchEvent:event=>events.push(event.type)};
 class Clock extends Date {static now(){return Date.parse(instant)+now;}}
 const context=vm.createContext({window,document:{documentElement:root,referrer,querySelector(){queries++;return{decode:()=>imageFails?Promise.reject(Error('image')):Promise.resolve()};}},location:{pathname,search,origin:'https://camporee.test'},navigator:{onLine:online},localStorage:storage(local),sessionStorage:storage(session),performance:{now:()=>now,getEntriesByType:()=>[{type:navigationType}]},Date:Clock,URL,URLSearchParams,Event,setTimeout,clearTimeout:id=>timers.delete(id),requestAnimationFrame:callback=>setTimeout(callback,16)});
 vm.runInContext(launchInitScript,context);
 async function advance(ms){const target=now+ms;for(;;){await new Promise(resolve=>setImmediate(resolve));const next=[...timers].sort((a,b)=>a[1].at-b[1].at).find(([,timer])=>timer.at<=target);if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].callback();}now=target;await new Promise(resolve=>setImmediate(resolve));}
 return {attrs,events,session,window,advance,get queries(){return queries},ready:()=>window.__camporeeLaunch.ready(),event:(value=schedule,selected=scope)=>window.__camporeeLaunch.event(value,selected),pagehide:()=>listeners.get('pagehide')?.()};
}

test('the head selects branding before touching body markup or waiting for hydration',()=>{
 const ui=boot();assert.equal(ui.attrs.get('data-camporee-launch'),'legado');assert.equal(ui.attrs.get('data-camporee-launch-stage'),'loading');assert.equal(ui.queries,0);
});
test('slow hydration keeps the loader until real readiness, then blends before releasing intros',async()=>{
 const ui=boot();await ui.advance(5000);assert.equal(ui.attrs.get('data-camporee-launch-stage'),'loading');assert.deepEqual(ui.events,[]);
 ui.ready();await ui.advance(100);assert.equal(ui.attrs.get('data-camporee-launch-stage'),'leaving');assert.deepEqual(ui.events,[]);
 await ui.advance(420);assert.equal(ui.attrs.has('data-camporee-launch'),false);assert.deepEqual(ui.events,['camporee:launch-finished']);
 ui.event();ui.ready();assert.equal(ui.attrs.size,0);
});
test('fast startup has a short anti-flicker hold, not a fixed 2.3 second intro',async()=>{
 const ui=boot();ui.ready();await ui.advance(300);assert.equal(ui.attrs.get('data-camporee-launch-stage'),'loading');await ui.advance(100);assert.equal(ui.attrs.get('data-camporee-launch-stage'),'leaving');await ui.advance(420);assert.equal(ui.attrs.size,0);
});
test('reduced motion still waits for the actual content and then releases promptly',async()=>{
 const ui=boot({reduced:true});await ui.advance(2500);assert.equal(ui.attrs.get('data-camporee-launch-stage'),'loading');ui.ready();await ui.advance(150);assert.equal(ui.attrs.size,0);
});
test('first visit uses the app surface and may resolve branding before revealing the page',async()=>{
 const ui=boot({local:new Map()});assert.equal(ui.attrs.get('data-camporee-launch'),'generic');ui.event();assert.equal(ui.attrs.get('data-camporee-launch'),'legado');ui.ready();await ui.advance(850);assert.equal(ui.attrs.size,0);
});
test('same-session reloads, internal navigation, auth and history never create a late cover',async()=>{
 const session=new Map();boot({session});
 for(const options of [{session,navigationType:'reload'},{navigationType:'back_forward'},{referrer:'https://camporee.test/tasks'},{pathname:'/login'},{pathname:'/signup'},{pathname:'/auth/callback'},{pathname:path+'/created'},{pathname:path+'/print/meals'}]){
  const ui=boot(options);assert.equal(ui.attrs.size,0);ui.event();ui.ready();await ui.advance(1000);assert.equal(ui.attrs.size,0);
 }
});
test('the first reload can show updated branding once and blocked storage cannot trap the page',async()=>{
 const ui=boot({navigationType:'reload'});assert.equal(ui.attrs.get('data-camporee-launch'),'legado');
 const blocked=boot({storageBlocked:true});assert.equal(blocked.attrs.get('data-camporee-launch'),'generic');blocked.event();blocked.ready();await blocked.advance(850);assert.equal(blocked.attrs.size,0);
 assert.equal(boot({storageBlocked:true,navigationType:'reload'}).attrs.size,0);
});
test('offline startup honors the selected event and / uses only the last saved public branding',async()=>{
 for(const search of ['?from=%2F','?from='+encodeURIComponent(path)]){
  const ui=boot({pathname:'/offline',search,online:false});assert.equal(ui.attrs.get('data-camporee-launch'),'legado');ui.ready();await ui.advance(850);assert.equal(ui.attrs.size,0);
 }
 const other=path.replace('60000000','70000000');
 for(const options of [{search:'?from='+encodeURIComponent(other)},{local:new Map()},{storageBlocked:true}])assert.equal(boot({pathname:'/offline',online:false,...options}).attrs.size,0);
});
test('cached eligibility agrees with current branding rules and never reuses another event',()=>{
 for(const value of [schedule,{...schedule,status:'active'},{...schedule,status:'finished'},{...schedule,status:'archived'},{...schedule,legado:false},{...schedule,timeZone:'invalid'},{...schedule,endsOn:'2026-11-04'}]){
  const local=new Map([[`camporee:launch:${scope}`,JSON.stringify(value)]]);const ui=boot({local});assert.equal(ui.attrs.get('data-camporee-launch')==='legado',isLegadoLaunch(value,Date.parse('2026-11-05T12:00:00Z')));
 }
});
test('failed images and missing hydration fail open, and late chunks cannot re-cover the app',async()=>{
 const image=boot({imageFails:true});image.ready();await image.advance(850);assert.equal(image.attrs.size,0);
 const stalled=boot();await stalled.advance(12000);assert.equal(stalled.attrs.size,0);stalled.event();stalled.ready();await stalled.advance(1000);assert.equal(stalled.attrs.size,0);assert.equal(stalled.events.length,1);
});
test('a page placed in the history cache is never restored behind its startup cover',()=>{
 const ui=boot();ui.pagehide();assert.equal(ui.attrs.size,0);ui.event();ui.ready();assert.equal(ui.attrs.size,0);
});
