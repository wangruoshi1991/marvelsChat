import { Palette, palettes, productColors } from '../../shared/theme';
import { isV6Palette } from '../../shared/v6Palette';

export function resolveStationColors(palette: Palette) {
  const isV6 = isV6Palette(palette);
  const isLight = !isV6 && palette.text === palettes.light.text;

  return {
    isLight,
    isV6,
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
