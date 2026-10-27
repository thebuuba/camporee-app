import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import * as sunset from '../supabase/functions/_shared/sunset.ts';
const {loadBindings,transform}=createRequire(import.meta.url)('next/dist/build/swc');
const flat=node=>Array.isArray(node)?node.flatMap(flat):node&&typeof node==='object'?[node,...flat(node.props?.children)]:node==null?[]:[node];
async function renderSunset(date,now){
 await loadBindings();
 const path='app/components/camporee-card/daily-sunset.tsx';
 const {code}=await transform(await readFile(path,'utf8'),{filename:path,jsc:{parser:{syntax:'typescript',tsx:true},target:'es2022',transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}});
 const rows=['santiago','moca'].map(id=>({id,label:id,timeZone:sunset.SUNSET_ZONE,date,sunset:`${date}T18:11:27-04:00`,sunrise:`${date}T06:41:27-04:00`}));
 const jsx=(type,props)=>({type,props});
 const modules={react:{useEffect(){},useState(){return [rows,()=>{}]}},'react/jsx-runtime':{jsx,jsxs:jsx},'@/supabase/functions/_shared/sunset':sunset};
 const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,require:name=>modules[name],Date,Intl});
 return flat(module.exports.DailySunset({sunset:sunset.sunsetStatus(Date.parse(now),rows)}));
}
test('sunset displays only the daily label and time, without a colored panel or geolocation control',async()=>{
 const elements=await renderSunset('2026-10-27','2026-10-27T20:00:00Z');
 assert.equal(elements.filter(node=>typeof node==='string').join(' '),'Puesta de sol hoy 6:11 p. m.');
 assert.ok(elements.filter(node=>typeof node==='object').every(node=>!node.props.className?.includes('bg-')&&node.type!=='button'));
 assert.equal(elements.find(node=>node.type==='a').props.href,'https://sunrise-sunset.org/');
});
for(const [date,now,expected] of [
 ['2026-10-27','2026-10-27T22:12:00Z','La puesta de sol fue a las 6:11 p. m.'],
 ['2026-10-30','2026-10-30T22:12:00Z','La puesta de sol fue a las 6:11 p. m. ¡Feliz sábado!'],
 ['2026-10-31','2026-10-31T15:00:00Z','Puesta de sol hoy 6:11 p. m. ¡Feliz sábado!'],
 ['2026-10-31','2026-10-31T22:12:00Z','La puesta de sol fue a las 6:11 p. m. ¡Feliz semana!'],
])test(`sunset message follows the local date and sunset: ${now}`,async()=>{
 const elements=await renderSunset(date,now);
 assert.equal(elements.filter(node=>typeof node==='string').join(' '),expected);
 assert.ok(elements.filter(node=>typeof node==='object').every(node=>!node.props.className?.includes('bg-')));
});
