import { ButlerLocalActionResultPayload } from '../../models/api';
import { Appearance } from '../../shared/theme';
import { Language } from '../session/useMiaoxunSession';

type ButlerAppActionKey =
  | 'appearance.dark'
  | 'appearance.light'
  | 'language.en'
  | 'language.zh'
  | 'settings.appearanceLanguage'
  | 'navigation.qrCode'
  | 'navigation.settings'
  | 'navigation.search'
  | 'navigation.messageActions'
  | 'navigation.siteBuilder'
  | 'navigation.notices'
  | 'navigation.chatList'
  | 'navigation.messages'
  | 'navigation.station';

type BaseButlerAppActionPlan = {
  key: ButlerAppActionKey;
  result: ButlerLocalActionResultPayload;
};

export type ButlerAppActionPlan =
  | (BaseButlerAppActionPlan & {
      key: 'settings.appearanceLanguage';
      appearance: Appearance;
      language: Language;
    })
  | (BaseButlerAppActionPlan & {
      key: 'navigation.qrCode';
      target: 'current' | 'station';
    })
  | (BaseButlerAppActionPlan & {
      key: Exclude<
        ButlerAppActionKey,
        'settings.appearanceLanguage' | 'navigation.qrCode'
      >;
    });

type IntentMatch = {
  wantsStation: boolean;
  wantsMessages: boolean;
  wantsQrCode: boolean;
  requestedAppearance: Appearance | null;
  requestedLanguage: Language | null;
  includesAny: (values: string[]) => boolean;
};

const includesAny = (normalized: string, values: string[]) =>
  values.some(value => normalized.includes(value));

const parseIntent = (content: string): IntentMatch => {
  const normalized = content.toLowerCase();
  const hasAny = (values: string[]) => includesAny(normalized, values);
  return {
    wantsStation: hasAny(['小站', 'station']),
    wantsMessages: hasAny(['妙讯页', '消息页', '聊天列表', 'messages page']),
    wantsQrCode: hasAny(['二维码', '动态码', 'qr']),
    requestedAppearance: hasAny(['深色', 'dark mode'])
      ? 'dark'
      : hasAny(['浅色', 'light mode'])
      ? 'light'
      : null,
    requestedLanguage: hasAny(['英文', 'english'])
      ? 'en'
      : hasAny(['中文', 'chinese'])
      ? 'zh'
      : null,
    includesAny: hasAny,
  };
};

const appearanceText = (appearance: Appearance, language: Language) =>
  appearance === 'dark'
    ? language === 'en'
      ? 'dark mode'
      : '深色视觉'
    : language === 'en'
    ? 'light mode'
    : '浅色视觉';

const languageText = (language: Language, outputLanguage: Language) =>
  language === 'zh'
    ? outputLanguage === 'en'
      ? 'Chinese interface'
      : '中文界面'
    : outputLanguage === 'en'
    ? 'English interface'
    : '英文界面';

const actionMessage = (language: Language, zh: string, en: string) =>
  language === 'en' ? en : zh;

