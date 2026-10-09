export function keyboardBottomInset(
  frame: { screenY: number; height: number },
  windowHeight: number,
  safeAreaBottom: number,
): number {
  // iOS may retain keyboard height in a hidden/offscreen frame. Only a
  // keyboard intersecting the bottom edge needs to move the composer.
  if (
    !Number.isFinite(frame.screenY) ||
    !Number.isFinite(frame.height) ||
    frame.height <= 0 ||
    frame.screenY + frame.height < windowHeight
  ) {
    return 0;
  }
  const overlap = Math.min(
    frame.height,
    Math.max(0, windowHeight - frame.screenY),
  );
  return Math.max(0, overlap - safeAreaBottom);
}
