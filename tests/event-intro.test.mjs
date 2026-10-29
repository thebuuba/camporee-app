import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import * as clocks from '../lib/camporee-card.ts';
import * as locale from '../lib/camporee-locale.ts';

const model = () => import('../lib/event-intro.ts');
const event = { id:'camp', starts_on:'2026-11-06', ends_on:'2026-11-09', status:'planning', time_zone:'America/Santo_Domingo' };
const at = value => Date.parse(value);

test('Camporee intro is eligible only on its first civil day, even before the status is updated', async () => {
  const { eventIntroCandidates } = await model();
  for (const [instant, expected] of [
    ['2026-11-06T03:59:59Z', []],
    ['2026-11-06T04:00:00Z', ['camporee']],
    ['2026-11-07T03:59:59Z', ['camporee']],
    ['2026-11-07T04:00:00Z', []],
    ['2026-11-10T12:00:00Z', []],
  ]) assert.deepEqual(eventIntroCandidates(event, at(instant), null).map(item=>item.kind), expected);
  assert.deepEqual(eventIntroCandidates({...event,status:'archived'},at('2026-11-06T12:00:00Z'),null),[]);
  assert.deepEqual(eventIntroCandidates({...event,status:'finished'},at('2026-11-06T12:00:00Z'),null),[]);
});

test('Sabbath uses the real Friday and Saturday sunset boundaries and the same marker across midnight', async () => {
  const { eventIntroCandidates, regionalSabbathPeriod } = await model();
  const friday={date:'2026-11-06',weekday:5,sunsetAt:at('2026-11-06T22:08:42Z')};
  const saturday={date:'2026-11-07',weekday:6,sunsetAt:at('2026-11-07T22:08:20Z')};
  assert.equal(regionalSabbathPeriod(at('2026-11-06T22:08:41Z'),friday),null);
  const first=regionalSabbathPeriod(at('2026-11-06T22:08:42Z'),friday);
  const next=regionalSabbathPeriod(at('2026-11-07T14:00:00Z'),saturday);
  assert.equal(first.key,'2026-11-06'); assert.equal(next.key,first.key);
  assert.deepEqual(eventIntroCandidates(event,at('2026-11-06T22:08:42Z'),first).map(item=>item.kind),['camporee','sabbath']);
  assert.deepEqual(eventIntroCandidates(event,at('2026-11-07T14:00:00Z'),next).map(item=>item.kind),['sabbath']);
  assert.equal(regionalSabbathPeriod(at('2026-11-07T22:08:20Z'),saturday),null);
  assert.equal(regionalSabbathPeriod(at('2026-11-08T14:00:00Z'),saturday),null);
  assert.equal(regionalSabbathPeriod(at('2026-11-07T14:00:00Z'),null),null);
  assert.deepEqual(eventIntroCandidates({...event,starts_on:'2026-11-08'},at('2026-11-07T14:00:00Z'),next),[]);
});

test('seen intros survive reopening, are isolated by person and event, and blocked storage cannot break entry', async () => {
  const { claimEventIntro } = await model();
  const rows=new Map(); const storage={getItem:key=>rows.get(key)??null,setItem:(key,value)=>rows.set(key,value)};
  assert.equal(claimEventIntro(storage,'person-a:org:camp','camporee:2026-11-06'),true);
  assert.equal(claimEventIntro(storage,'person-a:org:camp','camporee:2026-11-06'),false);
  assert.equal(claimEventIntro(storage,'person-b:org:camp','camporee:2026-11-06'),true);
  assert.equal(claimEventIntro(storage,'person-a:org:other','camporee:2026-11-06'),true);
  assert.equal(claimEventIntro(storage,'person-a:org:camp','sabbath:2026-11-06'),true);
  assert.equal(claimEventIntro(storage,'person-a:org:camp','sabbath:2026-11-06'),false);
  const blocked={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}};
  assert.equal(claimEventIntro(blocked,'blocked:org:camp','camporee:2026-11-06'),true);
  assert.equal(claimEventIntro(blocked,'blocked:org:camp','camporee:2026-11-06'),false);
});

