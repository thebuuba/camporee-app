import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const {loadBindings,transform}=createRequire(import.meta.url)('next/dist/build/swc');
const all=node=>Array.isArray(node)?node.flatMap(all):node&&typeof node==='object'?[node,...all(node.props?.children)]:[];
async function harness(editable=true){
 await loadBindings();
 const filename='app/tasks/task-manager.tsx';
 const {code}=await transform(await readFile(filename,'utf8'),{filename,jsc:{parser:{syntax:'typescript',tsx:true},target:'es2022',transform:{react:{runtime:'automatic'}}},module:{type:'commonjs'}});
 const hooks=[];let cursor=0,opened=false;const calls=[];
 const jsx=(type,props)=>({type,props});
 const react={useEffect(){},useRef(initial){const index=cursor++;return hooks[index]??(hooks[index]={current:initial})},useState(initial){const index=cursor++;if(!(index in hooks))hooks[index]=initial;return [hooks[index],value=>{hooks[index]=typeof value==='function'?value(hooks[index]):value}];}};
 const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,Date,Math,requestAnimationFrame:fn=>fn(),require:name=>name==='react'?react:name==='react/jsx-runtime'?{jsx,jsxs:jsx}:new Proxy({},{get:(_,key)=>String(key)})});
 assert.equal(typeof module.exports.TaskSwipeRow,'function');
 const render=()=>{cursor=0;return module.exports.TaskSwipeRow({title:'Tarea',opened,onOpenChange:value=>{opened=value},onDetails:()=>calls.push('details'),onEdit:editable?()=>calls.push('edit'):undefined,onDelete:editable?()=>calls.push('delete'):undefined,children:{type:'article',props:{}}});};
 const surface=()=>all(render()).find(node=>node.props.className?.includes('task-swipe-surface'));
 const target={closest:()=>null};
 const currentTarget={setPointerCapture(){},hasPointerCapture(){return true},releasePointerCapture(){}};
 const pointer=(x,y=20,extra={})=>({clientX:x,clientY:y,pointerId:1,isPrimary:true,button:0,target,currentTarget,...extra});
 const gesture=(dx,dy=0)=>{surface().props.onPointerDown(pointer(100));surface().props.onPointerMove(pointer(100+dx,20+dy));surface().props.onPointerUp(pointer(100+dx,20+dy));};
 return {render,surface,pointer,gesture,calls,get opened(){return opened}};
}
test('left swipe reveals actions; right swipe closes without executing a task mutation',async()=>{
 const h=await harness();assert.equal(all(h.render()).find(node=>node.props.className==='task-swipe-actions').props.inert,true);
 h.gesture(130);assert.equal(h.opened,false);
 h.gesture(-130);assert.equal(h.opened,true);assert.deepEqual(h.calls,[]);
 assert.equal(all(h.render()).find(node=>node.props.className==='task-swipe-actions').props.inert,false);
 h.gesture(140);assert.equal(h.opened,false);assert.deepEqual(h.calls,[]);
});
test('vertical scroll, a short tap and gestures starting on buttons do not reveal actions',async()=>{
 const h=await harness();h.gesture(5,90);assert.equal(h.opened,false);
 h.gesture(3);assert.equal(h.opened,false);
 h.surface().props.onPointerDown(h.pointer(100,20,{target:{closest:()=>({tagName:'BUTTON'})}}));
 h.surface().props.onPointerMove(h.pointer(0));h.surface().props.onPointerUp(h.pointer(0));assert.equal(h.opened,false);
 h.surface().props.onPointerDown(h.pointer(100));
 h.surface().props.onPointerMove(h.pointer(0,20,{isPrimary:false}));
 h.surface().props.onPointerUp(h.pointer(100));assert.equal(h.opened,false,'a second finger must not drag the primary gesture');
});
test('keyboard and context menu reveal actions, while readonly rows offer only details',async()=>{
 const h=await harness(false);
 h.render().props.onKeyDown({key:'ArrowLeft',preventDefault(){}});assert.equal(h.opened,true);
 assert.deepEqual(all(h.render()).filter(node=>node.type==='button').map(node=>node.props['aria-label']),['Checklist']);
 h.render().props.onKeyDown({key:'Escape',preventDefault(){}});assert.equal(h.opened,false);
 h.surface().props.onContextMenu({preventDefault(){}});assert.equal(h.opened,true);
});
test('drag release cannot trigger the card detail click and action buttons close the rail',async()=>{
 const h=await harness();h.gesture(-130);
 let prevented=false,stopped=false;
 h.surface().props.onClickCapture({preventDefault(){prevented=true},stopPropagation(){stopped=true}});
 assert.equal(prevented,true);assert.equal(stopped,true);
 all(h.render()).find(node=>node.type==='button'&&node.props['aria-label']==='Editar').props.onClick();
 assert.deepEqual(h.calls,['edit']);assert.equal(h.opened,false);
});
