import test from 'node:test';
import assert from 'node:assert/strict';
import { dateKeyInTimeZone, dateOnlyDistance } from '../lib/date.ts';
import { queuedResponseIsComplete } from '../lib/offline-fetch.ts';

test('usa el día civil de Santo Domingo cerca de medianoche UTC', () => {
  assert.equal(dateKeyInTimeZone(new Date('2026-09-08T02:30:00Z')), '2026-09-07');
  assert.equal(dateKeyInTimeZone(new Date('2026-09-08T04:30:00Z')), '2026-09-08');
  assert.equal(dateOnlyDistance('2026-09-07', '2026-09-10'), 3);
});

test('una sincronización solo descarta respuestas idempotentes o exitosas', () => {
  assert.equal(queuedResponseIsComplete('PATCH', 400), false);
  assert.equal(queuedResponseIsComplete('POST', 409), true);
  assert.equal(queuedResponseIsComplete('DELETE', 404), true);
  assert.equal(queuedResponseIsComplete('PATCH', 503), false);
});
