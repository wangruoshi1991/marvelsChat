import type { Palette } from './theme';

/** The light roles shared by V15 Xun and its second-floor states. */
export const xunColors = {
  // Match the V15 xun-light canvas; cards and the tab bar remain white.
  background: '#f3f6f9',
  surface: '#ffffff',
  soft: '#e7edf3',
  text: '#171722',
  secondaryText: '#666666',
  border: '#ced7df',
  shadow: 'rgba(36,62,93,0.13)',
  mint: '#00c7cb',
  rose: '#ff484f',
  sun: '#f5c449',
  input: '#ffffff',
} as const;

export function xunPalette(palette: Palette): Palette {
  return {
    ...palette,
    ...xunColors,
  };
}

/** States 03-09 use xun-v3; second-floor xun-light keeps the shared canvas. */
export function xunV3Palette(palette: Palette): Palette {
  return { ...xunPalette(palette), background: '#f4f6f9' };
}

export function isXunPalette(palette: Palette): boolean {
  return (
    (palette.background === xunColors.background ||
      palette.background === '#f4f6f9') &&
    palette.surface === xunColors.surface &&
    (palette.text === xunColors.text || palette.text === '#172333')
  );
}
