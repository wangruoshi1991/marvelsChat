import { Palette, palettes } from '../../shared/theme';
import { isV6Palette } from '../../shared/v6Palette';
import { isXunPalette, xunPalette } from '../../shared/xunPalette';

export function resolveMessagePalette(palette: Palette): Palette {
  if (isV6Palette(palette) || isXunPalette(palette)) return palette;
  if (palette.text !== palettes.light.text) {
    return palette;
  }

  return xunPalette(palette);
}
