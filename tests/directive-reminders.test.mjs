import test from 'node:test';
import assert from 'node:assert/strict';
import { messageFor } from '../supabase/functions/camporee-reminders/messages.ts';

test('el cargo determina el enfoque incluso con acceso de solo lectura', () => {
  const cases = [
    ['Tesorero/a', '/more/budget', /presupuesto/],
    ['Secretario/a', '/more/participants', /documentación/],
    ['Consejero/a', '/more/participants', /unidad/],
    ['Director/a', '/', /coordina|coordinación/],
    ['Subdirector/a', '/tasks', /logística/],
  ];
  for (const [cargo, url, focus] of cases) {
    for (const milestone of ['d10', 'd5', 'd1', 'd0']) {
      const message = messageFor('viewer', milestone, 'Camporee', {}, cargo);
      assert.equal(message.url, url, `${cargo}, ${milestone}`);
      assert.match(message.body, focus);
    }
  }
});

test('sin cargo conserva los mensajes actuales por acceso y permisos', () => {
  assert.equal(messageFor('viewer', 'd5', 'Camporee').url, '/program');
  assert.equal(messageFor('admin', 'd5', 'Camporee').url, '/');
  assert.equal(messageFor('editor', 'd5', 'Camporee', { meals: true }).url, '/more/meals');
});

test('un cargo personalizado conserva el enfoque de sus áreas y menciona su cargo', () => {
  const message = messageFor('viewer', 'd1', 'Camporee', { inventory: true }, 'Encargado de transporte');
  assert.equal(message.url, '/more/inventory');
  assert.match(message.body, /Encargado de transporte/);
  assert.match(message.body, /inventario/);
});

test('los cargos personalizados que coinciden con claves de Object usan el fallback', () => {
  for (const cargo of ['constructor', 'toString', '__proto__']) {
    const message = messageFor('viewer', 'd1', 'Camporee', { meals: true }, cargo);
    assert.equal(message.url, '/more/meals');
    assert.match(message.body, /comidas/);
  }
});
