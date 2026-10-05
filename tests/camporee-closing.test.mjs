import test from 'node:test';
import assert from 'node:assert/strict';
import { closingProgress } from '../lib/camporee-closing.ts';

test('el cierre cuenta solo tareas después y excluye las canceladas', () => {
  const result = closingProgress([
    {phase:'after',status:'done'}, {phase:'after',status:'pending'},
    {phase:'after',status:'cancelled'}, {phase:'before',status:'done'},
  ], [{returned:true},{returned:false}]);
  assert.deepEqual(result, {completed:1,total:2,inventoryPercent:50,inventoryTotal:2,inventoryComplete:false});
});

test('sin tareas ni inventario no presenta un cierre completo ficticio', () => {
  assert.deepEqual(closingProgress([], []), {completed:0,total:0,inventoryPercent:0,inventoryTotal:0,inventoryComplete:false});
});

test('un artículo pendiente no queda oculto por el redondeo del inventario', () => {
  const inventory = Array.from({length:200}, (_, index) => ({returned:index < 199}));
  const partial = closingProgress([], inventory);
  assert.equal(partial.inventoryComplete, false);
  assert.equal(partial.inventoryPercent, 99);
  assert.equal(closingProgress([], inventory.map(() => ({returned:true}))).inventoryComplete, true);
});
