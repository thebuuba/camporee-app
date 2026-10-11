import test from 'node:test';
import assert from 'node:assert/strict';
import { camporeeMidnightEpoch,formatCamporeeMoney,formatCamporeeDate } from '../lib/camporee-locale.ts';

test('inicio de camporee utiliza la medianoche de cada zona horaria',()=>{
  assert.equal(new Date(camporeeMidnightEpoch('2027-07-01','America/Santo_Domingo')).toISOString(),'2027-07-01T04:00:00.000Z');
  assert.equal(new Date(camporeeMidnightEpoch('2027-01-01','America/New_York')).toISOString(),'2027-01-01T05:00:00.000Z');
  assert.equal(new Date(camporeeMidnightEpoch('2027-07-01','America/New_York')).toISOString(),'2027-07-01T04:00:00.000Z');
  assert.equal(new Date(camporeeMidnightEpoch('2027-07-01','Asia/Tokyo')).toISOString(),'2027-06-30T15:00:00.000Z');
});

test('el formato de presupuesto cambia con la moneda elegida, sin conversiones ficticias',()=>{
  assert.notEqual(formatCamporeeMoney(1200,'DOP'),formatCamporeeMoney(1200,'BOB'));
  assert.notEqual(formatCamporeeMoney(1200,'DOP'),formatCamporeeMoney(1200,'USD'));
  assert.match(formatCamporeeDate('2027-01-01'),/enero/);
});
