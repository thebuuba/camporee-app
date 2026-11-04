import test from 'node:test';
import assert from 'node:assert/strict';
import {applyOfflineMutations,snapshotKey} from '../lib/offline-snapshot.ts';

test('la copia muestra cambios pendientes de programa, comidas, tareas y listas',()=>{
  const snapshot={key:snapshotKey('owner','org','camp'),ownerId:'owner',organizationId:'org',camporeeId:'camp',
    camporeeName:'Legado',timeZone:'America/Santo_Domingo',savedAt:1,canEditTasks:true,canEditLists:true,
    program:[{id:'event',title:'Antes',starts_at:'2026-11-06T12:00:00Z'}],
    meals:[{id:'meal',menu:'Antes'}],tasks:[{id:'task',title:'Carpas',status:'pending'}],
    lists:[{id:'list',title:'Equipaje',category:null,list_items:[{id:'item',label:'Linterna',is_done:false,quantity:null,unit:null}]}]};
  const result=applyOfflineMutations(snapshot,[
    {table:'schedule_events',method:'PATCH',id:'event',payload:{title:'Apertura'}},
    {table:'meals',method:'PATCH',id:'meal',payload:{menu:'Cena'}},
    {table:'tasks',method:'PATCH',id:'task',payload:{status:'done'}},
    {table:'list_items',method:'PATCH',id:'item',payload:{is_done:true}},
  ]);
  assert.equal(result.program[0].title,'Apertura');
  assert.equal(result.meals[0].menu,'Cena');
  assert.equal(result.tasks[0].status,'done');
  assert.equal(result.lists[0].list_items[0].is_done,true);
  assert.equal(snapshot.tasks[0].status,'pending','la copia confirmada permanece intacta');
});
