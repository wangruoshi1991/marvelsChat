import { Palette, palettes, workspaceColors } from './theme';

export function workspacePalette(palette: Palette): Palette {
  if (palette.text !== palettes.light.text)
    return { ...palette, mint: palette.text };
  return {
    ...palette,
    ...workspaceColors,
    input: workspaceColors.surface,
    mint: workspaceColors.text,
  };
}
