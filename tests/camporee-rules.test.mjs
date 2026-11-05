import test from 'node:test';
import assert from 'node:assert/strict';
import {CAMPOREE_RULES,cleanCamporeeRule,formatCamporeeRulesForShare} from '../lib/camporee-rules.ts';

test('WhatsApp shares the current ordered rules and camporee name',()=>{
  const edited=[...CAMPOREE_RULES];
  edited[0]='Respetar al equipo.';
  edited.push('Cuidar el agua.');
  const text=formatCamporeeRulesForShare('Bi-Camporee Legado',edited);
  assert.match(text,/\*Reglas del camporee · Bi-Camporee Legado\*/);
  assert.match(text,/1\. Respetar al equipo\./);
  assert.match(text,/15\. Cuidar el agua\./);
  assert.doesNotMatch(text,/Respetar a los directores/);
  assert.equal(cleanCamporeeRule('  No alejarse\n del grupo.  '),'No alejarse del grupo.');
});
