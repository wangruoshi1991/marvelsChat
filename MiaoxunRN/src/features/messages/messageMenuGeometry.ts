export function messageMenuGeometry(
  point: { x: number; y: number },
  isMine: boolean,
  message: { x: number; y: number; width: number; height: number },
  frame: { x: number; y: number; width: number; height: number },
) {
  const edgeInset = 8;
  const horizontalInset = 12;
  const menuWidth = Math.min(
    isMine ? 284 : 220,
    Math.max(0, frame.width - horizontalInset * 2),
  );
  const minimumMenuHeight = 56;
  // Leave room for the common multi-row menu before honoring the anchor side.
  const preferredMenuHeight = 320;
  // Keep the menu visually attached to the bubble while leaving room for the
  // arrow. A larger gap makes reply/delete appear detached on compact phones.
  const menuGap = 8;
  const x = Math.min(
    Math.max(
      point.x - frame.x - (isMine ? menuWidth - 42 : 42),
      horizontalInset,
    ),
    Math.max(horizontalInset, frame.width - menuWidth - horizontalInset),
  );
  const messageTop = message.y - frame.y;
  const messageBottom = messageTop + message.height;
  const spaceAbove = messageTop - edgeInset - menuGap;
  const spaceBelow = frame.height - messageBottom - edgeInset - menuGap;
  const prefersBelow = point.y - frame.y >= frame.height / 2;
  const preferredSpace = prefersBelow ? spaceBelow : spaceAbove;
  const otherSpace = prefersBelow ? spaceAbove : spaceBelow;
  const fitsEnoughRows =
    preferredSpace >= Math.min(preferredMenuHeight, otherSpace);
  const below = fitsEnoughRows ? prefersBelow : !prefersBelow;
  const arrowPlacement: 'top' | 'bottom' = below ? 'top' : 'bottom';
  const availableSpace = below ? spaceBelow : spaceAbove;
  const anchored = availableSpace >= minimumMenuHeight;
  const preferredY = below
    ? messageBottom + menuGap
    : messageTop - menuGap - minimumMenuHeight;
  const menuY = Math.max(edgeInset, preferredY);
  return {
    x,
    y: anchored ? menuY : edgeInset,
    isMine,
    arrowPlacement,
    anchored,
    menuWidth,
    maxHeight: Math.max(
      0,
      anchored ? availableSpace : frame.height - edgeInset * 2,
    ),
    bottom:
      anchored && !below ? frame.height - messageTop + menuGap : undefined,
    arrowLeft: Math.min(
      Math.max(point.x - frame.x - x - 6.5, 14),
      Math.max(0, menuWidth - 20),
    ),
  };
}
