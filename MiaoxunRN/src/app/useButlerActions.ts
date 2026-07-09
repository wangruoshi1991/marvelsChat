import { useCallback } from 'react';
import {
  ButlerAppActionPlan,
  planButlerAppAction,
} from '../features/butler/appActions';
import { Language } from '../features/session/useMiaoxunSession';
import { Appearance } from '../shared/theme';
import { RootTab } from '../shared/ui';
import { ModalRoute } from './appTypes';

type ButlerSessionActions = {
  language: Language;
  setAppearance: (appearance: Appearance) => void;
  setLanguage: (language: Language) => void;
  sendMessage: (
    threadId: string,
    content: string,
    appActionResult?: ButlerAppActionPlan['result'] | null,
    retryMessageId?: string,
    replyToMessageId?: string | null,
  ) => Promise<boolean>;
};

type UseButlerActionsOptions = {
  session: ButlerSessionActions;
  setSelectedTab: (tab: RootTab) => void;
  setSelectedMessageTab: (tab: 'chat' | 'notice') => void;
  setModalRoute: (route: ModalRoute) => void;
  setSearchQuery: (query: string) => void;
  openQRCode: () => void;
};

export function useButlerActions({
  session,
  setSelectedTab,
  setSelectedMessageTab,
  setModalRoute,
  setSearchQuery,
  openQRCode,
}: UseButlerActionsOptions) {
  const executeButlerAppAction = useCallback(
    (actionPlan: ButlerAppActionPlan) => {
      switch (actionPlan.key) {
        case 'appearance.dark':
          session.setAppearance('dark');
          return;
        case 'appearance.light':
          session.setAppearance('light');
          return;
        case 'language.en':
          session.setLanguage('en');
          return;
        case 'language.zh':
          session.setLanguage('zh');
          return;
        case 'settings.appearanceLanguage':
          session.setLanguage(actionPlan.language);
          session.setAppearance(actionPlan.appearance);
          return;
        case 'navigation.qrCode':
          if (actionPlan.target === 'station') {
            setSelectedTab('station');
          }
          openQRCode();
          return;
        case 'navigation.settings':
          setModalRoute('settings');
          return;
        case 'navigation.search':
          setSearchQuery('');
          setModalRoute('search');
          return;
        case 'navigation.messageActions':
          setModalRoute('message-actions');
          return;
        case 'navigation.siteBuilder':
          setModalRoute('site-builder');
          return;
        case 'navigation.notices':
          setSelectedTab('messages');
          setSelectedMessageTab('notice');
          setModalRoute(null);
          return;
        case 'navigation.chatList':
        case 'navigation.messages':
          setSelectedTab('messages');
          setSelectedMessageTab('chat');
          setModalRoute(null);
          return;
        case 'navigation.station':
          setSelectedTab('station');
          setModalRoute(null);
          return;
      }
    },
    [
      openQRCode,
      session,
      setModalRoute,
      setSearchQuery,
      setSelectedMessageTab,
      setSelectedTab,
    ],
  );

  const sendButlerMessage = useCallback(
    (
      threadId: string,
      content: string,
      retryMessageId?: string,
      replyToMessageId?: string | null,
    ) => {
      const actionPlan = planButlerAppAction(content, session.language);
      return session
        .sendMessage(
          threadId,
          content,
          actionPlan?.result,
          retryMessageId,
          replyToMessageId,
        )
        .then(didSend => {
          if (!actionPlan || !didSend) {
            return;
          }
          setTimeout(() => executeButlerAppAction(actionPlan), 260);
        });
    },
    [executeButlerAppAction, session],
  );

  return { sendButlerMessage };
}
