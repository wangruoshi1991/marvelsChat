import { Palette, palettes } from '../../shared/theme';

export function resolveStationColors(palette: Palette) {
  const isLight = palette.text === palettes.light.text;

  return {
    isLight,
    accent: isLight ? '#2012D9' : palette.mint,
    background: isLight ? '#F8F7FD' : palette.background,
    border: isLight ? '#F0EBFD' : palette.border,
    chipBorder: isLight ? '#DBE2FF' : palette.border,
    secondaryText: isLight ? 'rgba(0,0,0,0.60)' : palette.secondaryText,
    soft: isLight ? '#F4F6FF' : palette.soft,
    surface: isLight ? '#FFFFFF' : palette.surface,
    text: isLight ? '#000000' : palette.text,
  };
}
