import { Palette, palettes, productColors } from '../../shared/theme';

export function resolveStationColors(palette: Palette) {
  const isLight = palette.text === palettes.light.text;

  return {
    isLight,
    accent: isLight ? productColors.accent : palette.mint,
    background: isLight ? productColors.background : palette.background,
    border: isLight ? productColors.border : palette.border,
    chipBorder: isLight ? productColors.chipBorder : palette.border,
    secondaryText: isLight
      ? productColors.secondaryText
      : palette.secondaryText,
    soft: isLight ? productColors.soft : palette.soft,
    surface: isLight ? productColors.surface : palette.surface,
    text: isLight ? productColors.text : palette.text,
  };
}
