import type { Palette } from '../../shared/theme';
import { workspacePalette } from '../../shared/workspacePalette';
import { isXunPalette } from '../../shared/xunPalette';

/** V15 keeps filled controls and inline accent text on separate teal roles. */
export const secondFloorXunStyles = {
  primaryButton: {
    borderRadius: 12,
    paddingHorizontal: 17,
    paddingVertical: 13,
  },
  secondaryButton: {
    borderColor: '#cedae5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  primaryLabel: {
    color: '#073b3d',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600' as const,
  },
  secondaryLabel: {
    color: '#425b71',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400' as const,
  },
} as const;

export function secondFloorAccent(palette: Palette): string {
  const colors = secondFloorPalette(palette);
  return isXunPalette(colors) ? '#008f95' : colors.mint;
}

/** V15's floor pages use the softer `.xun-light` roles inside the Xun shell. */
export function secondFloorPalette(palette: Palette): Palette {
  const colors = workspacePalette(palette);
  if (!isXunPalette(colors)) return colors;
  return {
    ...colors,
    soft: '#e6edf3',
    text: '#172333',
    secondaryText: '#748293',
    border: '#e5ebf1',
    shadow: 'rgba(38,58,80,0.06)',
  };
}
