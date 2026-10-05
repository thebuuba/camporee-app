import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import * as songs from '../lib/songs.ts';
import { songSourceKey } from '../lib/song-downloads.ts';

async function player({records=[],supabase,fetchAudio,saveDownload,navigatorMock={}}={}) {
  const {loadBindings,transform}=createRequire(import.meta.url)('next/dist/build/swc');await loadBindings();
  const {code}=await transform(await readFile(new URL('../app/components/music-player.tsx',import.meta.url),'utf8'),{filename:'music-player.tsx',jsc:{parser:{syntax:'typescript',tsx:true},target:'es2022',transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}});
  const states=[],refs=[],effects=[];let stateIndex=0,refIndex=0;
  const jsx=(type,props)=>({type,props});const Context={Provider:'provider'};const module={exports:{}};
  const modules={'react/jsx-runtime':{jsx,jsxs:jsx},react:{createContext:()=>Context,useContext:()=>null,useEffect(fn){effects.push(fn)},useCallback:fn=>fn,useRef(value){const index=refIndex++;return refs[index]??(refs[index]={current:value})},useState(value){const index=stateIndex++;if(!(index in states))states[index]=typeof value==='function'?value():value;return[states[index],next=>{states[index]=typeof next==='function'?next(states[index]):next}]}},'next/navigation':{usePathname:()=>'/more/songs'},'lucide-react':{},'./bottom-sheet':'sheet','./floating-music-bubble':'bubble','@/lib/songs':songs,'@/lib/song-downloads':{songSourceKey,listDownloadedSongs:async()=>records,saveDownloadedSong:saveDownload??(async()=>{}),removeDownloadedSong:async()=>{}},'@/lib/supabase/client':{createClient:()=>supabase}};
  vm.runInNewContext(code,{module,exports:module.exports,require:name=>modules[name],Number,Math,URL,AbortController,fetch:fetchAudio,navigator:navigatorMock});
  function render(){stateIndex=0;refIndex=0;return module.exports.default({children:'page'})}
  function find(node,predicate){if(!node||typeof node!=='object')return;if(predicate(node))return node;for(const child of [node.props?.children].flat()){const found=find(child,predicate);if(found)return found}}
  const tree=render();let pauseCalls=0,playCalls=0;
  const audio={src:'',currentTime:0,duration:240,paused:true,async play(){playCalls++;this.paused=false},pause(){pauseCalls++;this.paused=true},getAttribute(){return this.src},removeAttribute(){this.src=''},load(){}};
  find(tree,node=>node.type==='audio').props.ref.current=audio;
  return {render,find,audio,effects,counts:()=>({pauseCalls,playCalls})};
}

test('cerrar el panel conserva el audio y la burbuja',async()=>{
  const view=await player();let tree=view.render();
  const api=tree.props.value;
  api.playSong({id:'maranata',title:'Maranata',audioUrl:'/audio/maranata.mp3'});
  tree=view.render();view.find(tree,node=>node.type==='sheet').props.onClose();tree=view.render();
  assert.equal(view.audio.paused,false);
  assert.equal(view.counts().pauseCalls,0);
  assert.ok(view.find(tree,node=>node.type==='bubble'));
});

test('cambiar de canción usa el mismo audio y quitar el reproductor lo detiene',async()=>{
  const view=await player();let api=view.render().props.value;
  api.playSong({id:'one',title:'Una',audioUrl:'/audio/contracorriente.mp3'});
  view.audio.currentTime=50;api=view.render().props.value;
  api.playSong({id:'two',title:'Otra',audioUrl:'/audio/maranata.mp3'});
  assert.equal(view.audio.src,'/audio/maranata.mp3');assert.equal(view.audio.currentTime,0);
  api=view.render().props.value;api.stop();
  assert.equal(view.audio.paused,true);assert.equal(view.audio.src,'');
  assert.equal(view.find(view.render(),node=>node.type==='bubble'),undefined);
});

test('una descarga guardada se reproduce desde Blob sin pedir audio a la red',async()=>{
  const song=songs.songsFromDocuments([]).find(s=>s.id==='maranata');
  const view=await player({records:[{song,blob:new Blob(['audio'],{type:'audio/mpeg'})}]});
  view.render().props.value.setSongs([song],'user:event');await Promise.resolve();
  view.render().props.value.playSong(song);
  assert.match(view.audio.src,/^blob:/);assert.equal(view.audio.paused,false);
  view.render().props.value.stop();assert.equal(view.audio.src,'');
});

test('quitar el reproductor invalida una URL privada pendiente',async()=>{
  let resolve;const signed=new Promise(done=>{resolve=done});
  const view=await player({supabase:{storage:{from:()=>({createSignedUrl:()=>signed})}}});
  view.render().props.value.playSong({id:'phone',title:'Telefono',audioUrl:'',filePath:'event/songs/song.mp3'});
  view.render().props.value.stop();resolve({data:{signedUrl:'https://example.com/song.mp3'}});
  await signed;await Promise.resolve();await Promise.resolve();
  assert.equal(view.audio.src,'');assert.equal(view.render().props.value.current,null);
});

test('cambiar de cuenta vacía descargas y detiene la música anterior',async()=>{
  const song=songs.songsFromDocuments([]).find(s=>s.id==='maranata');
  const view=await player({records:[{song,blob:new Blob(['audio'])}]});
  view.render().props.value.setSongs([song],'first:event');await Promise.resolve();
  view.render().props.value.playSong(song);assert.equal(view.audio.paused,false);
  view.render().props.value.setSongs([song],'second:event');
  assert.equal(view.audio.paused,true);assert.equal(view.render().props.value.downloads.length,0);
});

test('las acciones multimedia no compatibles tampoco rompen la limpieza',async()=>{
  const mediaSession={setActionHandler(action){if(action==='nexttrack')throw new Error('Unsupported action')}};
  const view=await player({navigatorMock:{mediaSession}});
  view.render().props.value.playSong(songs.songsFromDocuments([]).find(s=>s.id==='maranata'));view.render();
  const cleanup=view.effects.at(-1)();assert.equal(typeof cleanup,'function');assert.doesNotThrow(cleanup);
});

test('preparar un audio privado permite comenzar dentro del toque de reproducción',async()=>{
  let signs=0;const song={id:'phone',title:'Telefono',audioUrl:'',filePath:'event/songs/song.mp3'};
  const view=await player({supabase:{storage:{from:()=>({async createSignedUrl(){signs++;return {data:{signedUrl:'https://example.com/song.mp3'}}}})}}});
  await view.render().props.value.prepareSong(song);
  view.render().props.value.playSong(song);
  assert.equal(view.audio.src,'https://example.com/song.mp3');assert.equal(view.audio.paused,false);assert.equal(signs,1);
});
