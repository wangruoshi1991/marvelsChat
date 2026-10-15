import { Palette, palettes, productColors } from '../../shared/theme';

const messageLightPalette: Partial<Palette> = {
  background: productColors.surface,
  border: productColors.border,
  input: productColors.surface,
  soft: productColors.background,
  surface: productColors.surface,
  mint: productColors.accent,
};

export function resolveMessagePalette(palette: Palette): Palette {
  if (palette.text !== palettes.light.text) {
    return palette;
  }

  return {
    ...palette,
    ...messageLightPalette,
  };
}
