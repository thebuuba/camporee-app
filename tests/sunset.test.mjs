import test from 'node:test';
import assert from 'node:assert/strict';
const model=()=>import('../supabase/functions/_shared/sunset.ts');
const report=(id,sunset)=>({id,label:id,timeZone:'America/Santo_Domingo',date:'2026-10-30',sunset,sunrise:'2026-10-30T10:43:00-00:00'});
test('daily source requests only fixed cities, validates its date and preserves the reported minute',async()=>{
 const {fetchSunsetTimes}=await model();
 const urls=[];
 const rows=await fetchSunsetTimes('2026-10-30',async url=>{
  urls.push(String(url));
  return new Response(JSON.stringify({date:'2026-10-30',tzid:'America/Santo_Domingo',sunset:'2026-10-30T18:10:42-04:00',sunrise:'2026-10-30T06:43:00-04:00'}));
 });
 assert.equal(rows.length,2);assert.equal(urls.length,2);
 assert.ok(urls.every(url=>url.startsWith('https://api.sunrise-sunset.org/v2?')&&url.includes('date=2026-10-30')));
 assert.equal(rows[0].sunset,'2026-10-30T18:10:42-04:00');
});
test('Friday window uses the same Santiago minute displayed on Home, deduplicates by civil date and expires after five minutes',async()=>{
 const {fridaySunsetReminder}=await model();
 const rows=[report('santiago','2026-10-30T18:10:42-04:00'),report('moca','2026-10-30T18:09:59-04:00')];
 const due=Date.parse('2026-10-30T20:40:00Z');
 assert.equal(fridaySunsetReminder(due-1,rows),null);
 assert.equal(fridaySunsetReminder(due,rows).date,'2026-10-30');
 assert.equal(fridaySunsetReminder(due,rows).expires,due+300000);
 assert.equal(fridaySunsetReminder(due+300000,rows),null);
 assert.equal(fridaySunsetReminder(due+86400000,rows),null);
});
test('network errors, wrong dates, invalid times and a missing Santiago reference never create an alert',async()=>{
 const {fetchSunsetTimes,fridaySunsetReminder}=await model();
 for(const body of [{date:'2026-10-29',sunset:'2026-10-29T22:10:00Z'},{date:'2026-10-30',sunset:null},{error:'rate_limit'}]){
  assert.deepEqual(await fetchSunsetTimes('2026-10-30',async()=>new Response(JSON.stringify(body))),[]);
 }
 assert.deepEqual(await fetchSunsetTimes('2026-10-30',async()=>{throw Error('network')}),[]);
 assert.equal(fridaySunsetReminder(Date.parse('2026-10-30T20:40:00Z'),[]),null);
 assert.equal(fridaySunsetReminder(Date.parse('2026-10-30T20:40:00Z'),[report('moca','2026-10-30T22:10:00Z')]),null);
});

test('the single Santiago clock and its reminder survive an unavailable secondary city',async()=>{
 const {sunsetReference,fridaySunsetReminder}=await model();
 const rows=[report('santiago','2026-10-30T22:10:00Z')];
 assert.equal(sunsetReference(rows,'2026-10-30')?.id,'santiago');
 assert.equal(fridaySunsetReminder(Date.parse('2026-10-30T20:40:00Z'),rows)?.date,'2026-10-30');
});

test('daily text switches to past tense at the real sunset instant',async()=>{
 const {sunsetStatus}=await model();assert.equal(typeof sunsetStatus,'function');
 const rows=[{...report('santiago','2026-10-27T18:11:27-04:00'),date:'2026-10-27'}];
 assert.equal(sunsetStatus(Date.parse('2026-10-27T22:11:26.999Z'),rows).passed,false);
 const after=sunsetStatus(Date.parse('2026-10-27T22:11:27Z'),rows);
 assert.equal(after.passed,true);assert.equal(after.label,'La puesta de sol fue a las');
 assert.equal(after.time,'6:11 p. m.');assert.equal(after.greeting,null);
 assert.equal(sunsetStatus(Date.parse('2026-10-28T05:00:00Z'),rows),null);
});

test('Friday welcomes Sabbath, Saturday preserves the greeting until sunset then welcomes the week',async()=>{
 const {sunsetStatus}=await model();assert.equal(typeof sunsetStatus,'function');
 const friday=[report('santiago','2026-10-30T18:10:42-04:00')];
 const saturday=[{...report('santiago','2026-10-31T18:10:10-04:00'),date:'2026-10-31'}];
 assert.equal(sunsetStatus(Date.parse('2026-10-30T22:10:41Z'),friday).greeting,null);
 assert.equal(sunsetStatus(Date.parse('2026-10-31T01:00:00Z'),friday).greeting,'¡Feliz sábado!');
 assert.equal(sunsetStatus(Date.parse('2026-10-31T15:00:00Z'),saturday).greeting,'¡Feliz sábado!');
 assert.equal(sunsetStatus(Date.parse('2026-10-31T22:10:10Z'),saturday).greeting,'¡Feliz semana!');
});

test('post-sunset notifications use distinct daily keys and never run early or after their delivery window',async()=>{
 const {sunsetTransitionReminder}=await model();assert.equal(typeof sunsetTransitionReminder,'function');
 for(const [date,title] of [['2026-10-30','¡Feliz sábado!'],['2026-10-31','¡Feliz semana!']]){
  const rows=[{...report('santiago',`${date}T18:10:42-04:00`),date}];
  const due=Date.parse(rows[0].sunset);
  assert.equal(sunsetTransitionReminder(due-1,rows),null);
  const alert=sunsetTransitionReminder(due,rows);
  assert.equal(alert.title,title);assert.equal(alert.key,`sunset-passed:${date}`);
  assert.equal(alert.expires,due+300000);assert.match(alert.body,/puesta de sol ya pasó/);
  assert.equal(sunsetTransitionReminder(alert.expires,rows),null);
 }
 const weekday=[{...report('santiago','2026-10-27T18:11:27-04:00'),date:'2026-10-27'}];
 assert.equal(sunsetTransitionReminder(Date.parse(weekday[0].sunset),weekday),null);
});
