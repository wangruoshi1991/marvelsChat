export type Appearance = 'light' | 'dark';

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
    background: '#f6f6f3',
    surface: '#fffffb',
    soft: '#ecefe9',
    text: '#1a1f1c',
    secondaryText: 'rgba(26,31,28,0.62)',
    border: 'rgba(0,0,0,0.08)',
    shadow: 'rgba(0,0,0,0.04)',
    mint: '#2ead85',
    rose: '#f2576b',
    sun: '#f5c449',
    input: '#fffffb',
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
