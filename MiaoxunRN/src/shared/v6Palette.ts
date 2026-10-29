import { Palette } from './theme';

export const v6Colors = {
  background: '#11121e',
  surface: '#292e3f',
  soft: '#202636',
  text: '#f6f7fa',
  secondaryText: '#a4a8b5',
  accent: '#00c7cb',
  onAccent: '#052c31',
};

/** V6 defines one dark canvas for the signed-in product screens. */
export function v6Palette(palette: Palette): Palette {
  return {
    ...palette,
    background: v6Colors.background,
    surface: v6Colors.surface,
    soft: v6Colors.soft,
    text: v6Colors.text,
    secondaryText: v6Colors.secondaryText,
    border: 'rgba(255,255,255,0.075)',
    shadow: 'rgba(0,0,0,0.32)',
    mint: v6Colors.accent,
    input: '#151a28',
  };
}

export function isV6Palette(palette: Palette): boolean {
  return (
    palette.background === v6Colors.background && palette.text === v6Colors.text
  );
}
