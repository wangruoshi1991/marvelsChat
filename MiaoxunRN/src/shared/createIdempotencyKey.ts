export const createIdempotencyKey = () => {
  const bytes = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 256),
  );
  const timestamp = Date.now();
  for (let index = 0; index < 6; index += 1) {
    const timestampByte = Math.floor(timestamp / 2 ** (index * 8)) % 256;
    bytes[index] = (bytes[index] + timestampByte) % 256;
  }
  bytes[6] = (bytes[6] % 16) + 64;
  bytes[8] = (bytes[8] % 64) + 128;
  const hex = bytes.map(value => value.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10).join(''),
  ].join('-');
};
