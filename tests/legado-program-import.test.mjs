import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildProgramImport, programEventId } from '../scripts/import-legado-program.mjs';

const program = JSON.parse(await readFile(new URL('../data/programa-legado-2026.json', import.meta.url), 'utf8'));
const camporee = '11111111-1111-4111-8111-111111111111';

test('official source preserves all 45 blocks and 68 contents without invented end times', () => {
  assert.equal(program.events.length, 45);
  assert.equal(program.events.reduce((sum, event) => sum + Math.max(event.activities.length, 1), 0), 68);
  assert.equal(program.events.filter(event => event.ends_at).length, 3);
  for (const event of program.events) {
    for (const activity of event.activities) assert.ok(event.description.includes(activity));
    assert.equal(event.responsible_name, null);
    assert.ok(event.starts_at.endsWith('-04:00'));
  }
  assert.deepEqual(program.events.slice(0, 3).map(event => [event.starts_at, event.ends_at]), [
    ['2026-11-03T17:00:00-04:00', '2026-11-03T23:00:00-04:00'],
    ['2026-11-04T17:00:00-04:00', '2026-11-04T23:00:00-04:00'],
    ['2026-11-05T17:00:00-04:00', '2026-11-05T23:00:00-04:00'],
  ]);
});

test('midnight curfews use the actual following date, retaining their source program day', () => {
  assert.deepEqual(program.events.filter(event => event.title === 'Toque de queda')
    .map(event => [event.program_date, event.starts_at]), [
      ['2026-11-06', '2026-11-06T23:30:00-04:00'],
      ['2026-11-07', '2026-11-08T00:00:00-04:00'],
      ['2026-11-08', '2026-11-09T00:00:00-04:00'],
    ]);
});

test('stable import identities are unique, tenant-scoped, and safe to regenerate after edits', () => {
  const ids = program.events.map(event => programEventId(camporee, event.source_id));
  assert.equal(new Set(ids).size, 45);
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(programEventId(camporee, 'source'), programEventId(camporee.toUpperCase(), 'source'));
  assert.notEqual(programEventId(camporee, 'source'), programEventId('22222222-2222-4222-8222-222222222222', 'source'));
  assert.throws(() => buildProgramImport("'; delete from schedule_events; --", program));
  assert.throws(() => buildProgramImport(camporee, {...program, events: []}));
});
