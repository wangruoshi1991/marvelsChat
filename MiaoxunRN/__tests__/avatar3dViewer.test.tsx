import React from 'react';
import { AppState, AppStateStatus } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import {
  Avatar3DViewer,
  buildAvatar3DViewerScript,
  isAvatar3DViewerDocumentUrl,
} from '../src/features/station/Avatar3DViewer';

describe('Avatar3DViewer', () => {
  let appStateChange: (state: AppStateStatus) => void;
  beforeEach(() => {
    AppState.currentState = 'active';
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_type, listener) => {
        appStateChange = listener;
        return { remove: jest.fn() };
      });
  });
  afterEach(() => jest.restoreAllMocks());
  it('injects only the authenticated App model endpoint into the local viewer', () => {
    const script = buildAvatar3DViewerScript({
      modelUrl: 'http://127.0.0.1:4390/api/avatar-3d/app/models/model-1/file',
      token: 'token</script>',
    });

    expect(script).toContain('/api/avatar-3d/app/models/model-1/file');
    expect(script).toContain('token\\u003c/script>');
    expect(script).not.toContain('token</script>');
    expect(script).not.toContain('/avatar/');
  });

  it('allows only the bundled viewer document as top-level navigation', () => {
    expect(isAvatar3DViewerDocumentUrl('about:blank')).toBe(true);
    expect(
      isAvatar3DViewerDocumentUrl(
        'http://localhost:8081/assets/src/assets/avatar-viewer/avatar-viewer.html?platform=ios',
      ),
    ).toBe(true);
    expect(
      isAvatar3DViewerDocumentUrl(
        'file:///private/app/avatar-viewer/avatar-viewer.html',
      ),
    ).toBe(true);
    expect(isAvatar3DViewerDocumentUrl('https://example.com/avatar/')).toBe(
      false,
    );
    expect(
      isAvatar3DViewerDocumentUrl('https://example.com/avatar-viewer.html'),
    ).toBe(false);
  });

  it('loads once when the bridge is ready and preserves the model through tab switches', () => {
    const onError = jest.fn();
    let renderer: ReactTestRenderer.ReactTestRenderer;

    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <Avatar3DViewer
          modelId="model-1"
          onError={onError}
          token="private-token"
        />,
      );
    });

    const webView = renderer!.root.findByProps({ testID: 'avatar-webview' });
    expect(webView.props.source).toBeDefined();
    expect(webView.props.cacheEnabled).toBe(true);
    expect(webView.props.textInteractionEnabled).toBe(false);
    expect(webView.props.dataDetectorTypes).toBe('none');
    expect(webView.props.originWhitelist).toEqual([
      'file://*',
      'http://*',
      'https://*',
    ]);
    expect(webView.props.injectJavaScript).not.toHaveBeenCalled();
    expect(
      renderer!.root.findByProps({ testID: 'avatar3d-viewer-loading' }),
    ).toBeDefined();

    ReactTestRenderer.act(() => {
      webView.props.onMessage({
        nativeEvent: { data: JSON.stringify({ type: 'ready' }) },
      });
    });
    expect(webView.props.injectJavaScript).toHaveBeenCalledWith(
      'window.MiaoxunAvatarViewer?.setActive(true); true;',
    );
    const loadCalls = () =>
      webView.props.injectJavaScript.mock.calls.filter(([script]: [string]) =>
        script.includes('void viewer.load('),
      );
    expect(loadCalls()).toHaveLength(1);

    ReactTestRenderer.act(() => {
      renderer!.update(
        <Avatar3DViewer
          active={false}
          modelId="model-1"
          onError={onError}
          token="private-token"
        />,
      );
    });
    expect(webView.props.injectJavaScript).toHaveBeenCalledWith(
      'window.MiaoxunAvatarViewer?.setActive(false); true;',
    );
    expect(webView.props.source).toBeDefined();

    ReactTestRenderer.act(() => {
      webView.props.onLoadEnd({
        nativeEvent: {
          url: 'file:///private/app/assets/avatar-viewer/avatar-viewer.html',
        },
      });
    });
    expect(loadCalls()).toHaveLength(1);

    ReactTestRenderer.act(() => {
      webView.props.onMessage({
        nativeEvent: { data: JSON.stringify({ type: 'parsing' }) },
      });
    });
    expect(
      renderer!.root.findByProps({ testID: 'avatar3d-viewer-loading' }),
    ).toBeDefined();

    ReactTestRenderer.act(() => {
      webView.props.onMessage({
        nativeEvent: { data: JSON.stringify({ type: 'loaded' }) },
      });
    });
    expect(
      renderer!.root.findAllByProps({ testID: 'avatar3d-viewer-loading' }),
    ).toHaveLength(0);

    ReactTestRenderer.act(() => {
      renderer!.update(
        <Avatar3DViewer
          active
          modelId="model-1"
          onError={onError}
          token="private-token"
        />,
      );
    });
    expect(loadCalls()).toHaveLength(1);
    expect(
      renderer!.root.findAllByProps({ testID: 'avatar3d-viewer-loading' }),
    ).toHaveLength(0);

    ReactTestRenderer.act(() => {
      webView.props.onMessage({
        nativeEvent: {
          data: JSON.stringify({
            type: 'error',
            message: '3D形象页面加载失败',
          }),
        },
      });
    });
    expect(onError).toHaveBeenCalledWith('3D形象页面加载失败');

    ReactTestRenderer.act(() => renderer!.unmount());
  });

  it('defers a hidden viewer until activation and reloads a changed account token', () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <Avatar3DViewer active={false} modelId="model-1" token="token-1" />,
      );
    });
    const webView = renderer!.root.findByProps({ testID: 'avatar-webview' });
    ReactTestRenderer.act(() => {
      webView.props.onMessage({
        nativeEvent: { data: JSON.stringify({ type: 'ready' }) },
      });
    });
    const loadCalls = () =>
      webView.props.injectJavaScript.mock.calls.filter(([script]: [string]) =>
        script.includes('void viewer.load('),
      );
    expect(loadCalls()).toHaveLength(0);

    ReactTestRenderer.act(() => {
      renderer!.update(<Avatar3DViewer modelId="model-1" token="token-1" />);
    });
    expect(loadCalls()).toHaveLength(1);

    ReactTestRenderer.act(() => {
      renderer!.update(<Avatar3DViewer modelId="model-1" token="token-2" />);
    });
    expect(loadCalls()).toHaveLength(2);
    expect(loadCalls()[1][0]).toContain('"token":"token-2"');
    ReactTestRenderer.act(() => renderer!.unmount());
  });

  it('pauses in the background and resumes without reloading only when its tab is visible', () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <Avatar3DViewer modelId="model-1" token="token-1" />,
      );
    });
    const webView = renderer!.root.findByProps({ testID: 'avatar-webview' });
    ReactTestRenderer.act(() => {
      webView.props.onMessage({
        nativeEvent: { data: JSON.stringify({ type: 'ready' }) },
      });
      webView.props.onMessage({
        nativeEvent: { data: JSON.stringify({ type: 'loaded' }) },
      });
    });
    const loadCalls = () =>
      webView.props.injectJavaScript.mock.calls.filter(([script]: [string]) =>
        script.includes('void viewer.load('),
      );
    ReactTestRenderer.act(() => appStateChange('background'));
    expect(webView.props.injectJavaScript).toHaveBeenLastCalledWith(
      'window.MiaoxunAvatarViewer?.setActive(false); true;',
    );
    ReactTestRenderer.act(() => appStateChange('active'));
    expect(webView.props.injectJavaScript).toHaveBeenLastCalledWith(
      'window.MiaoxunAvatarViewer?.setActive(true); true;',
    );
    expect(loadCalls()).toHaveLength(1);

    ReactTestRenderer.act(() => {
      renderer!.update(
        <Avatar3DViewer active={false} modelId="model-1" token="token-1" />,
      );
      appStateChange('background');
    });
    ReactTestRenderer.act(() => appStateChange('active'));
    expect(webView.props.injectJavaScript).toHaveBeenLastCalledWith(
      'window.MiaoxunAvatarViewer?.setActive(false); true;',
    );
    expect(loadCalls()).toHaveLength(1);
    ReactTestRenderer.act(() => renderer!.unmount());
  });
});
