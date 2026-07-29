import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

import {
  avatar3dModelFileUrl,
  avatar3dModelThumbnailUrl,
} from '../../services/api/avatar3dApi';

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
  thumbnailAvailable = false,
  onError,
  style,
}: {
  modelId: string;
  token: string;
  thumbnailAvailable?: boolean;
  onError?: (message: string) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const [loaded, setLoaded] = useState(false);
  const modelUrl = useMemo(() => avatar3dModelFileUrl(modelId), [modelId]);
  const thumbnailUrl = useMemo(
    () => avatar3dModelThumbnailUrl(modelId),
    [modelId],
  );
  const injectedJavaScript = useMemo(
    () => buildAvatar3DViewerScript({ modelUrl, token }),
    [modelUrl, token],
  );

  useEffect(() => {
    setLoaded(false);
  }, [modelId]);

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as ViewerMessage;
      if (message.type === 'loaded') {
        setLoaded(true);
        return;
      }
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
        onContentProcessDidTerminate={() =>
          onError?.('3D形象页面加载失败')
        }
        onError={() => onError?.('3D形象页面加载失败')}
        onLoadStart={() => setLoaded(false)}
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
      {!loaded ? (
        <View
          pointerEvents="none"
          style={localStyles.preview}
          testID="avatar3d-viewer-loading"
        >
          {thumbnailAvailable ? (
            <Image
              accessibilityLabel="3D形象预览"
              resizeMode="contain"
              source={{
                headers: { Authorization: `Bearer ${token}` },
                uri: thumbnailUrl,
              }}
              style={localStyles.previewImage}
            />
          ) : null}
          <View style={localStyles.loadingIndicator}>
            <ActivityIndicator color="#2012D9" />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const localStyles = StyleSheet.create({
  container: { flex: 1, overflow: 'hidden' },
  loadingIndicator: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
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
  preview: {
    alignItems: 'center',
    backgroundColor: '#F7F8FC',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  previewImage: {
    bottom: 0,
    height: '100%',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    width: '100%',
  },
});
