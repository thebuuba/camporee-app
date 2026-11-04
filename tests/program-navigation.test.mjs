import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import * as dates from '../lib/date.ts';
import * as locale from '../lib/camporee-locale.ts';

const {loadBindings,transform}=createRequire(import.meta.url)('next/dist/build/swc');
const filename='app/program/program-manager.tsx';
const compiled=(async()=>{
  await loadBindings();
  return (await transform(await readFile(filename,'utf8'),{
    filename,jsc:{parser:{syntax:'typescript',tsx:true},transform:{react:{runtime:'automatic'}},target:'es2022'},module:{type:'commonjs'},
  })).code;
})();

const sampleEvents=[
  {id:'night',title:'Programa nocturno',starts_at:'2026-11-07T19:00:00-04:00',description:'Incluye:\n• Master Chef\n• Musical Acto 2\n• Concierto',location:'Capilla',area_id:'events'},
  {id:'arrival',title:'Llegada de las avanzadas',starts_at:'2026-11-06T07:00:00-04:00',ends_at:'2026-11-06T23:00:00-04:00',area_id:'camp'},
  {id:'midnight',title:'Toque de queda',starts_at:'2026-11-08T00:00:00-04:00',description:'Cierre de la jornada del sábado.',area_id:'camp'},
  {id:'games',title:'Eventos',starts_at:'2026-11-08T15:00:00-04:00',description:'• Código del pasado\n• Parchís Bíblico',area_id:'events'},
];

function all(node,predicate){
  if(Array.isArray(node))return node.flatMap(child=>all(child,predicate));
  if(!node||typeof node!=='object')return [];
  return [...(predicate(node)?[node]:[]),...all(node.props?.children,predicate)];
}
const rows=tree=>all(tree,node=>node.type==='article');
const rowIds=tree=>rows(tree).map(row=>row.props.id);
const detail=tree=>all(tree,node=>node.type==='sheet')[0];
const search=tree=>all(tree,node=>node.type==='input'&&node.props['aria-label']?.startsWith('Buscar actividad'))[0];
const button= (tree,label) => all(tree,node=>node.type==='button'&&(node.props['aria-label']===label||node.props.children===label))[0];

async function harness({hash='',eventMode=true,events=sampleEvents}={}){
  const states=[],effects=[],pending=[],listeners=new Map();
  let stateIndex=0,effectIndex=0;
  const location={hash,pathname:'/o/org/c/camp/program',search:'?from=push'};
  const replaced=[];
  const window={
    location,history:{state:{preserve:true},replaceState(state,title,url){replaced.push({state,url});location.hash=new URL(url,'https://camporee.test').hash;}},
    setInterval(){return 1;},clearInterval(){},
    addEventListener(name,fn){listeners.set(name,fn);},
    removeEventListener(name,fn){if(listeners.get(name)===fn)listeners.delete(name);},
  };
  const jsx=(type,props)=>({type,props:props??{}});
  const modules={
    react:{
      useState(initial){const index=stateIndex++;if(!(index in states))states[index]=typeof initial==='function'?initial():initial;return[states[index],value=>{states[index]=typeof value==='function'?value(states[index]):value;}];},
      useMemo:fn=>fn(),
      useEffect(fn,deps){
        const index=effectIndex++,previous=effects[index];
        if(!previous||deps.some((value,i)=>!Object.is(value,previous.deps[i]))){
          effects[index]={deps,cleanup:previous?.cleanup};
          pending.push(()=>{effects[index].cleanup?.();effects[index].cleanup=fn();});
        }
      },
    },
    'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'fragment'},
    'next/navigation':{useRouter:()=>({refresh(){}})},
    'lucide-react':{},
    '@/app/components/bottom-sheet':{__esModule:true,default:'sheet'},
    '@/lib/mutation-result':{},
    '@/lib/supabase/client':{createClient:()=>({})},
    '@/lib/client-ui':{},
    '@/lib/date':dates,
    '@/lib/camporee-locale':locale,
  };
  const FixedDate=class extends Date{
    constructor(value){super(value??'2026-11-06T18:00:00Z');}
    static now(){return Date.parse('2026-11-06T18:00:00Z');}
  };
  const module={exports:{}};
  vm.runInNewContext(await compiled,{module,exports:module.exports,require:name=>modules[name],window,Date:FixedDate});
  function render(){
    stateIndex=0;effectIndex=0;
    return module.exports.default({camporeeId:'camp',canEdit:false,initialEvents:events,eventMode,timeZone:'America/Santo_Domingo',areas:[{id:'events',name:'Eventos'},{id:'camp',name:'Campamento'}]});
  }
  return {
    render,location,replaced,
    flushEffects(){pending.splice(0).forEach(fn=>fn());},
    changeHash(value){location.hash=value;listeners.get('hashchange')?.();},
    cleanup(){effects.forEach(effect=>effect?.cleanup?.());},
    get listenerCount(){return listeners.size;},
  };
}

