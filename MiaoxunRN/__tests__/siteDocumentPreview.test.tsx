jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => (
      <View>{children}</View>
    ),
    SafeAreaView: (props: React.ComponentProps<typeof View>) => (
      <View {...props} />
    ),
  };
});
jest.mock('../src/services/api/http', () => ({
  ...jest.requireActual('../src/services/api/http'),
  request: jest.fn(),
}));

import React from 'react';
import { AppState, AppStateStatus, Image, Modal, Text } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import TestRenderer, { act } from 'react-test-renderer';
import { SiteDocumentPreview } from '../src/features/site-document/SiteDocumentPreview';
import { SiteDocumentRenderer } from '../src/features/site-document/SiteDocumentRenderer';
import { StationMediaPreviewScreen } from '../src/features/station/StationMediaPreviewScreen';
import { WorkspaceButton } from '../src/shared/workspaceUi';
import { SiteDocumentView } from '../src/models/siteDocument';
import {
  clearAIContractSession,
  setAIContractSession,
} from '../src/services/aiContract';
import { MiaoxunApiError, request } from '../src/services/api/http';
import { palettes } from '../src/shared/theme';
import { Header } from '../src/shared/ui';

const mockedRequest = jest.mocked(request);
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const view = (
  documentId = id(1),
  title = '本次完整页面',
): SiteDocumentView => ({
  document: {
    schemaVersion: 2,
    documentId,
    revision: 1,
    visibility: 'private',
    language: 'zh',
    theme: 'clean',
    title,
    summary: '完整摘要',
    sections: [
      {
        id: id(2),
        type: 'about',
        title: '完整模块',
        subtitle: '',
        body: '仅单元测试夹具中的完整内容',
        assetIds: [],
        diaryEntryIds: [],
        actions: [],
      },
    ],
  },
  documentHash: 'a'.repeat(64),
  resourcesHash: 'b'.repeat(64),
  mediaAssets: [],
  diaryEntries: [],
});
const expected = {
  documentHash: 'a'.repeat(64),
  resourcesHash: 'b'.repeat(64),
};
const mediaView = (documentId = id(1)): SiteDocumentView => {
  const value = view(documentId);
  value.mediaAssets = [101, 102].map(n => ({
    id: id(n),
    userId: id(200),
    albumId: null,
    kind: 'image',
    status: 'uploaded',
    storageProvider: 'oss',
    storageKey: '',
    originalFilename: `image-${n}.jpg`,
    mimeType: 'image/jpeg',
    caption: `引用图片 ${n}`,
  }));
  value.document.sections[0].assetIds = value.mediaAssets.map(
    asset => asset.id,
  );
  return value;
};
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
};
type Props = React.ComponentProps<typeof SiteDocumentPreview>;
let renderer: TestRenderer.ReactTestRenderer | undefined;
let props: Props;
const labels = () =>
  renderer!.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat()
    .join(' ');
const mount = async (changes: Partial<Props> = {}) => {
  props = { ...props, ...changes };
  await act(async () => {
    renderer = TestRenderer.create(<SiteDocumentPreview {...props} />);
  });
};
const update = async (changes: Partial<Props>) => {
  props = { ...props, ...changes };
  await act(async () => {
    renderer!.update(<SiteDocumentPreview {...props} />);
  });
};

beforeEach(() => {
  mockedRequest.mockReset();
  setAIContractSession('owner', { aiTasks: 1, siteDocuments: 2 });
  props = {
    draftId: id(1),
    token: 'owner',
    active: true,
    palette: palettes.light,
    language: 'zh',
    expected,
    onReviewed: jest.fn(),
    onInvalidated: jest.fn(),
    onClose: jest.fn(),
  };
});
afterEach(() => {
  if (renderer) act(() => renderer!.unmount());
  renderer = undefined;
  clearAIContractSession();
  jest.restoreAllMocks();
});

test.each([true, false])(
  'a preview keeps its title and close control in its own full-screen safe area (current approval: %s)',
  async currentApproval => {
    mockedRequest.mockResolvedValue(view());
    await mount({ expected: currentApproval ? expected : undefined });
    const modal = renderer!.root.findByType(Modal);
    expect(modal.props.presentationStyle).toBe('fullScreen');
    const safeArea = modal
      .findByType(SafeAreaProvider)
      .findByType(SafeAreaView);
    const header = safeArea.findByType(Header);
    expect(header.props.title).toBe('页面预览 · 仅自己可见');
    const closeButton = header.findAll(
      node =>
        node.props.accessibilityLabel === '关闭页面预览' &&
        typeof node.props.onPress === 'function',
    )[0];
    expect(closeButton.props.accessibilityRole).toBe('button');
    expect(closeButton.props.accessibilityLabel).toBe('关闭页面预览');
    expect(safeArea.findByType(SiteDocumentRenderer).props.view).toEqual(
      view(),
    );
    act(() => closeButton.props.onPress());
    expect(props.onClose).toHaveBeenCalledTimes(1);
    expect(props.onReviewed).toHaveBeenCalledTimes(currentApproval ? 1 : 0);
  },
);

