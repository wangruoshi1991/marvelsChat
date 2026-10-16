export type Appearance = 'light' | 'dark';

// Product colors live here; screen palettes compose these roles rather than
// redeclaring the same brand or workspace values in each feature.
//
// The 2026-10-16 pass moved the light theme from the original indigo/lavender
// family (#2012D9 on #F8F7FD) to the mint family the user picked from the
// reference sheet: a pale mint page under white cards, with a deep teal-green
// accent. The accent is far darker than the reference's bright #6AD0A1 on
// purpose: that green is a fill colour, and as text it would fail contrast on
// every surface this one has to sit on. #097363 clears WCAG AA (4.5:1) against
// white, the mint page, `soft` and `border` alike.
export const productColors = {
  accent: '#097363',
  background: '#E6F4F0',
  surface: '#FFFFFF',
  soft: '#E9F6F2',
  border: '#D6EDE7',
  chipBorder: '#C3E6DE',
  text: '#000000',
  secondaryText: 'rgba(0,0,0,0.60)',
};

export const workspaceColors = {
  background: '#E6F4F0',
  surface: productColors.surface,
  soft: '#E9F6F2',
  border: '#D6EDE7',
  text: '#151515',
  secondaryText: '#66666F',
};

/**
 * The light page background is a vertical wash rather than a flat fill: the
 * reference screens run from mint at the top to near-white at the bottom.
 * Sampled off the reference at 5% / 25% / 45% / 62% / 80% of the page height.
 * `productColors.background` stays the flat equivalent for surfaces that cannot
 * take a gradient (modals, sheets, dark mode).
 */
export const pageGradientStops = [
  { offset: 0, color: '#E6F5F1' },
  { offset: 0.25, color: '#EAF8F3' },
  { offset: 0.45, color: '#EDF7F3' },
  { offset: 0.62, color: '#F1F8F6' },
  { offset: 0.8, color: '#F2FBF8' },
  { offset: 1, color: '#FFFFFF' },
] as const;

/** True for the light theme, the only one the page gradient applies to. */
export function isLightPalette(palette: Palette): boolean {
  return palette.text === palettes.light.text;
}

export type Palette = {
  background: string;
  surface: string;
  soft: string;
  text: string;
  secondaryText: string;
  border: string;
  shadow: string;
  mint: string;
  rose: string;
  sun: string;
  input: string;
};

export const palettes: Record<Appearance, Palette> = {
  light: {
    background: productColors.background,
    surface: productColors.surface,
    soft: productColors.soft,
    text: productColors.text,
    secondaryText: productColors.secondaryText,
    border: productColors.border,
    shadow: 'rgba(0,0,0,0.04)',
    mint: productColors.accent,
    rose: '#f2576b',
    sun: '#f5c449',
    input: productColors.surface,
  },
  dark: {
    background: '#0e100f',
    surface: '#202321',
    soft: '#303733',
    text: '#f0f6f0',
    secondaryText: '#c2ccc2',
    border: 'rgba(255,255,255,0.16)',
    shadow: 'rgba(0,0,0,0.42)',
    mint: '#2ead85',
    rose: '#f2576b',
    sun: '#f5c449',
    input: '#0e100f',
  },
};

export const spacing = {
  pageX: 18,
  cardRadius: 8,
  bottomBarMinHeight: 70,
};

/** Splits `#RRGGBB` into its three channels, or null when it is not that shape. */
export function hexChannels(hex: string): [number, number, number] | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) {
    return null;
  }
  const digits = match[1];
  return [0, 2, 4].map(offset =>
    parseInt(digits.slice(offset, offset + 2), 16),
  ) as [number, number, number];
}

function channelsToHex(channels: [number, number, number]): string {
  return `#${channels
    .map(channel =>
      Math.max(0, Math.min(255, Math.round(channel)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** Blends a colour toward white, e.g. `mixWithWhite('#12352C', 0.92)`. */
export function mixWithWhite(hex: string, whiteRatio: number): string {
  const channels = hexChannels(hex);
  if (!channels) {
    return hex;
  }
  return channelsToHex(
    channels.map(channel => channel + (255 - channel) * whiteRatio) as [
      number,
      number,
      number,
    ],
  );
}

function toHex(value: number): string {
  return Math.round(value * 255)
    .toString(16)
    .padStart(2, '0');
}

export function hslToHex(
  hue: number,
  saturation: number,
  lightness: number,
): string {
  const channel = (n: number) => {
    const k = (n + hue * 12) % 12;
    const a = saturation * Math.min(lightness, 1 - lightness);
    return toHex(lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

function hexToHueSaturation(hex: string) {
  const channels = hexChannels(hex);
  if (!channels) {
    return null;
  }
  const [r, g, b] = channels.map(channel => channel / 255) as [
    number,
    number,
    number,
  ];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max - min;
  const lightness = (max + min) / 2;
  const saturation =
    chroma === 0 ? 0 : chroma / (1 - Math.abs(2 * lightness - 1));
  if (saturation < 0.08) {
    return { hue: 0, saturation, achromatic: true as const };
  }
  let hue = 0;
  if (max === r) {
    hue = ((g - b) / chroma + (g < b ? 6 : 0)) / 6;
  } else if (max === g) {
    hue = ((b - r) / chroma + 2) / 6;
  } else {
    hue = ((r - g) / chroma + 4) / 6;
  }
  return { hue, saturation, achromatic: false as const };
}

/**
 * Expands an Agent's single brand colour into the pair the shared Agent glyph
 * needs: the pastel disc it sits on, and the legible glyph on top of it. Hue is
 * kept and saturation pinned, so Agents read as siblings instead of unrelated
 * swatches, and a near-black brand colour still yields a legible glyph rather
 * than a muddy blob. Greys keep their neutrality instead of being given a hue.
 */
export function agentGlyphColors(hex: string): {
  disc: string;
  glyph: string;
} {
  const resolved = hexToHueSaturation(hex);
  if (!resolved) {
    return { disc: '#E6F4F0', glyph: '#0B8271' };
  }
  if (resolved.achromatic) {
    return { disc: mixWithWhite(hex, 0.92), glyph: mixWithWhite(hex, 0.2) };
  }
  return {
    disc: hslToHex(resolved.hue, 0.46, 0.92),
    glyph: hslToHex(resolved.hue, 0.58, 0.38),
  };
}
