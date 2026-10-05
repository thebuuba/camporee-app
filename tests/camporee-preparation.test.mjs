import test from 'node:test';
import assert from 'node:assert/strict';
import { camporeePhase, preparationProgress, preparationCountdown } from '../lib/camporee-preparation.ts';

test('la etapa guardada prevalece aunque las fechas estén en el pasado', () => {
  assert.equal(camporeePhase('planning'), 'before');
  assert.equal(camporeePhase('active'), 'during');
  assert.equal(camporeePhase('finished'), 'after');
  assert.equal(camporeePhase('archived'), 'after');
});

test('el avance de preparación excluye otras etapas y tareas canceladas', () => {
  assert.deepEqual(preparationProgress([
    { phase:'before', status:'done' }, { phase:'before', status:'pending' },
    { phase:'before', status:'cancelled' }, { phase:'during', status:'done' },
    { phase:'after', status:'pending' },
  ]), { completed:1, total:2, percent:50 });
  assert.deepEqual(preparationProgress([]), { completed:0, total:0, percent:0 });
});

test('la cuenta regresiva usa la medianoche dominicana y nunca es negativa', () => {
  assert.deepEqual(preparationCountdown('2026-10-07', Date.parse('2026-10-05T12:30:00-04:00')), { days:1, hours:11, minutes:30 });
  assert.deepEqual(preparationCountdown('2026-10-05', Date.parse('2026-10-06T00:00:00-04:00')), { days:0, hours:0, minutes:0 });
});