test('actual app background clears preview content and late reads, then foreground checks access again', async () => {
  let appState!: (state: AppStateStatus) => void;
  const remove = jest.fn();
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, listener) => {
      appState = listener;
      return { remove };
    });
  mockedRequest.mockResolvedValueOnce(view());
  await mount({ expected: undefined });
  expect(renderer!.root.findAllByType(SiteDocumentRenderer)).toHaveLength(1);
  await act(async () => appState('background'));
  expect(renderer!.root.findByType(Modal).props.visible).toBe(false);
  expect(renderer!.root.findAllByType(SiteDocumentRenderer)).toHaveLength(0);
  expect(labels()).not.toContain(view().document.title);
  const late = deferred<unknown>();
  mockedRequest.mockReturnValueOnce(late.promise);
  await act(async () => appState('active'));
  expect(renderer!.root.findAllByType(SiteDocumentRenderer)).toHaveLength(0);
  await act(async () => appState('inactive'));
  await act(async () => late.resolve(view()));
  expect(renderer!.root.findByType(Modal).props.visible).toBe(false);
  expect(renderer!.root.findAllByType(SiteDocumentRenderer)).toHaveLength(0);
  mockedRequest.mockRejectedValueOnce(
    new MiaoxunApiError('协作 Agent 授权已撤回。', { status: 403 }),
  );
  await act(async () => appState('active'));
  expect(mockedRequest).toHaveBeenCalledTimes(3);
  expect(renderer!.root.findAllByType(SiteDocumentRenderer)).toHaveLength(0);
  expect(labels()).toContain('协作 Agent 授权已撤回。');
  await act(async () => renderer!.unmount());
  renderer = undefined;
  expect(remove).toHaveBeenCalledTimes(1);
});

test('only the loaded, strictly valid document and matching resource digest mark a full-screen preview reviewed', async () => {
  const pending = deferred<unknown>();
  mockedRequest.mockReturnValue(pending.promise);
  await mount();
  expect(props.onReviewed).not.toHaveBeenCalled();
  expect(renderer!.root.findAllByType(SiteDocumentRenderer)).toHaveLength(0);
  expect(labels()).toContain('正在读取页面及引用内容');
  expect(renderer!.root.findByType(Modal).props.visible).toBe(true);
  const value = view();
  await act(async () => {
    pending.resolve(value);
  });
  expect(props.onReviewed).toHaveBeenCalledTimes(1);
  expect(renderer!.root.findByType(SiteDocumentRenderer).props.view).toEqual(
    value,
  );
  expect(labels()).toContain(value.document.title);
  expect(labels()).toContain(value.document.sections[0].body);
  act(() => renderer!.root.findByType(Modal).props.onRequestClose());
  expect(props.onClose).toHaveBeenCalledTimes(1);
  expect(mockedRequest).toHaveBeenCalledTimes(1);
});

test.each(['documentHash', 'resourcesHash'] as const)(
  'a mismatched %s shows an explicit error and never authorizes confirmation',
  async key => {
    mockedRequest.mockResolvedValue({ ...view(), [key]: 'c'.repeat(64) });
    await mount();
    expect(props.onReviewed).not.toHaveBeenCalled();
    expect(renderer!.root.findAllByType(SiteDocumentRenderer)).toHaveLength(0);
    expect(labels()).toContain('页面或引用内容已变化');
  },
);

test('invalid schema data is rejected by the real API validator before any review callback', async () => {
  const value = view();
  mockedRequest.mockResolvedValue({
    ...value,
    document: { ...value.document, schemaVersion: 1 },
  });
  await mount();
  expect(props.onReviewed).not.toHaveBeenCalled();
  expect(renderer!.root.findAllByType(SiteDocumentRenderer)).toHaveLength(0);
  expect(labels()).toContain('unsupported');
});

