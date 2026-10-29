import { Palette, palettes, workspaceColors } from './theme';
import { isV6Palette } from './v6Palette';
import { isXunPalette } from './xunPalette';

export function workspacePalette(palette: Palette): Palette {
  if (isV6Palette(palette) || isXunPalette(palette)) return palette;
  if (palette.text !== palettes.light.text)
    return { ...palette, mint: palette.text };
  return {
    ...palette,
    ...workspaceColors,
    input: workspaceColors.surface,
    mint: workspaceColors.text,
  };
}
