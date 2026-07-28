import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  StyleProp,
  View,
  ViewStyle,
} from 'react-native';
import { WebView } from 'react-native-webview';

import { buildApiUrl } from '../../services/apiClient';

export function Avatar3DWebView({
  modelId,
  token,
  onError,
  style,
}: {
  modelId: string;
  token: string;
  onError?: (message: string) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const sessionUrl = useMemo(
    () =>
      buildApiUrl(`/avatar/app-session?modelId=${encodeURIComponent(modelId)}`),
    [modelId],
  );
  const apiOrigin = useMemo(() => {
    const match = sessionUrl.match(/^(https?:\/\/[^/]+)/i);
    return match?.[1] || '';
  }, [sessionUrl]);

  return (
    <View style={[localStyles.container, style]}>
      <WebView
        allowFileAccess={false}
        bounces={false}
        cacheEnabled
        domStorageEnabled
        javaScriptEnabled
        mixedContentMode="never"
        onError={() => onError?.('3D形象页面加载失败')}
        onHttpError={event => {
          if (event.nativeEvent.statusCode >= 400) {
            onError?.(`3D形象服务返回 ${event.nativeEvent.statusCode}`);
          }
        }}
        onShouldStartLoadWithRequest={request =>
          request.url === 'about:blank' ||
          Boolean(apiOrigin && request.url.startsWith(`${apiOrigin}/`))
        }
        originWhitelist={apiOrigin ? [apiOrigin] : []}
        renderLoading={() => (
          <View style={localStyles.loading}>
            <ActivityIndicator color="#2012D9" />
          </View>
        )}
        scrollEnabled={false}
        setSupportMultipleWindows={false}
        sharedCookiesEnabled
        source={{
          uri: sessionUrl,
          headers: { Authorization: `Bearer ${token}` },
        }}
        startInLoadingState
        thirdPartyCookiesEnabled={false}
      />
    </View>
  );
}

const localStyles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  loading: {
    alignItems: 'center',
    backgroundColor: '#F7F8FC',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
});
