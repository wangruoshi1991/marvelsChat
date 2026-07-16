import React from 'react';

import { Palette } from '../../shared/theme';
import { HomepageScreen } from '../homepage/HomepageScreen';
import { HomepageSession } from '../homepage/homepageTypes';
import { Language } from '../session/useMiaoxunSession';

export function SiteBuilderScreen({
  palette,
  language,
  session,
  onBack,
  onActionMessage,
  onActionError,
}: {
  palette: Palette;
  language: Language;
  session: HomepageSession;
  onBack: () => void;
  onActionMessage: (message: string) => void;
  onActionError: (error: unknown) => void;
}) {
  return (
    <HomepageScreen
      palette={palette}
      language={language}
      session={session}
      onBack={onBack}
      onActionMessage={onActionMessage}
      onActionError={onActionError}
    />
  );
}
