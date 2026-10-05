import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

async function library() { return import('../lib/songs.ts'); }

test('Contracorriente utiliza el MP3 local del club', async () => {
  const {songsFromDocuments,safeAudioUrl}=await library();
  const song=songsFromDocuments([]).find(item=>item.title==='Contracorriente');
  assert.ok(song);
  assert.equal(song.audioUrl,'/audio/contracorriente.mp3');
  assert.equal(safeAudioUrl(song.audioUrl),'/audio/contracorriente.mp3');
  assert.equal(safeAudioUrl('//example.com/audio.mp3'),'');
  assert.equal(safeAudioUrl('/audio/../secret.mp3'),'');
});

test('el cancionero convierte documentos de canciones y mantiene letras y acordes', async () => {
  const { songsFromDocuments } = await library();
  const songs = songsFromDocuments([{id:'one',title:'Marcha',document_type:'song:camporee',notes:JSON.stringify({lyrics:'Texto del club\nSegunda línea',chords:'Do Sol'}),external_url:'https://example.com/audio'}]);
  assert.deepEqual(songs.find(song=>song.id==='one'),{id:'one',title:'Marcha',category:'camporee',lyrics:'Texto del club\nSegunda línea',chords:'Do Sol',audioUrl:'https://example.com/audio',stored:true});
});

test('no muestra documentos normales ni permite enlaces de audio inseguros', async () => {
  const { songsFromDocuments, songPayload } = await library();
  assert.equal(songsFromDocuments([{id:'file',title:'Recibo',document_type:'recibo'}]).some(song=>song.id==='file'),false);
  const fields=new FormData();fields.set('title','Mi canción');fields.set('category','club');fields.set('audio_url','javascript:alert(1)');
  assert.throws(()=>songPayload(fields),/https/i);
  fields.set('audio_url','https://example.com/audio');fields.set('lyrics','Letra compartida');
  assert.deepEqual(songPayload(fields),{title:'Mi canción',document_type:'song:club',notes:JSON.stringify({lyrics:'Letra compartida',chords:''}),external_url:'https://example.com/audio'});
});

test('los himnos guardados reemplazan las entradas iniciales sin duplicarlas', async () => {
  const { songsFromDocuments } = await library();
  const songs=songsFromDocuments([{id:'hymn',title:'Himno de los Conquistadores',document_type:'song:hymns',notes:'{"lyrics":"Texto proporcionado"}'}]);
  assert.equal(songs.filter(song=>song.title==='Himno de los Conquistadores').length,1);
  assert.equal(songs.find(song=>song.id==='hymn').lyrics,'Texto proporcionado');
  assert.ok(songs.some(song=>song.title==='Himno de los Guías Mayores'));
});

test('letras antiguas o metadatos dañados no rompen el cancionero', async () => {
  const { songsFromDocuments } = await library();
  const songs=songsFromDocuments([{id:'old',title:'Antigua',document_type:'song:club',notes:'Texto simple'}, {id:'bad',title:'Dañada',document_type:'song:hymns',notes:'null',external_url:'data:text/html,test'}]);
  assert.equal(songs.find(song=>song.id==='old').lyrics,'Texto simple');
  assert.equal(songs.find(song=>song.id==='bad').audioUrl,'');
});

test('un título o categoría inválidos no se guardan', async () => {
  const { songPayload } = await library();
  const fields=new FormData();fields.set('title','   ');fields.set('category','club');
  assert.throws(()=>songPayload(fields),/nombre/i);
  fields.set('title','Canción');fields.set('category','otro');
  assert.throws(()=>songPayload(fields),/categoría/i);
});

async function renderSongs({canEdit=true, controller=null, supabase}={}) {
  const {loadBindings,transform}=createRequire(import.meta.url)('next/dist/build/swc');await loadBindings();
  const {code}=await transform(await readFile(new URL('../app/more/songs/songs-manager.tsx',import.meta.url),'utf8'),{filename:'songs-manager.tsx',jsc:{parser:{syntax:'typescript',tsx:true},target:'es2022',transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}});
  const effects=[],listeners=new Map(),requests=[];
  const serviceWorker={controller,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name)=>listeners.delete(name)};
  const jsx=(type,props)=>({type,props});const module={exports:{}};
  const modules={'react/jsx-runtime':{jsx,jsxs:jsx},react:{useEffect:fn=>effects.push(fn),useState:value=>[value,()=>{}]},'next/navigation':{useRouter:()=>({refresh(){}})},'lucide-react':{},'@/app/components/bottom-sheet':()=>null,'@/lib/supabase/client':{createClient:()=>supabase},'@/lib/client-ui':{reportMutationError:()=>'',reportMutationSuccess:()=>{}},'@/lib/songs':await library()};
  vm.runInNewContext(code,{module,exports:module.exports,require:name=>modules[name],navigator:{onLine:true,serviceWorker},window:{addEventListener(){},removeEventListener(){}},document:{querySelectorAll:()=>[]},fetch:async url=>{requests.push(url)},FormData:class{constructor(){const fields=new FormData();fields.set('title','Canción del club');fields.set('category','club');fields.set('lyrics','Nuestra letra');return fields}}});
  const tree=module.exports.default({camporeeId:'event',userId:'user',canEdit,initialSongs:[]});
  function find(node,predicate){if(!node||typeof node!=='object')return;if(predicate(node))return node;for(const child of [node.props?.children].flat()){const result=find(child,predicate);if(result)return result}}
  return {effects,listeners,requests,serviceWorker,form:find(tree,node=>node.type==='form')};
}

test('la primera visita prepara la copia al tomar control el service worker',async()=>{
  const view=await renderSongs();
  const cleanup=view.effects[1]();
  assert.equal(view.requests.length,0);
  view.serviceWorker.controller={};view.listeners.get('controllerchange')();
  assert.deepEqual(view.requests,['/more/songs']);
  cleanup();assert.equal(view.listeners.size,0);
});

test('un usuario de solo lectura no puede enviar el formulario de canciones',async()=>{
  let writes=0;const view=await renderSongs({canEdit:false,supabase:{from(){writes++}}});
  view.form.props.onSubmit({preventDefault(){},currentTarget:{}});
  assert.equal(writes,0);
});

test('el formulario guarda la letra en el camporee compartido',async()=>{
  let payload,done;const saved=new Promise(resolve=>{done=resolve});
  const view=await renderSongs({supabase:{from(table){assert.equal(table,'camporee_documents');return {insert(value){payload=value;return this},select(){return this},async single(){done();return {data:{id:'new',...payload},error:null}}}}}});
  view.form.props.onSubmit({preventDefault(){},currentTarget:{}});await saved;
  assert.equal(payload.camporee_id,'event');assert.equal(payload.created_by,'user');assert.equal(payload.document_type,'song:club');assert.equal(JSON.parse(payload.notes).lyrics,'Nuestra letra');
});
