export type Appearance = 'light' | 'dark';

// Product colors live here; screen palettes compose these roles rather than
// redeclaring the same brand or workspace values in each feature.
export const productColors = {
  accent: '#2012D9',
  background: '#F8F7FD',
  surface: '#FFFFFF',
  soft: '#F4F6FF',
  border: '#F0EBFD',
  chipBorder: '#DBE2FF',
  text: '#000000',
  secondaryText: 'rgba(0,0,0,0.60)',
};

export const workspaceColors = {
  background: '#F6F6F8',
  surface: productColors.surface,
  soft: '#ECECEF',
  border: '#E9E9ED',
  text: '#151515',
  secondaryText: '#66666F',
};

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
