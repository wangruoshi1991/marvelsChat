export function messageMenuGeometry(
  point: { x: number; y: number },
  isMine: boolean,
  message: { x: number; y: number; width: number; height: number },
  frame: { x: number; y: number; width: number; height: number },
) {
  const menuWidth = isMine ? 284 : 220;
  const menuHeight = 56;
  const arrowDepth = 7;
  const menuGap = 16;
  const edgeInset = 8;
  const x = Math.min(
    Math.max(point.x - frame.x - (isMine ? menuWidth - 42 : 42), 12),
    Math.max(12, frame.width - menuWidth - 12),
  );
  const messageTop = message.y - frame.y;
  const messageBottom = messageTop + message.height;
  const spaceAbove = messageTop - edgeInset;
  const spaceBelow = frame.height - messageBottom - edgeInset;
  const fitsAbove = spaceAbove >= menuHeight + menuGap;
  const fitsBelow = spaceBelow >= menuHeight + menuGap;
  const prefersBelow = point.y - frame.y >= frame.height / 2;
  const arrowPlacement: 'top' | 'bottom' =
    prefersBelow && fitsBelow
      ? 'top'
      : !prefersBelow && fitsAbove
      ? 'bottom'
      : fitsBelow
      ? 'top'
      : 'bottom';
  const minY = edgeInset + (arrowPlacement === 'top' ? arrowDepth : 0);
  const maxY =
    frame.height -
    menuHeight -
    edgeInset -
    (arrowPlacement === 'bottom' ? arrowDepth : 0);
  const preferredY =
    arrowPlacement === 'top'
      ? messageBottom + menuGap
      : messageTop - menuGap - menuHeight;
  return {
    x,
    y: Math.min(Math.max(minY, preferredY), Math.max(minY, maxY)),
    isMine,
    arrowPlacement,
    arrowLeft: Math.min(
      Math.max(point.x - frame.x - x - 6.5, 14),
      menuWidth - 20,
    ),
  };
}
