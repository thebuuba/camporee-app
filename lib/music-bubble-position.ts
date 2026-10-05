export type Point = { x: number; y: number };
export type Bounds = { minX: number; maxX: number; minY: number; maxY: number };
export type EdgePosition = { edge: 'left' | 'right' | 'top' | 'bottom'; offset: number };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function clampPosition(point: Point, bounds: Bounds): Point {
  return { x: clamp(point.x, bounds.minX, bounds.maxX), y: clamp(point.y, bounds.minY, bounds.maxY) };
}

export function snapPosition(point: Point, bounds: Bounds): EdgePosition {
  const { x, y } = clampPosition(point, bounds);
  const edges: [EdgePosition['edge'], number][] = [['left', x - bounds.minX], ['right', bounds.maxX - x], ['top', y - bounds.minY], ['bottom', bounds.maxY - y]];
  const edge = edges.reduce((nearest, next) => next[1] < nearest[1] ? next : nearest)[0];
  const vertical = edge === 'left' || edge === 'right';
  const range = vertical ? bounds.maxY - bounds.minY : bounds.maxX - bounds.minX;
  return { edge, offset: range ? ((vertical ? y - bounds.minY : x - bounds.minX) / range) : 0 };
}

export function restorePosition(position: EdgePosition, bounds: Bounds): Point {
  const { edge, offset } = position;
  return {
    x: edge === 'left' ? bounds.minX : edge === 'right' ? bounds.maxX : bounds.minX + offset * (bounds.maxX - bounds.minX),
    y: edge === 'top' ? bounds.minY : edge === 'bottom' ? bounds.maxY : bounds.minY + offset * (bounds.maxY - bounds.minY),
  };
}

export function parsePosition(value: string | null): EdgePosition | null {
  try {
    const parsed = JSON.parse(value ?? 'null');
    return parsed && ['left', 'right', 'top', 'bottom'].includes(parsed.edge) && typeof parsed.offset === 'number' && Number.isFinite(parsed.offset) && parsed.offset >= 0 && parsed.offset <= 1 ? { edge: parsed.edge, offset: parsed.offset } : null;
  } catch { return null; }
}
