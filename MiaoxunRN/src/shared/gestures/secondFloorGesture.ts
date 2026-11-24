export const secondFloorGestureMinimum = {
  enter: 140,
  exitHandle: 128,
  exitContent: 160,
} as const;

export function isDirectedDrag(
  direction: 'left' | 'right' | 'up' | 'down',
  dx: number,
  dy: number,
  distance: number,
) {
  const horizontal = direction === 'left' || direction === 'right';
  const along = horizontal ? dx : dy;
  const across = horizontal ? dy : dx;
  const forward = direction === 'left' || direction === 'up' ? -along : along;
  return forward >= distance && forward > Math.abs(across) * 1.4;
}
