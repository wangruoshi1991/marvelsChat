import { normalizeAvatarConfig } from '../src/features/avatar/avatarConfig';
import type { AvatarConfigDTO } from '../src/models/api';

test('avatar normalization keeps only the current v2 fields', () => {
  const legacyConfig = {
    palette: 'grape',
    shape: 'rounded',
  } as unknown as AvatarConfigDTO;
  const normalized = normalizeAvatarConfig(legacyConfig);

  expect(normalized.accent).toBe('mint');
  expect(Object.prototype.hasOwnProperty.call(normalized, 'palette')).toBe(
    false,
  );
  expect(Object.prototype.hasOwnProperty.call(normalized, 'shape')).toBe(false);
});

test('avatar normalization preserves a current accent', () => {
  expect(normalizeAvatarConfig({ accent: 'violet' }).accent).toBe('violet');
});
