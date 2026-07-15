import {Palette, palettes} from '../../shared/theme';

const messageLightPalette: Partial<Palette> = {
  background: '#ffffff',
  border: '#F0EBFD',
  input: '#ffffff',
  soft: '#F8F7FD',
  surface: '#ffffff',
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