test('a failed load stays unreviewed; an explicit retry must load and validate the result again', async () => {
  const retry = deferred<unknown>();
  mockedRequest
    .mockRejectedValueOnce(new Error('测试网络错误'))
    .mockReturnValueOnce(retry.promise);
  await mount();
  expect(labels()).toContain('测试网络错误');
  expect(props.onReviewed).not.toHaveBeenCalled();
  const button = renderer!.root.findAll(
    node =>
      node.props.accessibilityLabel === '重新读取页面' &&
      typeof node.props.onPress === 'function',
  )[0];
  await act(async () => {
    button.props.onPress();
  });
  expect(props.onReviewed).not.toHaveBeenCalled();
  expect(mockedRequest).toHaveBeenCalledTimes(2);
  await act(async () => {
    retry.resolve(view());
  });
  expect(props.onReviewed).toHaveBeenCalledTimes(1);
  expect(labels()).toContain('本次完整页面');
});

test.each([
  ['token', false],
  ['token', true],
  ['draft', false],
  ['draft', true],
] as const)(
  'a %s switch ignores the old response (old resolves last: %s)',
  async (change, oldResolvesLast) => {
    const oldRequest = deferred<unknown>();
    const newRequest = deferred<unknown>();
    const oldReview = props.onReviewed;
    const newReview = jest.fn();
    mockedRequest
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(newRequest.promise);
    await mount();
    const nextDraftId = change === 'draft' ? id(3) : id(1);
    if (change === 'token')
      setAIContractSession('other', { aiTasks: 1, siteDocuments: 2 });
    await update({
      token: change === 'token' ? 'other' : 'owner',
      draftId: nextDraftId,
      onReviewed: newReview,
    });
    if (!oldResolvesLast) {
      await act(async () => {
        oldRequest.resolve(view(id(1), '旧账号或草稿的私密页面'));
      });
      expect(newReview).not.toHaveBeenCalled();
      expect(renderer!.root.findAllByType(SiteDocumentRenderer)).toHaveLength(
        0,
      );
      expect(labels()).not.toContain('旧账号或草稿的私密页面');
    }
    await act(async () => {
      newRequest.resolve(view(nextDraftId, '新的当前页面'));
    });
    if (oldResolvesLast) {
      await act(async () => {
        oldRequest.resolve(view(id(1), '旧账号或草稿的私密页面'));
      });
    }
    expect(oldReview).not.toHaveBeenCalled();
    expect(newReview).toHaveBeenCalledTimes(1);
    expect(labels()).toContain('新的当前页面');
    expect(labels()).not.toContain('旧账号或草稿的私密页面');
  },
);

test('a changed approval digest invalidates the pending preview and requires a fresh matching result', async () => {
  const oldRequest = deferred<unknown>();
  const newRequest = deferred<unknown>();
  mockedRequest
    .mockReturnValueOnce(oldRequest.promise)
    .mockReturnValueOnce(newRequest.promise);
  await mount();
  const nextExpected = { ...expected, documentHash: 'c'.repeat(64) };
  await update({ expected: nextExpected });
  await act(async () => {
    oldRequest.resolve(view());
  });
  expect(props.onReviewed).not.toHaveBeenCalled();
  expect(renderer!.root.findAllByType(SiteDocumentRenderer)).toHaveLength(0);
  await act(async () => {
    newRequest.resolve({ ...view(), ...nextExpected });
  });
  expect(props.onReviewed).toHaveBeenCalledTimes(1);
});

test('inactive previews do not load and hide or discard responses until explicitly reopened', async () => {
  const oldRequest = deferred<unknown>();
  const reopenedRequest = deferred<unknown>();
  mockedRequest
    .mockReturnValueOnce(oldRequest.promise)
    .mockReturnValueOnce(reopenedRequest.promise);
  await mount({ active: false });
  expect(mockedRequest).not.toHaveBeenCalled();
  expect(renderer!.root.findByType(Modal).props.visible).toBe(false);
  await update({ active: true });
  expect(mockedRequest).toHaveBeenCalledTimes(1);
  await update({ active: false });
  await act(async () => {
    oldRequest.resolve(view());
  });
  expect(props.onReviewed).not.toHaveBeenCalled();
  expect(renderer!.root.findAllByType(SiteDocumentRenderer)).toHaveLength(0);
  await update({ active: true });
  expect(mockedRequest).toHaveBeenCalledTimes(2);
  expect(props.onReviewed).not.toHaveBeenCalled();
  await act(async () => {
    reopenedRequest.resolve(view());
  });
  expect(props.onReviewed).toHaveBeenCalledTimes(1);
});

test('unmounting a pending preview prevents its completion from marking a review', async () => {
  const pending = deferred<unknown>();
  mockedRequest.mockReturnValue(pending.promise);
  await mount();
  act(() => renderer!.unmount());
  renderer = undefined;
  await act(async () => {
    pending.resolve(view());
  });
  expect(props.onReviewed).not.toHaveBeenCalled();
});

