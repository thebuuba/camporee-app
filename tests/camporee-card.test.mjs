import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const postcss=createRequire(import.meta.url)('postcss');

async function helpers(){try{return await import('../lib/camporee-card.ts')}catch(error){if(error.code==='ERR_MODULE_NOT_FOUND')return {};throw error}}

test('scene geometry ignores subpixel floating-point differences between server and browser',async()=>{
 const {sceneCoordinate}=await helpers();assert.equal(typeof sceneCoordinate,'function');
 assert.equal(sceneCoordinate(-4.123103506963432),-4.123);
 assert.equal(sceneCoordinate(-4.123103506963446),-4.123);
});

test('the scene follows the camporee clock across a different browser date',async()=>{
 const {camporeeClock,getTimeOfDay}=await helpers();
 assert.equal(typeof camporeeClock,'function');
 const rd=camporeeClock(Date.parse('2026-11-07T02:30:00Z'),'America/Santo_Domingo');
 assert.equal(rd.date,'2026-11-06');assert.equal(rd.hour,22.5);assert.equal(rd.weekday,5);
 assert.equal(getTimeOfDay(rd.hour),'noche');
 assert.equal(getTimeOfDay(camporeeClock(Date.parse('2026-11-07T02:30:00Z'),'Asia/Tokyo').hour),'manana');
});

test('countdown includes seconds and never becomes negative',async()=>{
 const {splitDuration}=await helpers();assert.equal(typeof splitDuration,'function');
 assert.deepEqual(splitDuration(90061000),{days:1,hours:1,minutes:1,seconds:1});
 assert.deepEqual(splitDuration(-1),{days:0,hours:0,minutes:0,seconds:0});
});

test('live schedule retains an overnight event and advances without reloading',async()=>{
 const {liveSchedule}=await helpers();assert.equal(typeof liveSchedule,'function');
 const rows=[{id:'night',starts_at:'2026-11-07T03:30:00Z',ends_at:'2026-11-07T05:00:00Z'},{id:'morning',starts_at:'2026-11-07T11:00:00Z',ends_at:null},{id:'tomorrow',starts_at:'2026-11-08T11:00:00Z',ends_at:null}];
 const now=Date.parse('2026-11-07T04:30:00Z');
 assert.equal(liveSchedule(rows,now,'America/Santo_Domingo').current.id,'night');
 assert.deepEqual(liveSchedule(rows,now,'America/Santo_Domingo').upcoming.map(row=>row.id),['morning']);
 assert.equal(liveSchedule(rows,Date.parse('2026-11-07T12:00:00Z'),'America/Santo_Domingo').current,null);
});

test('Sabbath boundaries use the recorded program instead of an invented sunset',async()=>{
 const {sabbathState}=await helpers();assert.equal(typeof sabbathState,'function');
 const rows=[{title:'Recepción del sábado',starts_at:'2026-11-06T22:10:00Z'},{title:'Despedida del sábado',starts_at:'2026-11-07T22:09:00Z'}];
 assert.equal(sabbathState(rows,Date.parse('2026-11-06T22:09:00Z'),'America/Santo_Domingo').active,false);
 assert.equal(sabbathState(rows,Date.parse('2026-11-06T22:10:00Z'),'America/Santo_Domingo').active,true);
 assert.equal(sabbathState(rows,Date.parse('2026-11-07T22:09:00Z'),'America/Santo_Domingo').active,false);
 assert.equal(sabbathState([],Date.parse('2026-11-07T16:00:00Z'),'America/Santo_Domingo').endsAt,null);
});

test('long camporees keep a readable seven-day tracker around today',async()=>{
 const {camporeeDayWindow}=await helpers();assert.equal(typeof camporeeDayWindow,'function');
 const view=camporeeDayWindow('2026-11-01','2026-11-30','2026-11-18');
 assert.equal(view.currentDay,18);assert.equal(view.totalDays,30);assert.equal(view.days.length,7);
 assert.ok(view.days.some(day=>day.number===18));
 assert.equal(camporeeDayWindow('2026-11-06','2026-11-09','2026-11-07').days[1].sabbath,true);
});

test('Polymet utilities cannot restyle other panels and keep day columns above legacy grid rules',async()=>{
 const css=postcss.parse(await readFile(new URL('../app/camporee-card.generated.css',import.meta.url),'utf8'));
 let dynamicColumns=false,reducedMotion=false;
 css.walkRules(rule=>{
  if(rule.parent.type==='atrule'&&rule.parent.name.endsWith('keyframes'))return;
  assert.ok(rule.selectors.every(selector=>selector.includes('#camporee-card')),`unscoped styles: ${rule.selector}`);
  rule.walkDecls(declaration=>{
   if(declaration.prop==='grid-template-columns'&&declaration.value.includes('--camporee-days')){assert.equal(declaration.important,true);dynamicColumns=true;}
   if(rule.parent.type==='atrule'&&rule.parent.params.includes('prefers-reduced-motion')&&declaration.prop==='animation'){assert.equal(declaration.value,'none');assert.equal(declaration.important,true);reducedMotion=true;}
  });
 });
 assert.equal(dynamicColumns,true);assert.equal(reducedMotion,true);
});
