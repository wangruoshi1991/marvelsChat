import React from 'react';
import { AppState, AppStateStatus, NativeModules } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { SecondFloorFiles } from '../src/features/second-floor/SecondFloorFiles';
import { palettes } from '../src/shared/theme';
import { emptyStationContent } from '../src/features/session/sessionDefaults';
import { WorkspaceButton } from '../src/shared/workspaceUi';
jest.mock('../src/features/station/StationOutcomesPanel', () => ({
  StationOutcomesPanel: () => null,
}));
const reference = {
  kind: 'station-file' as const,
  id: 'file-1',
  version: 'v1',
  title: 'notes.txt',
};
const file = {
  id: 'file-1',
  originalFilename: 'notes.txt',
  mimeType: 'text/plain',
  storageProvider: 'inline',
  sourceKind: 'uploaded_file',
  status: 'processed',
  reference,
};
let renderer: TestRenderer.ReactTestRenderer;
beforeEach(() => {
  AppState.currentState = 'active';
});
afterEach(() => {
  if (renderer) act(() => renderer.unmount());
  jest.restoreAllMocks();
});
const button = (label: string) =>
  renderer.root
    .findAllByType(WorkspaceButton)
    .find(node => node.props.label === label)!;
const setup = async (read: jest.Mock, open = jest.fn()) => {
  const session = {
    token: 'owner',
    stationContent: { ...emptyStationContent, fileAssets: [file] },
    stationFileAsset: read,
  } as any;
  const props = {
    palette: palettes.light,
    language: 'zh' as const,
    session,
    onOpenWorkspace: jest.fn(),
    onOpenFileAgent: open,
  };
  await act(async () => {
    renderer = TestRenderer.create(<SecondFloorFiles {...props} />);
  });
  await act(async () => {
    const row = renderer.root.findAll(
      node =>
        node.props.accessibilityLabel === '查看notes.txt' &&
        typeof node.props.onPress === 'function',
    )[0];
    row.props.onPress();
  });
  return props;
};
test('reads authenticated full text before exposing the Agent action and rechecks latest reference on click', async () => {
  const read = jest
    .fn()
    .mockResolvedValueOnce({ ...file, content: 'literal full content' })
    .mockResolvedValueOnce({
      ...file,
      content: 'literal full content',
      reference: { ...reference, version: 'v2' },
    });
  const open = jest.fn();
  await setup(read, open);
  expect(open).not.toHaveBeenCalled();
  await act(async () => {
    await button('交给文件Agent').props.onPress();
  });
  expect(read).toHaveBeenCalledTimes(2);
  expect(open).toHaveBeenCalledWith({ ...reference, version: 'v2' });
});
test('registered preview without full content never exposes an authenticated file reference', async () => {
  await setup(
    jest.fn().mockResolvedValue({ ...file, content: null, reference: null }),
  );
  expect(button('交给文件Agent')).toBeUndefined();
});
test('leaving and returning while a detail read is pending cannot open the Agent with a late result', async () => {
  let finish!: (value: any) => void;
  const read = jest
    .fn()
    .mockResolvedValueOnce({ ...file, content: 'full' })
    .mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finish = resolve;
        }),
    );
  const open = jest.fn();
  const props = await setup(read, open);
  let pending!: Promise<void>;
  act(() => {
    pending = button('交给文件Agent').props.onPress();
  });
  act(() => {
    renderer.update(<SecondFloorFiles {...props} active={false} />);
  });
  act(() => {
    renderer.update(<SecondFloorFiles {...props} active />);
  });
  await act(async () => {
    finish({ ...file, content: 'full' });
    await pending;
  });
  expect(open).not.toHaveBeenCalled();
});

test.each([
  ['background', false],
  ['background', true],
  ['inactive', false],
  ['inactive', true],
] as const)(
  'a pending Agent read is invalidated by %s (return before response: %s) and a new action can succeed',
  async (state, returnBeforeResponse) => {
    const listeners = new Set<(next: AppStateStatus) => void>();
    const remove = jest.fn();
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_event, listener) => {
        listeners.add(listener);
        return {
          remove: () => {
            remove();
            listeners.delete(listener);
          },
        };
      });
    let finish!: (value: any) => void;
    const read = jest
      .fn()
      .mockResolvedValueOnce({ ...file, content: 'full' })
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            finish = resolve;
          }),
      )
      .mockResolvedValue({
        ...file,
        content: 'new full content',
        reference: { ...reference, version: 'v2' },
      });
    const open = jest.fn();
    const props = await setup(read, open);
    const onBusyChange = jest.fn();
    act(() => {
      renderer.update(
        <SecondFloorFiles {...props} onBusyChange={onBusyChange} />,
      );
    });
    let pending!: Promise<void>;
    act(() => {
      pending = button('交给文件Agent').props.onPress();
    });
    expect(onBusyChange).toHaveBeenLastCalledWith(true);
    act(() => listeners.forEach(listener => listener(state)));
    if (returnBeforeResponse)
      act(() => listeners.forEach(listener => listener('active')));
    await act(async () => {
      finish({ ...file, content: 'late content' });
      await pending;
    });
    expect(open).not.toHaveBeenCalled();
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    expect(button('交给文件Agent').props.disabled).toBe(false);
    expect(JSON.stringify(renderer.toJSON())).not.toContain('已离开文件页面');
    expect(JSON.stringify(renderer.toJSON())).not.toContain('late content');
    if (!returnBeforeResponse)
      act(() => listeners.forEach(listener => listener('active')));
    expect(open).not.toHaveBeenCalled();
    await act(async () => button('交给文件Agent').props.onPress());
    expect(read).toHaveBeenCalledTimes(3);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith({ ...reference, version: 'v2' });
    act(() => renderer.unmount());
    expect(remove).toHaveBeenCalledTimes(1);
    expect(listeners.size).toBe(0);
  },
);

