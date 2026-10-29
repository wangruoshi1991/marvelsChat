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
 * The shared light-page wash provides the existing left/right tint. A soft white
 * veil fades the top and bottom while leaving the main content area exposed.
 * `productColors.background` remains the flat fill for modals, sheets and dark
 * mode.
 */
export const pageGradientWash = {
  // Sampled from the exposed page margins in the supplied reference sheet:
  // the left edge stays a cool mint while the right edge shifts toward a
  // warmer pale green. The white fade below is intentionally separate so it
  // cannot wash out the content area in the middle of the page.
  left: '#E4F6F3',
  right: '#ECFAE9',
} as const;

/**
 * White veil shared by 妙 / 讯 / 我. It stays open across the main content area
 * so the existing horizontal wash remains visible instead of becoming a white
 * slab. Zero opacity reveals `pageGradientWash` without adding new colours.
 */
export const pageGradientStops = [
  // The reference keeps the horizontal wash intact through the content area.
  // A measured white veil starts near the lower third and reaches about 60%
  // opacity immediately above the white bottom navigation. Earlier versions
  // faded too early or too abruptly, making a pale band cross the middle.
  { offset: 0, color: '#FFFFFF', opacity: 0 },
  { offset: 0.64, color: '#FFFFFF', opacity: 0 },
  { offset: 0.67, color: '#FFFFFF', opacity: 0 },
  { offset: 0.69, color: '#FFFFFF', opacity: 0.12 },
  { offset: 0.72, color: '#FFFFFF', opacity: 0.17 },
  { offset: 0.75, color: '#FFFFFF', opacity: 0.22 },
  { offset: 0.78, color: '#FFFFFF', opacity: 0.28 },
  { offset: 0.81, color: '#FFFFFF', opacity: 0.38 },
  { offset: 0.84, color: '#FFFFFF', opacity: 0.46 },
  { offset: 0.87, color: '#FFFFFF', opacity: 0.53 },
  { offset: 0.9, color: '#FFFFFF', opacity: 0.6 },
  { offset: 0.92, color: '#FFFFFF', opacity: 0.7 },
  { offset: 0.96, color: '#FFFFFF', opacity: 0.85 },
  { offset: 1, color: '#FFFFFF', opacity: 1 },
] as const;

/** The flat tint used by the station's opaque sticky header. */
export const pageGradientTop = pageGradientWash.left;
export const pageGradientBottom = '#FFFFFF';

/**
 * Default avatar plates. The prototype gives each avatar category its own
 * gradient and never one shared colour, so an account gets one of these picked
 * from its own name — stable across renders, varied across a list. Every entry
 * clears 3:1 against white at the avatar's bold size.
 *
 * Twelve entries rather than six: with six, common two-character names collided
 * often enough that a list of eight accounts showed the same plate twice.
 */
export const avatarPlateColors = [
  '#D73F86',
  '#1476A7',
  '#24283B',
  '#5168D9',
  '#EF476F',
  '#3972CD',
  '#9B5DE5',
  '#B45309',
  '#1F9D55',
  '#B03A7A',
  '#0E7490',
  '#7C4DFF',
] as const;

/**
 * A non-linear mix over the name's code points, not a plain `*31 + code`. The
 * linear version put every single-character name through `codePoint % 12`, so
 * `S` (83) and `妙` (22937) — both ≡ 5 mod 6 — landed on the same plate.
 * Squaring the running value between characters breaks that relation without
 * bitwise operators, which this codebase's lint rules disallow.
 */
export function avatarPlateColor(seed: string): string {
  const name = seed || '妙';
  let hash = 0;
  // `for…of` walks code points, so an emoji name hashes once rather than twice.
  let index = 0;
  for (const char of name) {
    const code = char.codePointAt(0)!;
    hash = (hash * 131 + code + Math.floor(hash / 101)) % 1000003;
    hash = (hash * hash + 17 + code * index) % 1000003;
    hash = (hash * 61 + 23) % 1000003;
    index += 1;
  }
  return avatarPlateColors[hash % avatarPlateColors.length];
}

/** True for the light theme, the only one the page gradient applies to. */
export function isLightPalette(palette: Palette): boolean {
  // Xun 3.0 uses a cool light canvas with its own ink values rather than the
  // legacy mint page roles, so text equality alone is not sufficient here.
  return (
    palette.text === palettes.light.text ||
    ((palette.background === '#f3f6f9' || palette.background === '#f4f6f9') &&
      palette.surface === '#ffffff')
  );
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
    return { disc: mixWithWhite(hex, 0.945), glyph: mixWithWhite(hex, 0.2) };
  }
  return {
    // Sampled off the reference: the disc sits around `#E9FAF7` — a 94.7%
    // lightness tint, not the 92% the first pass used, which read too strong
    // next to the white card.
    disc: hslToHex(resolved.hue, 0.5, 0.945),
    glyph: hslToHex(resolved.hue, 0.58, 0.38),
  };
}
