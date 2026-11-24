import { messageMenuGeometry } from '../src/features/messages/messageMenuGeometry';

test('long-press arrow stays aligned after the menu is clamped on a narrow screen', () => {
  const frame = { x: 0, y: 100, width: 320, height: 500 };
  const message = { x: 10, y: 220, width: 300, height: 96 };
  const mine = messageMenuGeometry({ x: 300, y: 260 }, true, message, frame);
  const other = messageMenuGeometry({ x: 20, y: 260 }, false, message, frame);
  expect(mine.x).toBe(24);
  expect(Math.abs(mine.x + mine.arrowLeft + 6.5 - 300)).toBeLessThan(7);
  expect(other.x).toBe(12);
  expect(other.arrowLeft).toBeGreaterThanOrEqual(14);
});

test('menu opens below a bottom message without covering its sender row', () => {
  const frame = { x: 0, y: 120, width: 393, height: 800 };
  const message = { x: 0, y: 530, width: 393, height: 45 };
  const position = messageMenuGeometry(
    { x: 200, y: 550 },
    false,
    message,
    frame,
  );

  expect(position.arrowPlacement).toBe('top');
  expect(position.y).toBe(463);
  expect(position.y - 7).toBeGreaterThan(message.y - frame.y + message.height);
});

test('menu opens above an upper-half message when enough rows fit', () => {
  const frame = { x: 0, y: 120, width: 393, height: 800 };
  const message = { x: 0, y: 470, width: 393, height: 82 };
  const position = messageMenuGeometry(
    { x: 200, y: 490 },
    false,
    message,
    frame,
  );

  expect(position.arrowPlacement).toBe('bottom');
  expect(position.y).toBe(286);
  expect(position.y + 56 + 7).toBeLessThanOrEqual(message.y - frame.y);
});

test('menu opens on the side with room for more rows in a compact message area', () => {
  const frame = { x: 0, y: 120, width: 393, height: 420 };
  const message = { x: 0, y: 275, width: 393, height: 72 };
  const position = messageMenuGeometry(
    { x: 200, y: 310 },
    false,
    message,
    frame,
  );

  expect(position.arrowPlacement).toBe('top');
  expect(position.y - 7).toBeGreaterThan(message.y - frame.y + message.height);
});

test('keeps a multi-row menu inside the available space on either side of a message', () => {
  const frame = { x: 16, y: 120, width: 288, height: 300 };
  const above = messageMenuGeometry(
    { x: 288, y: 308 },
    true,
    { x: 180, y: 291, width: 120, height: 100 },
    frame,
  );
  expect(above.anchored).toBe(true);
  expect(above.x + above.menuWidth).toBeLessThanOrEqual(frame.width - 12);
  expect(frame.height - above.bottom! - above.maxHeight).toBe(8);

  const below = messageMenuGeometry(
    { x: 48, y: 181 },
    false,
    { x: 28, y: 147, width: 144, height: 86 },
    frame,
  );
  expect(below.anchored).toBe(true);
  expect(below.y + below.maxHeight).toBe(frame.height - 8);
});

test('keeps the full translation menu visible above a message near the composer', () => {
  const frame = { x: 0, y: 100, width: 412, height: 720 };
  const message = { x: 209, y: 625, width: 187, height: 46 };
  const position = messageMenuGeometry(
    { x: 320, y: 650 },
    true,
    message,
    frame,
  );

  expect(position.arrowPlacement).toBe('bottom');
  expect(position.maxHeight).toBeGreaterThan(320);
  expect(position.bottom).toBe(frame.height - (message.y - frame.y) + 8);
});

test('uses the available message area without an arrow when neither side fits a row', () => {
  const frame = { x: 0, y: 0, width: 320, height: 180 };
  const position = messageMenuGeometry(
    { x: 180, y: 90 },
    true,
    { x: 60, y: 30, width: 250, height: 120 },
    frame,
  );
  expect(position).toMatchObject({ anchored: false, y: 8, maxHeight: 164 });
  expect(position.bottom).toBeUndefined();
});
