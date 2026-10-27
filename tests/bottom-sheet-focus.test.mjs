import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const {loadBindings,transform}=createRequire(import.meta.url)('next/dist/build/swc');
async function closingDialog({detached=false,otherFocus=false}={}){
 await loadBindings();
 const filename='app/components/bottom-sheet.tsx';
 const {code}=await transform(await readFile(filename,'utf8'),{filename,jsc:{parser:{syntax:'typescript',tsx:true},target:'es2022',transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}});
 const body={},other={},document={body,activeElement:null};let restored=0;
 class HTMLElement{isConnected=!detached;focus(options){assert.equal(options.preventScroll,true);restored++;document.activeElement=this;}}
 const previous=new HTMLElement();document.activeElement=previous;
 const dialog={showModal(){document.activeElement={};},close(){document.activeElement=otherFocus?other:body;}};
 const effects=[];let ref=0;
 const jsx=(type,props)=>({type,props});
 const modules={react:{useId:()=> 'test',useState:value=>[value,()=>{}],useRef:value=>({current:ref++===0?dialog:value}),useEffect:fn=>effects.push(fn)},'react/jsx-runtime':{jsx,jsxs:jsx},'lucide-react':{X:'icon'}};
 const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,require:name=>modules[name],document,HTMLElement});
 module.exports.default({open:true,onClose(){},title:'Tarea',children:'Detalle'});
 const cleanup=effects[1]();cleanup();
 return {restored,active:document.activeElement,previous,other};
}
test('closing a detached native dialog restores its connected trigger without scrolling',async()=>{
 const result=await closingDialog();assert.equal(result.restored,1);assert.equal(result.active,result.previous);
});
test('dialog cleanup does not focus a removed trigger or steal focus from another view',async()=>{
 assert.equal((await closingDialog({detached:true})).restored,0);
 const result=await closingDialog({otherFocus:true});assert.equal(result.restored,0);assert.equal(result.active,result.other);
});