test('viewing a saved page without an approval never marks a confirmation review', async () => {
  mockedRequest.mockResolvedValue(view());
  await mount({ expected: undefined });
  expect(labels()).toContain('本次完整页面');
  expect(renderer!.root.findAllByType(SiteDocumentRenderer)).toHaveLength(1);
  expect(props.onReviewed).not.toHaveBeenCalled();
});

test.each(['reopen', 'language'] as const)(
  'a previously reviewed preview loses its review before %s reload and stays unreviewed when the reload fails',
  async change => {
    const reloading = deferred<unknown>();
    let reviewed = false;
    const onReviewed = jest.fn(() => {
      reviewed = true;
    });
    const onInvalidated = jest.fn(() => {
      reviewed = false;
    });
    mockedRequest
      .mockResolvedValueOnce(view())
      .mockReturnValueOnce(reloading.promise);
    await mount({ onReviewed, onInvalidated });
    expect(reviewed).toBe(true);
    expect(onReviewed).toHaveBeenCalledTimes(1);
    const previousInvalidations = onInvalidated.mock.calls.length;
    if (change === 'reopen') {
      await update({ active: false });
      expect(reviewed).toBe(false);
      await update({ active: true });
    } else {
      await update({ language: 'en' });
    }
    expect(onInvalidated.mock.calls.length).toBeGreaterThan(
      previousInvalidations,
    );
    expect(reviewed).toBe(false);
    expect(mockedRequest).toHaveBeenCalledTimes(2);
    expect(renderer!.root.findAllByType(SiteDocumentRenderer)).toHaveLength(0);
    await act(async () => {
      reloading.reject(new Error('Reload failed'));
    });
    expect(labels()).toContain('Reload failed');
    expect(reviewed).toBe(false);
    expect(onReviewed).toHaveBeenCalledTimes(1);
  },
);

test('all rendered images must load; failures invalidate review and only a fresh retry can restore it', async () => {
  let reviewed = false;
  mockedRequest.mockResolvedValue(mediaView());
  await mount({
    onReviewed: jest.fn(() => {
      reviewed = true;
    }),
    onInvalidated: jest.fn(() => {
      reviewed = false;
    }),
  });
  expect(reviewed).toBe(false);
  const [first, second] = renderer!.root
    .findAllByType(Image)
    .map(node => node.props);
  act(() => first.onLoad());
  expect(reviewed).toBe(false);
  act(() => second.onLoad());
  expect(reviewed).toBe(true);
  act(() => second.onError());
  expect(reviewed).toBe(false);
  expect(labels()).toContain('图片加载失败');
  act(() => second.onLoad());
  expect(reviewed).toBe(false);
  act(() =>
    renderer!.root
      .findAllByType(WorkspaceButton)
      .find(node => node.props.label === '重新加载图片')!
      .props.onPress(),
  );
  act(() => {
    second.onLoad();
    second.onError();
  });
  expect(reviewed).toBe(false);
  const retry = renderer!.root.findAllByType(Image)[1].props;
  expect(retry.source.cache).toBe('reload');
  act(() => retry.onLoad());
  expect(reviewed).toBe(true);
  expect(props.onReviewed).toHaveBeenCalledTimes(2);
});

test('a repeated image must load in every rendered section before review is complete', async () => {
  const value = mediaView();
  value.mediaAssets = [value.mediaAssets[0]];
  value.document.sections[0].assetIds = [id(101)];
  value.document.sections.push({ ...value.document.sections[0], id: id(3) });
  mockedRequest.mockResolvedValue(value);
  await mount();
  const images = renderer!.root.findAllByType(Image);
  act(() => images[0].props.onLoad());
  expect(props.onReviewed).not.toHaveBeenCalled();
  act(() => images[1].props.onLoad());
  expect(props.onReviewed).toHaveBeenCalledTimes(1);
});

