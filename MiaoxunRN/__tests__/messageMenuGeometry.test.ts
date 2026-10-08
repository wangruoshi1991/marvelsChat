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
  const frame = { x: 0, y: 120, width: 393, height: 420 };
  const message = { x: 0, y: 350, width: 393, height: 82 };
  const position = messageMenuGeometry(
    { x: 200, y: 385 },
    false,
    message,
    frame,
  );

  expect(position.arrowPlacement).toBe('top');
  expect(position.y).toBe(328);
  expect(position.y - 7).toBeGreaterThan(message.y - frame.y + message.height);
});

test('menu opens above a top message and remains inside the message area', () => {
  const frame = { x: 0, y: 120, width: 393, height: 420 };
  const message = { x: 0, y: 220, width: 393, height: 82 };
  const position = messageMenuGeometry(
    { x: 200, y: 250 },
    false,
    message,
    frame,
  );

  expect(position.arrowPlacement).toBe('bottom');
  expect(position.y).toBe(28);
  expect(position.y + 56 + 7).toBeLessThanOrEqual(message.y - frame.y);
});

test('menu opens on the preferred side of a message in the middle of the screen', () => {
  const frame = { x: 0, y: 120, width: 393, height: 420 };
  const message = { x: 0, y: 275, width: 393, height: 72 };
  const position = messageMenuGeometry(
    { x: 200, y: 310 },
    false,
    message,
    frame,
  );

  expect(position.arrowPlacement).toBe('bottom');
  expect(position.y + 56 + 7).toBeLessThanOrEqual(message.y - frame.y);
});
