import { AvatarConfigDTO } from '../../models/api';

type AvatarSkinTone = NonNullable<AvatarConfigDTO['skinTone']>;
type AvatarHairColor = NonNullable<AvatarConfigDTO['hairColor']>;
type AvatarAccent = NonNullable<AvatarConfigDTO['accent']>;
type AvatarTop = NonNullable<AvatarConfigDTO['top']>;
type AvatarBottom = NonNullable<AvatarConfigDTO['bottom']>;
type AvatarShoes = NonNullable<AvatarConfigDTO['shoes']>;

const defaultAvatarConfig: Required<AvatarConfigDTO> = {
  version: 2,
  seed: 'miaoxun',
  body: 'standard',
  face: 'soft',
  skinTone: 'warm',
  hairStyle: 'short',
  hairColor: 'black',
  outfit: 'street',
  accent: 'mint',
  pose: 'casual',
  shape: 'circle',
  palette: 'sunrise',
  expression: 'smile',
  accessory: 'none',
  eyeStyle: 'bright',
  browStyle: 'soft',
  mouthStyle: 'smile',
  top: 'hoodie',
  bottom: 'cargo',
  shoes: 'sneaker',
  action: 'stand',
};

export const avatarAccentColors: Record<
  AvatarAccent,
  { primary: string; secondary: string; detail: string }
> = {
  sunrise: { primary: '#f5c449', secondary: '#f2576b', detail: '#171717' },
  mint: { primary: '#2ead85', secondary: '#f5c449', detail: '#12352c' },
  sky: { primary: '#4d96ff', secondary: '#f5c449', detail: '#142748' },
  rose: { primary: '#f2576b', secondary: '#3fbf9f', detail: '#3c1821' },
  violet: { primary: '#7c5cff', secondary: '#ffcf5a', detail: '#241d38' },
};

export const avatarSkinColors: Record<
  AvatarSkinTone,
  { base: string; shade: string; blush: string }
> = {
  porcelain: { base: '#ffd8bd', shade: '#efb38f', blush: '#f3a4a4' },
  warm: { base: '#e7ad82', shade: '#c9825a', blush: '#df8a78' },
  tan: { base: '#bd7c54', shade: '#8f5638', blush: '#c96f66' },
  deep: { base: '#7a4b35', shade: '#4f2f22', blush: '#a95f58' },
};

export const avatarHairColors: Record<AvatarHairColor, string> = {
  black: '#111111',
  brown: '#513522',
  copper: '#a94f24',
  silver: '#d7dce2',
  blue: '#243f75',
};

export const avatarClothingColors: Record<
  AvatarTop,
  { primary: string; secondary: string; line: string }
> = {
  hoodie: { primary: '#1f242d', secondary: '#353b47', line: '#0f1319' },
  shirt: { primary: '#ffffff', secondary: '#e7edf5', line: '#273142' },
  jacket: { primary: '#25324a', secondary: '#4d96ff', line: '#111827' },
  sweater: { primary: '#f2576b', secondary: '#ffcf5a', line: '#481923' },
  uniform: { primary: '#ffffff', secondary: '#2d3c69', line: '#18203d' },
};

export const avatarBottomColors: Record<
  AvatarBottom,
  { primary: string; secondary: string; line: string }
> = {
  cargo: { primary: '#c9c0aa', secondary: '#9d927c', line: '#595242' },
  jeans: { primary: '#315a8d', secondary: '#203f66', line: '#12233b' },
  shorts: { primary: '#46505f', secondary: '#2c3440', line: '#161c24' },
  skirt: { primary: '#2f3552', secondary: '#4a5276', line: '#171a2c' },
  track: { primary: '#15191f', secondary: '#2ead85', line: '#06080b' },
};

export const avatarShoeColors: Record<
  AvatarShoes,
  { primary: string; sole: string; line: string }
> = {
  sneaker: { primary: '#f5f7fb', sole: '#c8d0da', line: '#727b89' },
  boot: { primary: '#3c2f28', sole: '#1e1713', line: '#17110e' },
  canvas: { primary: '#243f75', sole: '#eef2f7', line: '#14264a' },
  runner: { primary: '#ffcf5a', sole: '#1a1f1c', line: '#735b12' },
};

export const normalizeAvatarConfig = (
  config?: AvatarConfigDTO | null,
): Required<AvatarConfigDTO> => ({
  ...defaultAvatarConfig,
  ...(config || {}),
  version: 2,
  accent:
    config?.accent ||
    (config?.palette === 'grape'
      ? 'violet'
      : config?.palette === 'mono'
      ? 'mint'
      : config?.palette) ||
    defaultAvatarConfig.accent,
  accessory:
    config?.accessory === 'cap' ||
    config?.accessory === 'spark' ||
    config?.accessory === 'glasses' ||
    config?.accessory === 'headphones'
      ? config.accessory
      : defaultAvatarConfig.accessory,
  mouthStyle:
    config?.mouthStyle ||
    (config?.expression === 'focus'
      ? 'confident'
      : config?.expression === 'calm'
      ? 'calm'
      : defaultAvatarConfig.mouthStyle),
  top:
    config?.top ||
    (config?.outfit === 'campus'
      ? 'uniform'
      : config?.outfit === 'tech'
      ? 'jacket'
      : config?.outfit === 'artist'
      ? 'shirt'
      : config?.outfit === 'sport'
      ? 'sweater'
      : defaultAvatarConfig.top),
  bottom:
    config?.bottom ||
    (config?.outfit === 'sport'
      ? 'track'
      : config?.outfit === 'artist'
      ? 'shorts'
      : defaultAvatarConfig.bottom),
  action:
    config?.action ||
    (config?.pose === 'hello'
      ? 'wave'
      : config?.pose === 'ready'
      ? 'cross-arms'
      : defaultAvatarConfig.action),
});