test.each(['token', 'draft', 'approval', 'reopen', 'language'] as const)(
  '%s changes require fresh image loads and ignore image events from the previous preview',
  async change => {
    mockedRequest.mockResolvedValue(mediaView());
    let reviewed = false;
    await mount({
      onReviewed: jest.fn(() => {
        reviewed = true;
      }),
      onInvalidated: jest.fn(() => {
        reviewed = false;
      }),
    });
    const oldImages = renderer!.root
      .findAllByType(Image)
      .map(node => node.props);
    act(() => oldImages.forEach(image => image.onLoad()));
    expect(reviewed).toBe(true);
    const next = mediaView(change === 'draft' ? id(3) : id(1));
    if (change === 'approval') next.resourcesHash = 'c'.repeat(64);
    mockedRequest.mockResolvedValue(next);
    if (change === 'token') {
      setAIContractSession('other', { aiTasks: 1, siteDocuments: 2 });
      await update({ token: 'other' });
    } else if (change === 'draft') await update({ draftId: id(3) });
    else if (change === 'language') await update({ language: 'en' });
    else if (change === 'approval')
      await update({
        expected: { ...expected, resourcesHash: next.resourcesHash },
      });
    else {
      await update({ active: false });
      await update({ active: true });
    }
    act(() => oldImages.forEach(image => image.onLoad()));
    expect(reviewed).toBe(false);
    const currentImages = renderer!.root
      .findAllByType(Image)
      .map(node => node.props);
    act(() => currentImages.forEach(image => image.onLoad()));
    expect(reviewed).toBe(true);
    act(() => oldImages.forEach(image => image.onError()));
    expect(reviewed).toBe(true);
    expect(props.onReviewed).toHaveBeenCalledTimes(2);
  },
);

test.each([false, true])(
  'closing blocks late image events while retaining an already completed review: %s',
  async complete => {
    let reviewed = false;
    mockedRequest.mockResolvedValue(mediaView());
    await mount({
      onReviewed: jest.fn(() => {
        reviewed = true;
      }),
      onInvalidated: jest.fn(() => {
        reviewed = false;
      }),
    });
    const images = renderer!.root.findAllByType(Image).map(node => node.props);
    if (complete) act(() => images.forEach(image => image.onLoad()));
    act(() => renderer!.root.findByType(Modal).props.onRequestClose());
    act(() =>
      images.forEach(image => {
        image.onLoad();
        image.onError();
      }),
    );
    expect(reviewed).toBe(complete);
    expect(props.onReviewed).toHaveBeenCalledTimes(complete ? 1 : 0);
    expect(props.onClose).toHaveBeenCalledTimes(1);
  },
);

test('unmounted image callbacks cannot complete or invalidate a review', async () => {
  mockedRequest.mockResolvedValue(mediaView());
  await mount();
  const images = renderer!.root.findAllByType(Image).map(node => node.props);
  act(() => renderer!.unmount());
  renderer = undefined;
  const invalidations = jest.mocked(props.onInvalidated!).mock.calls.length;
  act(() =>
    images.forEach(image => {
      image.onLoad();
      image.onError();
    }),
  );
  expect(props.onReviewed).not.toHaveBeenCalled();
  expect(props.onInvalidated).toHaveBeenCalledTimes(invalidations);
});

test('an image failure revokes review even when the preview closes before React renders the error', async () => {
  let reviewed = false;
  mockedRequest.mockResolvedValue(mediaView());
  await mount({
    onReviewed: jest.fn(() => {
      reviewed = true;
    }),
    onInvalidated: jest.fn(() => {
      reviewed = false;
    }),
  });
  const images = renderer!.root.findAllByType(Image).map(node => node.props);
  act(() => images.forEach(image => image.onLoad()));
  expect(reviewed).toBe(true);
  act(() => {
    images[0].onError();
    renderer!.root.findByType(Modal).props.onRequestClose();
  });
  expect(reviewed).toBe(false);
});

test('videos keep explicit playback, but an unavailable resource revokes a completed review', async () => {
  let reviewed = false;
  const value = mediaView();
  value.mediaAssets[1] = {
    ...value.mediaAssets[1],
    kind: 'video',
    mimeType: 'video/mp4',
  };
  value.document.sections[0].actions = [
    { kind: 'view-media', targetId: id(102), label: '查看视频' },
  ];
  mockedRequest.mockResolvedValue(value);
  await mount({
    onReviewed: jest.fn(() => {
      reviewed = true;
    }),
    onInvalidated: jest.fn(() => {
      reviewed = false;
    }),
  });
  expect(
    renderer!.root.findAllByProps({ testID: 'native-video' }),
  ).toHaveLength(0);
  const image = renderer!.root.findByType(Image).props;
  act(() => image.onLoad());
  expect(reviewed).toBe(true);
  act(() =>
    renderer!.root
      .findAllByType(WorkspaceButton)
      .find(node => node.props.label === '查看视频')!
      .props.onPress(),
  );
  const preview = renderer!.root.findByType(StationMediaPreviewScreen);
  act(() => preview.props.onUnavailable(id(102)));
  expect(reviewed).toBe(false);
  expect(labels()).toContain('引用素材不可用');
  act(() => image.onLoad());
  expect(reviewed).toBe(false);
});
