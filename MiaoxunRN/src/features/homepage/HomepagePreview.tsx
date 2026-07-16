import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { WebView } from 'react-native-webview';

import { Language } from '../session/useMiaoxunSession';
import { textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import { homepageStyles } from './homepageStyles';

export function HomepagePreview({
  palette,
  language,
  previewUrl,
  onBack,
}: {
  palette: Palette;
  language: Language;
  previewUrl: string;
  onBack: () => void;
}) {
  const [hasError, setHasError] = useState(false);
  const allowedPrefix = useMemo(() => {
    const match = previewUrl.match(/^(https?:\/\/[^/]+)/i);
    return match?.[1] || '';
  }, [previewUrl]);

  return (
    <View
      style={[homepageStyles.screen, { backgroundColor: palette.background }]}
    >
      <View
        style={[homepageStyles.header, { borderBottomColor: palette.border }]}
      >
        <Pressable
          accessibilityLabel={textFor(language, '返回编辑', 'Back to editor')}
          onPress={onBack}
          style={[
            homepageStyles.headerButton,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
        >
          <ChevronLeft color={palette.text} size={22} strokeWidth={2.5} />
        </Pressable>
        <Text style={[homepageStyles.headerTitle, { color: palette.text }]}>
          {textFor(language, '主页预览', 'Homepage preview')}
        </Text>
        <View style={homepageStyles.headerSpacer} />
      </View>
      <WebView
        testID="homepage-webview"
        style={homepageStyles.preview}
        source={{ uri: previewUrl }}
        originWhitelist={['https://*', 'http://*']}
        cacheEnabled={false}
        incognito
        sharedCookiesEnabled={false}
        thirdPartyCookiesEnabled={false}
        allowFileAccess={false}
        allowsLinkPreview={false}
        setSupportMultipleWindows={false}
        mixedContentMode="never"
        onShouldStartLoadWithRequest={request =>
          request.url === previewUrl ||
          request.url === 'about:blank' ||
          Boolean(
            allowedPrefix &&
              request.url.startsWith(`${allowedPrefix}/preview/`),
          )
        }
        onError={() => setHasError(true)}
        onHttpError={() => setHasError(true)}
      />
      {hasError ? (
        <View
          style={[
            homepageStyles.previewError,
            { backgroundColor: palette.text },
          ]}
        >
          <Text
            style={[homepageStyles.statusText, { color: palette.background }]}
          >
            {textFor(
              language,
              '预览暂时无法加载，请返回重试。',
              'Preview could not load. Go back and retry.',
            )}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
