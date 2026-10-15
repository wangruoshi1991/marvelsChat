import type { SiteDocument } from '../../../../shared/site-document';
import { Palette, palettes } from '../../shared/theme';
import { workspacePalette } from '../../shared/workspacePalette';
import { workspaceTokens } from '../../shared/workspaceUi';

export function siteDocumentTheme(
  theme: SiteDocument['theme'],
  palette: Palette,
) {
  const base = workspacePalette(palette);
  const dark = palette.text === palettes.dark.text;
  const variants = {
    clean: { colors: base, accent: base.text },
    warm: {
      colors: {
        ...base,
        background: dark ? '#211C18' : '#FBF6EE',
        surface: dark ? '#302822' : '#FFFDFA',
        soft: dark ? '#3A3028' : '#F1E7DA',
        text: dark ? '#F8EFE4' : '#352B24',
        secondaryText: dark ? '#CDBCAF' : '#756357',
        border: dark ? '#544435' : '#E7DCD0',
      },
      accent: dark ? '#E7BA8F' : '#925A2F',
    },
    gallery: {
      colors: {
        ...base,
        background: dark ? '#101115' : '#F1F2F5',
        surface: dark ? '#1B1D23' : '#FFFFFF',
        soft: dark ? '#2E313A' : '#E6E9EF',
        text: dark ? '#F3F4FA' : '#20242E',
        secondaryText: dark ? '#BFC4D2' : '#626B7A',
        border: dark ? '#3C414C' : '#DDE1E8',
      },
      accent: dark ? '#B8CAED' : '#335A94',
    },
    portfolio: {
      colors: {
        ...base,
        background: dark ? '#121C22' : '#F1F7F9',
        surface: dark ? '#1D2B33' : '#FFFFFF',
        soft: dark ? '#2A3A45' : '#E3EFF3',
        text: dark ? '#EDF7FC' : '#153545',
        secondaryText: dark ? '#BCD0DA' : '#526E7C',
        border: dark ? '#3A515F' : '#CFDFE7',
      },
      accent: dark ? '#9FCEDC' : '#226175',
    },
  };
  return {
    ...variants[theme],
    sectionRadius: workspaceTokens.radius.panel,
    sectionGap: workspaceTokens.space.xl,
    mediaColumns: theme === 'gallery' ? 2 : 1,
  };
}