test('account switch clears full content and reference immediately', async () => {
  const props = await setup(
    jest.fn().mockResolvedValue({ ...file, content: 'private owner content' }),
  );
  expect(button('交给文件Agent')).toBeTruthy();
  act(() => {
    renderer.update(
      <SecondFloorFiles
        {...props}
        session={{
          ...props.session,
          token: 'other-owner',
          stationContent: emptyStationContent,
        }}
      />,
    );
  });
  expect(button('交给文件Agent')).toBeUndefined();
  expect(JSON.stringify(renderer.toJSON())).not.toContain(
    'private owner content',
  );
});

test('failed current read removes previously visible full content and reference', async () => {
  const read = jest
    .fn()
    .mockResolvedValueOnce({ ...file, content: 'private full content' })
    .mockRejectedValueOnce(new Error('文件已删除'));
  await setup(read);
  await act(async () => {
    await button('重新读取正文').props.onPress();
  });
  expect(button('交给文件Agent')).toBeUndefined();
  expect(JSON.stringify(renderer.toJSON())).not.toContain(
    'private full content',
  );
  expect(JSON.stringify(renderer.toJSON())).toContain('文件已删除');
});

test('a picker result arriving after leaving and returning is released without upload', async () => {
  let finish!: (value: any) => void;
  const release = jest.fn(async () => {});
  NativeModules.MiaoxunDocumentPickerModule = {
    pick: jest.fn(
      () =>
        new Promise(resolve => {
          finish = resolve;
        }),
    ),
    release,
  };
  const props = await setup(
    jest.fn().mockResolvedValue({ ...file, content: 'full' }),
  );
  act(() => {
    button('返回文件列表').props.onPress();
  });
  const upload = jest.fn();
  const next = {
    ...props,
    session: { ...props.session, uploadStationFileAsset: upload },
  };
  act(() => {
    renderer.update(<SecondFloorFiles {...next} />);
  });
  let pending!: Promise<void>;
  act(() => {
    pending = button('选择并上传文件').props.onPress();
  });
  act(() => {
    renderer.update(<SecondFloorFiles {...next} active={false} />);
  });
  act(() => {
    renderer.update(<SecondFloorFiles {...next} active />);
  });
  await act(async () => {
    finish({
      uri: 'file:///controlled',
      originalFilename: 'a.txt',
      byteSize: 8,
      idempotencyKey: 'same-key',
    });
    await pending;
  });
  expect(upload).not.toHaveBeenCalled();
  expect(release).toHaveBeenCalledWith('same-key');
});

test.each([false, true])(
  'a native picker inactive round trip preserves upload and current errors (upload fails: %s)',
  async fails => {
    const listeners = new Set<(state: AppStateStatus) => void>();
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_event, listener) => {
        listeners.add(listener);
        return { remove: () => listeners.delete(listener) };
      });
    let finish!: (value: any) => void;
    const release = jest.fn(async () => {});
    NativeModules.MiaoxunDocumentPickerModule = {
      pick: jest.fn(
        () =>
          new Promise(resolve => {
            finish = resolve;
          }),
      ),
      release,
    };
    const props = await setup(
      jest.fn().mockResolvedValue({ ...file, content: 'full' }),
    );
    const upload = fails
      ? jest.fn().mockRejectedValue(new Error('上传失败，请重试'))
      : jest.fn().mockResolvedValue(file);
    const refresh = jest.fn().mockResolvedValue(undefined);
    act(() => {
      button('返回文件列表').props.onPress();
      renderer.update(
        <SecondFloorFiles
          {...props}
          session={{
            ...props.session,
            uploadStationFileAsset: upload,
            refreshStationContent: refresh,
          }}
        />,
      );
    });
    let pending!: Promise<void>;
    act(() => {
      pending = button('选择并上传文件').props.onPress();
    });
    act(() => listeners.forEach(listener => listener('inactive')));
    act(() => listeners.forEach(listener => listener('active')));
    const picked = {
      uri: 'file:///controlled',
      originalFilename: 'a.txt',
      byteSize: 8,
      idempotencyKey: 'picker-key',
    };
    await act(async () => {
      finish(picked);
      await pending;
    });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledWith({ ...picked, mimeType: 'text/plain' });
    if (fails) {
      expect(JSON.stringify(renderer.toJSON())).toContain('上传失败，请重试');
      expect(button('重试上传同一文件').props.busy).toBe(false);
      expect(refresh).not.toHaveBeenCalled();
    } else {
      expect(release).toHaveBeenCalledWith('picker-key');
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(button('选择并上传文件').props.busy).toBe(false);
    }
  },
);
