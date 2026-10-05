import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { songsFromDocuments } from '../lib/songs.ts';

async function player() {
  const {loadBindings,transform}=createRequire(import.meta.url)('next/dist/build/swc');await loadBindings();
  const {code}=await transform(await readFile(new URL('../app/components/music-player.tsx',import.meta.url),'utf8'),{filename:'music-player.tsx',jsc:{parser:{syntax:'typescript',tsx:true},target:'es2022',transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}});
  const states=[],refs=[];let stateIndex=0,refIndex=0;
  const jsx=(type,props)=>({type,props});const Context={Provider:'provider'};const module={exports:{}};
  const modules={'react/jsx-runtime':{jsx,jsxs:jsx},react:{createContext:()=>Context,useContext:()=>null,useEffect(){},useCallback:fn=>fn,useRef(value){const index=refIndex++;return refs[index]??(refs[index]={current:value})},useState(value){const index=stateIndex++;if(!(index in states))states[index]=typeof value==='function'?value():value;return[states[index],next=>{states[index]=typeof next==='function'?next(states[index]):next}]}},'next/navigation':{usePathname:()=>'/more/songs'},'lucide-react':{},'./bottom-sheet':'sheet','@/lib/songs':{songsFromDocuments,safeAudioUrl:value=>value.startsWith('/audio/')?value:''}};
  vm.runInNewContext(code,{module,exports:module.exports,require:name=>modules[name],Number,Math});
  function render(){stateIndex=0;refIndex=0;return module.exports.default({children:'page'})}
  function find(node,predicate){if(!node||typeof node!=='object')return;if(predicate(node))return node;for(const child of [node.props?.children].flat()){const found=find(child,predicate);if(found)return found}}
  const tree=render();let pauseCalls=0,playCalls=0;
  const audio={src:'',currentTime:0,duration:240,paused:true,async play(){playCalls++;this.paused=false},pause(){pauseCalls++;this.paused=true},removeAttribute(){this.src=''},load(){}};
  find(tree,node=>node.type==='audio').props.ref.current=audio;
  return {render,find,audio,counts:()=>({pauseCalls,playCalls})};
}

test('cerrar el panel conserva el audio y la burbuja',async()=>{
  const view=await player();let tree=view.render();
  const api=tree.props.value;
  api.playSong({id:'maranata',title:'Maranata',audioUrl:'/audio/maranata.mp3'});
  tree=view.render();view.find(tree,node=>node.type==='sheet').props.onClose();tree=view.render();
  assert.equal(view.audio.paused,false);
  assert.equal(view.counts().pauseCalls,0);
  assert.ok(view.find(tree,node=>node.type==='button'&&node.props.className?.includes('music-bubble')));
});

test('cambiar de canción usa el mismo audio y quitar el reproductor lo detiene',async()=>{
  const view=await player();let api=view.render().props.value;
  api.playSong({id:'one',title:'Una',audioUrl:'/audio/contracorriente.mp3'});
  view.audio.currentTime=50;api=view.render().props.value;
  api.playSong({id:'two',title:'Otra',audioUrl:'/audio/maranata.mp3'});
  assert.equal(view.audio.src,'/audio/maranata.mp3');assert.equal(view.audio.currentTime,0);
  api=view.render().props.value;api.stop();
  assert.equal(view.audio.paused,true);assert.equal(view.audio.src,'');
  assert.equal(view.find(view.render(),node=>node.type==='button'&&node.props.className?.includes('music-bubble')),undefined);
});
