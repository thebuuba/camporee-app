import test from 'node:test';
import assert from 'node:assert/strict';
import * as dates from '../lib/date.ts';
import * as locale from '../lib/camporee-locale.ts';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const {loadBindings,transform}=createRequire(import.meta.url)('next/dist/build/swc');

test('activities without an end remain ongoing for one hour with an exclusive end boundary',()=>{
  assert.equal(typeof dates.isEventOngoing,'function');
  const event={starts_at:'2026-10-11T22:00:00Z',ends_at:null};
  assert.equal(dates.isEventOngoing(event,Date.parse('2026-10-11T22:00:00Z')),true);
  assert.equal(dates.isEventOngoing(event,Date.parse('2026-10-11T22:59:59Z')),true);
  assert.equal(dates.isEventOngoing(event,Date.parse('2026-10-11T23:00:00Z')),false);
});
test('editing and saving uses the camporee timezone including daylight saving',()=>{
  assert.equal(typeof locale.camporeeDateTimeIso,'function');
  assert.equal(typeof locale.camporeeDateTimeInput,'function');
  assert.equal(locale.camporeeDateTimeIso('2026-10-11T18:00','America/Santo_Domingo'),'2026-10-11T22:00:00.000Z');
  assert.equal(locale.camporeeDateTimeInput('2026-10-11T22:00:00Z','Asia/Tokyo'),'2026-10-12T07:00');
  assert.equal(locale.camporeeDateTimeIso('2027-03-14T18:00','America/New_York'),'2027-03-14T22:00:00.000Z');
  assert.throws(()=>locale.camporeeDateTimeIso('2027-03-14T02:30','America/New_York'));
});

async function render(path,props){
  await loadBindings();
  const {code}=await transform(await readFile(path,'utf8'),{filename:path,jsc:{parser:{syntax:'typescript',tsx:true},transform:{react:{runtime:'automatic'}},target:'es2022'},module:{type:'commonjs'}});
  const modules={
    'react/jsx-runtime':{jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})},
    react:{useState:initial=>[typeof initial==='function'?initial():initial,()=>{}],useMemo:fn=>fn(),useEffect(){}},
    'next/navigation':{useRouter:()=>({})},'@/lib/supabase/client':{createClient:()=>({})},
    '@/lib/date':dates,'@/lib/camporee-locale':locale,
  };
  const module={exports:{}};
  const FixedDate=class extends Date{constructor(value){super(value??'2026-10-12T05:00:00Z');}static now(){return Date.parse('2026-10-12T05:00:00Z');}};
  vm.runInNewContext(code,{module,exports:module.exports,Date:FixedDate,require:name=>modules[name]??new Proxy({__esModule:true,default:name},{get:(obj,key)=>obj[key]??String(key)})});
  return JSON.stringify(module.exports.default(props));
}
test('preparation homepage still shows the current meeting',async()=>{
  const output=await render('app/home-dashboard.tsx',{
    userId:'user',firstName:'Ana',avatarUrl:null,
    camporee:{id:'camp',name:'Camporee',currency:'DOP',time_zone:'America/Santo_Domingo'},phase:'before',
    currentEvent:{id:'meeting',title:'Reunión directiva',starts_at:'2026-10-11T22:00:00Z'},nextEvent:null,preparation:{},
  });
  assert.match(output,/Reunión directiva/);assert.match(output,/En curso/);
});
test('Today includes events on the camporee calendar day despite a different device day',async()=>{
  const output=await render('app/program/program-manager.tsx',{
    camporeeId:'camp',canEdit:false,areas:[],eventMode:true,timeZone:'Asia/Tokyo',
    initialEvents:[{id:'meeting',title:'Reunión de hoy en Tokio',starts_at:'2026-10-11T23:00:00Z',ends_at:null}],
  });
  assert.match(output,/Reunión de hoy en Tokio/);
});
