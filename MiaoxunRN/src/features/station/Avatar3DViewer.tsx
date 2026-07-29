import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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

type ViewerStatus = 'booting' | 'loading' | 'parsing' | 'loaded' | 'error';

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
  const webViewRef = useRef<WebView<object>>(null);
  const [status, setStatus] = useState<ViewerStatus>('booting');
  const modelUrl = useMemo(() => avatar3dModelFileUrl(modelId), [modelId]);
  const loadScript = useMemo(
    () => buildAvatar3DViewerScript({ modelUrl, token }),
    [modelUrl, token],
  );
  const failViewer = useCallback(
    (message = '3D形象页面加载失败') => {
      setStatus('error');
      onError?.(message);
    },
    [onError],
  );

  useEffect(() => {
    setStatus('booting');
  }, [modelId]);

  useEffect(() => {
    if (status !== 'booting') return undefined;
    const timeout = setTimeout(() => failViewer(), 10_000);
    return () => clearTimeout(timeout);
  }, [failViewer, status]);

  const handleMessage = (event: WebViewMessageEvent) => {
    try {
      const message = JSON.parse(event.nativeEvent.data) as ViewerMessage;
      if (message.type === 'ready') {
        const viewer = webViewRef.current;
        if (!viewer) {
          failViewer();
          return;
        }
        try {
          viewer.injectJavaScript(loadScript);
          setStatus('loading');
        } catch {
          failViewer();
        }
        return;
      }
      if (message.type === 'downloading') {
        setStatus('loading');
        return;
      }
      if (message.type === 'parsing') {
        setStatus('parsing');
        return;
      }
      if (message.type === 'loaded') {
        setStatus('loaded');
        return;
      }
      if (message.type === 'error') {
        failViewer(
          typeof message.message === 'string'
            ? message.message
            : '3D形象页面加载失败',
        );
      }
    } catch {
      failViewer();
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
        javaScriptCanOpenWindowsAutomatically={false}
        javaScriptEnabled
        mixedContentMode="never"
        onContentProcessDidTerminate={() => failViewer()}
        onError={() => failViewer()}
        onLoadStart={() => setStatus('booting')}
        onMessage={handleMessage}
        onShouldStartLoadWithRequest={request =>
          isAvatar3DViewerDocumentUrl(request.url)
        }
        originWhitelist={['file://*', 'http://*', 'https://*']}
        ref={webViewRef}
        scrollEnabled={false}
        setSupportMultipleWindows={false}
        sharedCookiesEnabled={false}
        source={require('../../assets/avatar-viewer/avatar-viewer.html')}
        thirdPartyCookiesEnabled={false}
      />
      {status !== 'loaded' && status !== 'error' ? (
        <View
          pointerEvents="none"
          style={localStyles.preview}
          testID="avatar3d-viewer-loading"
        >
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
});