test('day filters keep the local calendar date, including midnight, and restore all events in order',async()=>{
  const app=await harness();
  assert.deepEqual(rowIds(app.render()),['event-arrival']);
  button(app.render(),'Sábado, 7 de noviembre').props.onClick();
  assert.deepEqual(rowIds(app.render()),['event-night']);
  button(app.render(),'Domingo, 8 de noviembre').props.onClick();
  assert.deepEqual(rowIds(app.render()),['event-midnight','event-games']);
  const midnight=rows(app.render())[0];
  assert.match(JSON.stringify(midnight),/00:00/);
  button(app.render(),'Todo el evento').props.onClick();
  assert.deepEqual(rowIds(app.render()),['event-arrival','event-night','event-midnight','event-games']);
});

test('search finds a subactivity without accents and shows every item in its block',async()=>{
  const app=await harness({eventMode:false});
  search(app.render()).props.onChange({target:{value:'parchis biblico'}});
  assert.deepEqual(rowIds(app.render()),['event-games']);
  const output=JSON.stringify(rows(app.render())[0]);
  assert.match(output,/Código del pasado/);
  assert.match(output,/Parchís Bíblico/);
  search(app.render()).props.onChange({target:{value:'missing activity'}});
  assert.equal(rows(app.render()).length,0);
  button(app.render(),'Ver todo el programa').props.onClick();
  assert.equal(rows(app.render()).length,4);
  assert.equal(search(app.render()).props.value,'');
});

test('a notification opens its exact event outside Today and closing preserves the tenant path and query',async()=>{
  const app=await harness({hash:'#event-night'});
  app.render();app.flushEffects();
  const tree=app.render();
  assert.equal(detail(tree).props.open,true);
  assert.equal(detail(tree).props.title,'Programa nocturno');
  assert.deepEqual(rowIds(tree),['event-night']);
  assert.match(rows(tree)[0].props.className,/is-selected/);
  assert.match(JSON.stringify(detail(tree)),/Master Chef/);
  detail(tree).props.onClose();
  assert.equal(detail(app.render()).props.open,false);
  assert.equal(app.replaced[0].url,'/o/org/c/camp/program?from=push');
  assert.equal(app.replaced[0].state.preserve,true);
  app.cleanup();
  assert.equal(app.listenerCount,0);
});

test('a subsequent notification clears conflicting date, text and area filters',async()=>{
  const app=await harness();
  app.render();app.flushEffects();
  button(app.render(),'Sábado, 7 de noviembre').props.onClick();
  button(app.render(),'Campamento').props.onClick();
  search(app.render()).props.onChange({target:{value:'irrelevant'}});
  assert.equal(rows(app.render()).length,0);
  app.changeHash('#event-games');
  const tree=app.render();
  assert.equal(detail(tree).props.open,true);
  assert.equal(detail(tree).props.title,'Eventos');
  assert.ok(rowIds(tree).includes('event-games'));
  assert.equal(search(tree).props.value,'');
  assert.equal(button(tree,'Todas las áreas').props['aria-pressed'],true);
  app.cleanup();
});

test('invalid or unavailable notification targets do not open unrelated data',async()=>{
  for(const hash of ['#event-%E0%A4%A','#event-another-camporee']){
    const app=await harness({hash});
    app.render();app.flushEffects();
    assert.equal(detail(app.render()).props.open,false);
    assert.deepEqual(rowIds(app.render()),['event-arrival']);
    app.cleanup();
  }
});

test('an event with no published end is not assigned an invented running duration',async()=>{
  const app=await harness({eventMode:false,events:[
    {id:'unknown-end',title:'Recepción',starts_at:'2026-11-06T13:45:00-04:00',ends_at:null},
    sampleEvents[1],
  ]});
  const tree=app.render();
  assert.doesNotMatch(rows(tree).find(row=>row.props.id==='event-unknown-end').props.className,/is-ongoing/);
  assert.match(rows(tree).find(row=>row.props.id==='event-arrival').props.className,/is-ongoing/);
});

test('uncategorized imported blocks do not offer empty area filters while the editor retains every area',async()=>{
  const app=await harness({events:[{id:'official',title:'Apertura',starts_at:'2026-11-06T19:00:00-04:00'}]});
  const tree=app.render();
  assert.equal(all(tree,node=>node.props['aria-label']==='Filtrar por área').length,0);
  assert.equal(all(tree,node=>node.type==='option'&&['Eventos','Campamento'].includes(node.props.children)).length,2);
});
