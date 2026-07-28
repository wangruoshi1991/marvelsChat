import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

import { avatar3dModelFileUrl } from '../../services/api/avatar3dApi';

type ViewerMessage = {
  type?: unknown;
  message?: unknown;
};

const serializeViewerConfig = (value: object) =>
  JSON.stringify(value).replace(/</g, '\\u003c');

export const isAvatar3DViewerDocumentUrl = (value: string) => {
  if (value === 'about:blank') return true;
  try {
    const url = new URL(value);
    return (
      ['file:', 'http:', 'https:'].includes(url.protocol) &&
      url.pathname.endsWith('/avatar-viewer/avatar-viewer.html')
    );
  } catch {
    return false;
  }
};

export function buildAvatar3DViewerScript({
  modelUrl,
  token,
}: {
  modelUrl: string;
  token: string;
}) {
  const config = serializeViewerConfig({ modelUrl, token });
  return `window.MiaoxunAvatarViewer.load(${config}); true;`;
}

export function Avatar3DViewer({
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
  const modelUrl = useMemo(() => avatar3dModelFileUrl(modelId), [modelId]);
  const injectedJavaScript = useMemo(
    () => buildAvatar3DViewerScript({ modelUrl, token }),
    [modelUrl, token],
  );

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as ViewerMessage;
      if (message.type === 'error') {
        onError?.(
          typeof message.message === 'string'
            ? message.message
            : '3D形象页面加载失败',
        );
      }
    } catch {
      onError?.('3D形象页面加载失败');
    }
  };

  return (
    <View style={[localStyles.container, style]}>
      <WebView
        allowFileAccess
        allowFileAccessFromFileURLs={false}
        allowUniversalAccessFromFileURLs
        bounces={false}
        cacheEnabled={false}
        domStorageEnabled={false}
        injectedJavaScript={injectedJavaScript}
        javaScriptCanOpenWindowsAutomatically={false}
        javaScriptEnabled
        mixedContentMode="never"
        onError={() => onError?.('3D形象页面加载失败')}
        onMessage={handleMessage}
        onShouldStartLoadWithRequest={request =>
          isAvatar3DViewerDocumentUrl(request.url)
        }
        originWhitelist={['file://*', 'http://*', 'https://*']}
        renderLoading={() => (
          <View style={localStyles.loading}>
            <ActivityIndicator color="#2012D9" />
          </View>
        )}
        scrollEnabled={false}
        setSupportMultipleWindows={false}
        sharedCookiesEnabled={false}
        source={require('../../assets/avatar-viewer/avatar-viewer.html')}
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