export function planButlerAppAction(
  content: string,
  language: Language = 'zh',
): ButlerAppActionPlan | null {
  const intent = parseIntent(content);

  if (intent.requestedAppearance && intent.requestedLanguage) {
    return {
      key: 'settings.appearanceLanguage',
      appearance: intent.requestedAppearance,
      language: intent.requestedLanguage,
      result: {
        type: 'settings',
        status: 'applied',
        message: actionMessage(
          language,
          `${languageText(intent.requestedLanguage, 'zh')}和${appearanceText(
            intent.requestedAppearance,
            'zh',
          )}已准备切换。`,
          `${languageText(intent.requestedLanguage, 'en')} and ${appearanceText(
            intent.requestedAppearance,
            'en',
          )} are ready to switch.`,
        ),
      },
    };
  }

  if (intent.requestedAppearance === 'dark') {
    return {
      key: 'appearance.dark',
      result: {
        type: 'appearance',
        status: 'applied',
        message: actionMessage(
          language,
          '深色视觉已准备切换。',
          'Dark mode is ready to switch.',
        ),
      },
    };
  }

  if (intent.requestedAppearance === 'light') {
    return {
      key: 'appearance.light',
      result: {
        type: 'appearance',
        status: 'applied',
        message: actionMessage(
          language,
          '浅色视觉已准备切换。',
          'Light mode is ready to switch.',
        ),
      },
    };
  }

  if (intent.requestedLanguage === 'en') {
    return {
      key: 'language.en',
      result: {
        type: 'language',
        status: 'applied',
        message: actionMessage(
          language,
          '英文界面已准备切换。',
          'English interface is ready to switch.',
        ),
      },
    };
  }

  if (intent.requestedLanguage === 'zh') {
    return {
      key: 'language.zh',
      result: {
        type: 'language',
        status: 'applied',
        message: actionMessage(
          language,
          '中文界面已准备切换。',
          'Chinese interface is ready to switch.',
        ),
      },
    };
  }

  if (intent.wantsQrCode) {
    return {
      key: 'navigation.qrCode',
      target: intent.wantsStation ? 'station' : 'current',
      result: {
        type: 'navigation',
        status: 'applied',
        message: intent.wantsStation
          ? actionMessage(
              language,
              '小站页和 AI ID 动态码已准备打开。',
              'Station and AI ID QR code are ready to open.',
            )
          : actionMessage(
              language,
              'AI ID 动态码已准备打开。',
              'AI ID QR code is ready to open.',
            ),
      },
    };
  }

  if (intent.includesAny(['设置', 'settings'])) {
    return {
      key: 'navigation.settings',
      result: {
        type: 'navigation',
        status: 'applied',
        message: actionMessage(
          language,
          '设置页已准备打开。',
          'Settings are ready to open.',
        ),
      },
    };
  }

  if (intent.includesAny(['搜索', 'search'])) {
    return {
      key: 'navigation.search',
      result: {
        type: 'navigation',
        status: 'applied',
        message: actionMessage(
          language,
          '搜索页已准备打开。',
          'Search is ready to open.',
        ),
      },
    };
  }

  if (intent.includesAny(['添加好友', '扫码'])) {
    return {
      key: 'navigation.messageActions',
      result: {
        type: 'navigation',
        status: 'applied',
        message: actionMessage(
          language,
          '妙讯扫码入口已准备打开。',
          'The Miaoxun scanner is ready to open.',
        ),
      },
    };
  }

  if (intent.includesAny(['建站', '建站入口', 'site builder'])) {
    return {
      key: 'navigation.siteBuilder',
      result: {
        type: 'navigation',
        status: 'applied',
        message: actionMessage(
          language,
          '妙建站入口已准备打开。',
          'The site builder entry is ready to open.',
        ),
      },
    };
  }

  if (intent.includesAny(['通知', 'notice', 'notices'])) {
    return {
      key: 'navigation.notices',
      result: {
        type: 'navigation',
        status: 'applied',
        message: actionMessage(
          language,
          '通知页已准备打开。',
          'Notices are ready to open.',
        ),
      },
    };
  }

  if (
    intent.includesAny(['聊天', 'chat']) &&
    intent.includesAny(['切换', '打开', 'go to', 'show'])
  ) {
    return {
      key: 'navigation.chatList',
      result: {
        type: 'navigation',
        status: 'applied',
        message: actionMessage(
          language,
          '聊天列表已准备打开。',
          'The chat list is ready to open.',
        ),
      },
    };
  }

  if (intent.wantsMessages) {
    return {
      key: 'navigation.messages',
      result: {
        type: 'navigation',
        status: 'applied',
        message: actionMessage(
          language,
          '妙讯聊天页已准备打开。',
          'Messages are ready to open.',
        ),
      },
    };
  }

  if (intent.wantsStation) {
    return {
      key: 'navigation.station',
      result: {
        type: 'navigation',
        status: 'applied',
        message: actionMessage(
          language,
          '小站页已准备打开。',
          'Station is ready to open.',
        ),
      },
    };
  }

  return null;
}
