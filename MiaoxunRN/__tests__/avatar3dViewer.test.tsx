import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

import {
  Avatar3DViewer,
  buildAvatar3DViewerScript,
  isAvatar3DViewerDocumentUrl,
} from '../src/features/station/Avatar3DViewer';

describe('Avatar3DViewer', () => {
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

  it('starts loading after the bundled document finishes and forwards viewer errors', () => {
    const onError = jest.fn();
    let renderer: ReactTestRenderer.ReactTestRenderer;

    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <Avatar3DViewer
          modelId="model-1"
          onError={onError}
          thumbnailAvailable
          token="private-token"
        />,
      );
    });

    const webView = renderer!.root.findByProps({ testID: 'avatar-webview' });
    expect(webView.props.source).toBeDefined();
    expect(webView.props.cacheEnabled).toBe(true);
    expect(webView.props.originWhitelist).toEqual([
      'file://*',
      'http://*',
      'https://*',
    ]);
    expect(webView.props.injectJavaScript).not.toHaveBeenCalled();
    expect(
      renderer!.root.findByProps({ testID: 'avatar3d-viewer-loading' }),
    ).toBeDefined();
    expect(
      renderer!.root.findByProps({ accessibilityLabel: '3D形象加载预览' }).props
        .source,
    ).toEqual(
      expect.objectContaining({
        headers: { Authorization: 'Bearer private-token' },
        uri: expect.stringContaining(
          '/api/avatar-3d/app/models/model-1/thumbnail',
        ),
      }),
    );

    ReactTestRenderer.act(() => {
      webView.props.onMessage({
        nativeEvent: { data: JSON.stringify({ type: 'ready' }) },
      });
    });
    expect(webView.props.injectJavaScript).toHaveBeenCalledWith(
      'window.MiaoxunAvatarViewer?.setActive(true); true;',
    );

    ReactTestRenderer.act(() => {
      renderer!.update(
        <Avatar3DViewer
          active={false}
          modelId="model-1"
          onError={onError}
          thumbnailAvailable
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
    expect(webView.props.injectJavaScript).not.toHaveBeenCalledWith(
      expect.stringContaining('/api/avatar-3d/app/models/model-1/file'),
    );

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
});