async function controller(instant,{sunset=null,storage=new Map(),userId='controller-user'}={}){
  const {loadBindings,transform}=createRequire(import.meta.url)('next/dist/build/swc');
  await loadBindings();
  const {code}=await transform(await readFile(new URL('../app/components/event-intro/event-intro.tsx',import.meta.url),'utf8'),{filename:'event-intro.tsx',jsc:{parser:{syntax:'typescript',tsx:true},target:'es2022',transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}});
  let cursor=0,changed=false,now=at(instant);const values=[],dependencies=[],pending=[],cleanups=[],listeners=new Map();
  const jsx=(type,props)=>({type,props});
  const modules={
    react:{useState(initial){const i=cursor++;if(!(i in values))values[i]=initial;return [values[i],value=>{if(!Object.is(values[i],value)){values[i]=value;changed=true;}}];},useEffect(effect,deps){const i=cursor++;if(!dependencies[i]||deps.some((value,j)=>!Object.is(value,dependencies[i][j]))){dependencies[i]=deps;pending.push(()=>{cleanups[i]?.();cleanups[i]=effect();});}},useCallback(callback){cursor++;return callback;}},
    'react/jsx-runtime':{jsx,jsxs:jsx},'react-dom':{createPortal:jsx=>jsx},
    '@/lib/camporee-card':clocks,'@/lib/camporee-locale':locale,'@/lib/event-intro':await model(),
    '@/supabase/functions/_shared/sunset':{supportsSunsetRegion:()=>true},
    '../camporee-card/daily-sunset':{useDailySunset:()=>sunset},
    './camporee-mode-intro':{CamporeeModeIntro:'camporee-intro'},'./sabbath-mode-intro':{SabbathModeIntro:'sabbath-intro'},
  };
  const module={exports:{}};
  class Clock extends Date{static now(){return now;}}
  vm.runInNewContext(code,{module,exports:module.exports,require:name=>modules[name],Date:Clock,window:{localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},setInterval:()=>1,clearInterval(){},addEventListener:(name,handler)=>listeners.set(name,handler),removeEventListener:name=>listeners.delete(name)},document:{body:{},addEventListener:(name,handler)=>listeners.set(name,handler),removeEventListener:name=>listeners.delete(name)}});
  const props={userId,organizationId:'org',organizer:'Club real',memberName:'Ana',camporee:{...event,id:'controller-event',name:'Camporee real',theme:null,location:'Santiago'}};
  const render=()=>{cursor=0;return module.exports.default(props);};
  function settle(){let tree;for(let i=0;i<8;i++){changed=false;tree=render();pending.splice(0).forEach(effect=>effect());if(!changed)return tree;}throw Error('render loop');}
  return {render,settle,cleanup(){cleanups.forEach(cleanup=>cleanup?.());},focus(instant){now=at(instant);listeners.get('focus')?.();return settle();}};
}

test('the controller starts hidden, opens each intro once in order and does not replay on focus or remount',async()=>{
  const sunset={date:'2026-11-06',weekday:5,sunsetAt:at('2026-11-06T22:08:42Z')};
  const storage=new Map();
  const ui=await controller('2026-11-06T23:00:00Z',{sunset,storage});
  assert.equal(ui.render(),null);
  let tree=ui.settle();assert.equal(tree.props.children.type,'camporee-intro');
  assert.equal(tree.props.children.props.memberName,'Ana');
  tree.props.children.props.onClose();tree=ui.settle();assert.equal(tree.props.children.type,'sabbath-intro');
  tree.props.children.props.onClose();assert.equal(ui.settle(),null);
  assert.equal(ui.focus('2026-11-07T00:00:00Z'),null);ui.cleanup();
  const reopened=await controller('2026-11-06T23:30:00Z',{sunset,storage});
  assert.equal(reopened.settle(),null);reopened.cleanup();
});

test('the Sabbath overlay expires at the Saturday sunset',async()=>{
  const sunset={date:'2026-11-07',weekday:6,sunsetAt:at('2026-11-07T22:08:20Z')};
  const ui=await controller('2026-11-07T14:00:00Z',{sunset,userId:'saturday-user'});
  assert.equal(ui.settle().props.children.type,'sabbath-intro');
  assert.equal(ui.focus('2026-11-07T22:08:20Z'),null);ui.cleanup();
});
