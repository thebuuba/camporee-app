import test from 'node:test';
import assert from 'node:assert/strict';

const bounds = { minX: 12, maxX: 340, minY: 32, maxY: 740 };

test('bubble snaps to each nearest edge and preserves its position along the edge', async () => {
  const { snapPosition, restorePosition } = await import('../lib/music-bubble-position.ts');
  for (const [point, edge] of [[{ x: 15, y: 300 }, 'left'], [{ x: 335, y: 300 }, 'right'], [{ x: 150, y: 35 }, 'top'], [{ x: 150, y: 735 }, 'bottom']]) {
    const saved = snapPosition(point, bounds);
    assert.equal(saved.edge, edge);
    const restored = restorePosition(saved, bounds);
    assert.equal(restored[edge === 'left' || edge === 'right' ? 'y' : 'x'], point[edge === 'left' || edge === 'right' ? 'y' : 'x']);
    assert.equal(restored[edge === 'left' || edge === 'right' ? 'x' : 'y'], bounds[{ left: 'minX', right: 'maxX', top: 'minY', bottom: 'maxY' }[edge]]);
  }
});

test('bubble stays within safe bounds after dragging outside or resizing', async () => {
  const { clampPosition, snapPosition, restorePosition, parsePosition } = await import('../lib/music-bubble-position.ts');
  assert.deepEqual(clampPosition({ x: -100, y: 900 }, bounds), { x: 12, y: 740 });
  const saved = snapPosition({ x: 340, y: 386 }, bounds);
  assert.deepEqual(restorePosition(saved, { minX: 10, maxX: 150, minY: 10, maxY: 210 }), { x: 150, y: 110 });
  assert.deepEqual(parsePosition(JSON.stringify(saved)), saved);
  for (const invalid of ['oops', 'null', '{"edge":"middle","offset":0.5}', '{"edge":"left","offset":2}']) assert.equal(parsePosition(invalid), null);
  assert.deepEqual(restorePosition({ edge: 'bottom', offset: 0.5 }, { minX: 0, maxX: 0, minY: 0, maxY: 0 }), { x: 0, y: 0 });
});
