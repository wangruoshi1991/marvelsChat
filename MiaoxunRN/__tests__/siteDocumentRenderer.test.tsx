jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaProvider: View, SafeAreaView: View };
});
import React from 'react';
import { Image, Modal, StyleSheet, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { SiteDocument } from '../../shared/site-document';
import { SiteDocumentView } from '../src/models/siteDocument';
import { StationDiaryEntryDTO, StationMediaAssetDTO } from '../src/models/api';
import { SiteDocumentRenderer } from '../src/features/site-document/SiteDocumentRenderer';
import { StationMediaPreviewScreen } from '../src/features/station/StationMediaPreviewScreen';
import { palettes } from '../src/shared/theme';
import { WorkspaceButton } from '../src/shared/workspaceUi';

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const media: StationMediaAssetDTO = {
  id: id(101),
  userId: id(200),
  albumId: null,
  kind: 'image',
  status: 'uploaded',
  storageProvider: 'oss',
  storageKey: 'https://untrusted.invalid/never-request',
  originalFilename: 'image.jpg',
  mimeType: 'image/jpeg',
  caption: '绑定照片的完整说明',
};
const diary: StationDiaryEntryDTO = {
  id: id(102),
  userId: id(200),
  title: '绑定日记',
  body: '日记第一段。\n日记最后一段必须完整呈现。',
  mood: '平静',
  visibility: 'private',
  source: 'manual',
  createdAt: '2026-10-12T01:00:00Z',
};
const document = (): SiteDocument => ({
  schemaVersion: 2,
  documentId: id(1),
  revision: 1,
  visibility: 'private',
  language: 'zh',
  theme: 'clean',
  title: '页面完整标题',
  summary: '页面完整摘要。',
  sections: [
    {
      id: id(2),
      type: 'gallery',
      title: '第一部分：相册',
      subtitle: '相册副标题',
      body: '图片上方的完整正文。',
      assetIds: [media.id],
      diaryEntryIds: [],
      actions: [
        { kind: 'view-media', label: '查看绑定照片', targetId: media.id },
      ],
    },
    {
      id: id(3),
      type: 'about',
      title: '第二部分：关于',
      subtitle: '关于副标题',
      body: '介绍第一段。\n介绍结尾，不能缩短。',
      assetIds: [],
      diaryEntryIds: [],
      actions: [],
    },
    {
      id: id(4),
      type: 'hero',
      title: '第三部分：主视觉',
      subtitle: '主视觉副标题',
      body: '主视觉正文。',
      assetIds: [],
      diaryEntryIds: [],
      actions: [],
    },
    {
      id: id(5),
      type: 'diary',
      title: '第四部分：日记',
      subtitle: '日记副标题',
      body: '日记引言。',
      assetIds: [],
      diaryEntryIds: [diary.id],
      actions: [
        { kind: 'view-diary', label: '打开绑定日记', targetId: diary.id },
      ],
    },
    {
      id: id(6),
      type: 'contact',
      title: '第五部分：联系',
      subtitle: '',
      body: '联系说明。',
      assetIds: [],
      diaryEntryIds: [],
      actions: [],
    },
  ],
});
const view = (): SiteDocumentView => ({
  document: document(),
  documentHash: 'a'.repeat(64),
  resourcesHash: 'b'.repeat(64),
  mediaAssets: [media],
  diaryEntries: [diary],
});
let renderer: TestRenderer.ReactTestRenderer | undefined;
const render = (
  value: SiteDocumentView | null = view(),
  token = 'private-token',
) => (
  <SiteDocumentRenderer
    view={value}
    token={token}
    palette={palettes.light}
    language="zh"
  />
);
const labels = () =>
  renderer!.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat()
    .join(' ');
const button = (label: string) =>
  renderer!.root.findAll(
    node =>
      node.props.accessibilityRole === 'button' &&
      node.props.accessibilityLabel === label &&
      typeof node.props.onPress === 'function',
  )[0];
afterEach(() => {
  if (renderer) act(() => renderer!.unmount());
  renderer = undefined;
});

test('renders every section in authored order, all text, and only explicitly bound resources', () => {
  const value = view();
  value.diaryEntries.push({
    ...diary,
    id: id(999),
    title: '未绑定私人日记',
    body: '不应渲染的内容',
  });
  act(() => {
    renderer = TestRenderer.create(render(value));
  });
  const copy = labels();
  let previous = -1;
  value.document.sections.forEach(section => {
    const position = copy.indexOf(section.title);
    expect(position).toBeGreaterThan(previous);
    previous = position;
    expect(copy).toContain(section.subtitle);
    expect(copy).toContain(section.body);
  });
  expect(copy).toContain(value.document.title);
  expect(copy).toContain(value.document.summary);
  expect(copy).toContain(diary.body);
  expect(copy).not.toContain('未绑定私人日记');
  expect(
    renderer!.root
      .findAllByType(Text)
      .every(node => node.props.numberOfLines === undefined),
  ).toBe(true);
  expect(renderer!.root.findByType(Image).props.source).toEqual({
    uri: `http://127.0.0.1:4390/api/station/media-assets/${media.id}/file`,
    headers: { Authorization: 'Bearer private-token' },
  });
});

test('all supported themes select a distinct palette while keeping the same authored content', () => {
  const backgrounds: string[] = [];
  const value = view();
  (['clean', 'warm', 'gallery', 'portfolio'] as const).forEach(theme => {
    act(() => {
      const element = render({
        ...value,
        document: { ...value.document, theme },
      });
      if (renderer) renderer.update(element);
      else renderer = TestRenderer.create(element);
    });
    backgrounds.push(
      StyleSheet.flatten(
        renderer!.root.findByProps({ testID: 'site-document' }).props.style,
      ).backgroundColor,
    );
    expect(labels()).toContain(diary.body);
    expect(labels()).toContain(value.document.sections[1].body);
  });
  expect(new Set(backgrounds).size).toBe(4);
});

test.each([
  ['schema version', (value: SiteDocument) => ({ ...value, schemaVersion: 1 })],
  [
    'unknown section',
    (value: SiteDocument) => ({
      ...value,
      sections: [{ ...value.sections[0], type: 'script' }],
    }),
  ],
  [
    'unknown theme',
    (value: SiteDocument) => ({ ...value, theme: 'legacy-template' }),
  ],
  [
    'external action',
    (value: SiteDocument) => ({
      ...value,
      sections: [
        {
          ...value.sections[0],
          actions: [{ kind: 'open-url', label: '执行', targetId: media.id }],
        },
      ],
    }),
  ],
  [
    'unbound action',
    (value: SiteDocument) => ({
      ...value,
      sections: [
        {
          ...value.sections[0],
          actions: [{ kind: 'view-media', label: '越界', targetId: id(999) }],
        },
      ],
    }),
  ],
  [
    'HTML',
    (value: SiteDocument) => ({ ...value, title: '<script>run()</script>' }),
  ],
])(
  'rejects %s without rendering a fallback page or executable actions',
  (_name, change) => {
    const value = view();
    act(() => {
      renderer = TestRenderer.create(
        render({ ...value, document: change(value.document) as SiteDocument }),
      );
    });
    expect(labels()).toContain('无法显示此页面结构');
    expect(labels()).not.toContain('第一部分：相册');
    expect(renderer!.root.findAllByType(Image)).toHaveLength(0);
    expect(renderer!.root.findAllByType(Modal)).toHaveLength(0);
  },
);

test('controlled media and diary actions open their bound local details, then close', () => {
  act(() => {
    renderer = TestRenderer.create(render());
  });
  act(() => button('查看绑定照片').props.onPress());
  const preview = renderer!.root.findByType(StationMediaPreviewScreen);
  expect(preview.props.asset.id).toBe(media.id);
  expect(preview.props.token).toBe('private-token');
  act(() => preview.props.onBack());
  expect(renderer!.root.findAllByType(Modal)).toHaveLength(0);
  act(() => button('打开绑定日记').props.onPress());
  const modal = renderer!.root.findByType(Modal);
  expect(
    modal
      .findAllByType(Text)
      .map(node => node.props.children)
      .join(' '),
  ).toContain(diary.body);
  act(() => modal.props.onRequestClose());
  expect(renderer!.root.findAllByType(Modal)).toHaveLength(0);
});

test('unresolved link, message and follow intentions display exact selectable targets without activation handlers', () => {
  const value = view();
  value.document.sections = [
    {
      ...value.document.sections[4],
      actions: [
        {
          kind: 'interaction-intent',
          intent: 'open-link',
          label: '外部链接',
          target: { kind: 'unresolved', text: ' javascript:untrusted()\n ' },
        },
        {
          kind: 'interaction-intent',
          intent: 'compose-message',
          label: '发消息',
          target: { kind: 'unresolved', text: ' 用户指定的收件人 ' },
        },
        {
          kind: 'interaction-intent',
          intent: 'follow-user',
          label: '关注',
          target: { kind: 'unresolved', text: '' },
        },
      ],
    },
  ];
  value.mediaAssets = [];
  value.diaryEntries = [];
  const original = JSON.stringify(value);
  act(() => {
    renderer = TestRenderer.create(render(value));
  });
  const actions = value.document.sections[0].actions;
  actions.forEach(action => {
    const component = renderer!.root
      .findAllByType(WorkspaceButton)
      .find(node => node.props.label === action.label);
    expect(component?.props.disabled).toBe(true);
    expect(component?.props.onPress).toBeUndefined();
    const rendered = renderer!.root.findAll(
      node =>
        node.props.accessibilityRole === 'button' &&
        node.props.accessibilityLabel === action.label,
    );
    expect(rendered.length).toBeGreaterThan(0);
    rendered.forEach(node => {
      expect(node.props.accessibilityState.disabled).toBe(true);
      expect(node.props.accessibilityHint).toBe('尚未接通');
      expect(node.props.onPress).toBeUndefined();
    });
    if (action.kind === 'interaction-intent') {
      const target = renderer!.root
        .findAllByType(Text)
        .find(node => node.props.children === action.target.text);
      expect(target?.props.selectable).toBe(true);
      expect(target?.props.numberOfLines).toBeUndefined();
    }
  });
  expect(renderer!.root.findAllByType(Image)).toHaveLength(0);
  expect(renderer!.root.findAllByType(Modal)).toHaveLength(0);
  expect(labels().match(/尚未接通/g)).toHaveLength(3);
  expect(JSON.stringify(value)).toBe(original);
  act(() =>
    renderer!.update(
      <SiteDocumentRenderer
        view={value}
        token="private-token"
        palette={palettes.light}
        language="en"
      />,
    ),
  );
  expect(labels().match(/Not connected/g)).toHaveLength(3);
});

test('authored duplicate intentions remain visible beside a working bound resource action', () => {
  const value = view();
  const intent = {
    kind: 'interaction-intent' as const,
    intent: 'open-link' as const,
    label: '保留链接',
    target: {
      kind: 'unresolved' as const,
      text: ' https://example.test/a?q=1 ',
    },
  };
  value.document.sections[0].actions.push(intent, { ...intent });
  act(() => {
    renderer = TestRenderer.create(render(value));
  });
  expect(labels().match(/保留链接/g)).toHaveLength(2);
  expect(labels().match(/尚未接通/g)).toHaveLength(2);
  expect(
    renderer!.root.findAllByProps({ testID: `site-intent-${id(2)}-1` }).length,
  ).toBeGreaterThan(0);
  expect(
    renderer!.root.findAllByProps({ testID: `site-intent-${id(2)}-2` }).length,
  ).toBeGreaterThan(0);
  act(() => button('查看绑定照片').props.onPress());
  expect(
    renderer!.root.findByType(StationMediaPreviewScreen).props.asset.id,
  ).toBe(media.id);
});

test('missing or removed references have explicit states and cannot open another resource', () => {
  const value = view();
  value.mediaAssets = [{ ...media, status: 'deleted' }];
  value.diaryEntries = [];
  act(() => {
    renderer = TestRenderer.create(render(value));
  });
  expect(labels()).toContain('引用素材不可用');
  expect(labels()).toContain('引用日记不可用');
  expect(button('查看绑定照片').props.disabled).toBe(true);
  expect(button('打开绑定日记').props.disabled).toBe(true);
  act(() => {
    button('查看绑定照片').props.onPress();
    button('打开绑定日记').props.onPress();
  });
  expect(renderer!.root.findAllByType(Modal)).toHaveLength(0);
});

test('bound video opens the existing private player and a removed resource disables its action', () => {
  const value = view();
  value.mediaAssets = [{ ...media, kind: 'video', mimeType: 'video/mp4' }];
  act(() => {
    renderer = TestRenderer.create(render(value));
  });
  expect(labels()).toContain('播放视频');
  expect(renderer!.root.findAllByType(Image)).toHaveLength(0);
  act(() => button('查看绑定照片').props.onPress());
  const preview = renderer!.root.findByType(StationMediaPreviewScreen);
  expect(preview.props.asset.kind).toBe('video');
  const player = renderer!.root.findByProps({ testID: 'native-video' });
  expect(player.props.source).toEqual({
    uri: `http://127.0.0.1:4390/api/station/media-assets/${media.id}/file`,
    headers: { Authorization: 'Bearer private-token' },
  });
  act(() => preview.props.onUnavailable(media.id));
  expect(labels()).toContain('引用素材不可用');
  expect(renderer!.root.findAllByType(StationMediaPreviewScreen)).toHaveLength(
    0,
  );
  act(() => button('返回页面').props.onPress());
  expect(button('查看绑定照片').props.disabled).toBe(true);
});

test('changing auth or document evidence clears a previously opened detail', () => {
  const value = view();
  act(() => {
    renderer = TestRenderer.create(render(value));
  });
  act(() => button('打开绑定日记').props.onPress());
  expect(renderer!.root.findAllByType(Modal)).toHaveLength(1);
  act(() => renderer!.update(render(value, 'new-session')));
  expect(renderer!.root.findAllByType(Modal)).toHaveLength(0);
  act(() => button('打开绑定日记').props.onPress());
  act(() =>
    renderer!.update(
      render({ ...value, resourcesHash: 'c'.repeat(64) }, 'new-session'),
    ),
  );
  expect(renderer!.root.findAllByType(Modal)).toHaveLength(0);
});

test('image failures expose retry and ignore callbacks from the failed load after retry', () => {
  act(() => {
    renderer = TestRenderer.create(render());
  });
  const stale = renderer!.root.findByType(Image).props;
  act(() => stale.onError());
  expect(labels()).toContain('图片加载失败');
  act(() => button('重新加载图片').props.onPress());
  act(() => {
    stale.onLoad();
    stale.onError();
  });
  expect(labels()).not.toContain('图片加载失败');
  expect(renderer!.root.findByType(Image).props.source.cache).toBe('reload');
  expect(renderer!.root.findByType(Image).props.source.uri).not.toContain(
    'untrusted',
  );
});

test('empty and signed-out views remain explicit and never request private media', () => {
  act(() => {
    renderer = TestRenderer.create(render(null));
  });
  expect(labels()).toContain('暂无结构页面');
  act(() => renderer!.update(render(view(), '')));
  expect(labels()).toContain('登录后查看私有页面');
  expect(renderer!.root.findAllByType(Image)).toHaveLength(0);
});
