import {test} from 'node:test';
import assert from 'node:assert/strict';
import {announcementPublishAt} from '../lib/announcement-schedule.ts';

test('interprets the chosen time in Dominican Republic, regardless of device timezone',()=>{
 assert.equal(announcementPublishAt('2026-11-06T08:00',Date.parse('2026-11-01T00:00Z')),'2026-11-06T12:00:00.000Z');
});
test('rejects missing, invalid and past publication dates',()=>{
 for(const value of ['', 'bad','2026-02-30T08:00','2026-11-06T25:00','2026-11-06T08:00'])
  assert.throws(()=>announcementPublishAt(value,Date.parse('2026-11-06T12:00Z')));
});
