import React from 'react';
import { Alert, Linking } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { useProfileFlows } from '../src/features/profile/useProfileFlows';
import type { PublicProfileDTO } from '../src/models/api';
import { scanQRCode } from '../src/services/qrScanner';

jest.mock('../src/services/qrScanner', () => ({ scanQRCode: jest.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

const profile = (id: string) =>
  ({ user: { id }, relation: { isFollowing: false } } as PublicProfileDTO);

function mountFlows() {
  const options = {
    language: 'zh' as const,
    user: null,
    profileVisible: false,
    sessionOwner: 'first',
    loadPublicProfileByAiId: jest.fn<Promise<PublicProfileDTO>, [string]>(),
    resolveScanPayload: jest.fn<Promise<PublicProfileDTO>, [string]>(),
    openModal: jest.fn(),
    closePublicProfileModal: jest.fn(),
    showToast: jest.fn(),
  };
  let flows!: ReturnType<typeof useProfileFlows>;
  function Harness({ owner }: { owner: string }) {
    flows = useProfileFlows({ ...options, sessionOwner: owner });
    return null;
  }
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => {
    renderer = TestRenderer.create(<Harness owner="first" />);
  });
  return {
    options,
    get current() {
      return flows;
    },
    changeOwner: () =>
      act(() => {
        renderer.update(<Harness owner="second" />);
      }),
    unmount: () =>
      act(() => {
        renderer.unmount();
      }),
  };
}

test('the last selected profile owns the receipt and relation changes', async () => {
  const view = mountFlows();
  try {
    const slow = deferred<PublicProfileDTO>();
    view.options.loadPublicProfileByAiId
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce(profile('b'))
      .mockResolvedValueOnce(profile('c'));
    let first!: Promise<void>;
    act(() => {
      first = view.current.openPublicProfileByAiId('a');
    });
    await act(() => view.current.openPublicProfileByAiId('b'));
    const actionsForB = view.current;
    await act(async () => {
      slow.resolve(profile('a'));
      await first;
    });
    expect(view.current.publicProfile?.user.id).toBe('b');
    await act(() => view.current.openPublicProfileByAiId('c'));
    act(() => {
      actionsForB.updateRelation({ isFollowing: true });
    });
    expect(view.current.publicProfile?.relation.isFollowing).toBe(false);
    expect(actionsForB.isCurrentProfile()).toBe(false);
  } finally {
    view.unmount();
  }
});

test('closing a loading profile discards its response', async () => {
  const view = mountFlows();
  try {
    const slow = deferred<PublicProfileDTO>();
    view.options.loadPublicProfileByAiId.mockReturnValue(slow.promise);
    let reading!: Promise<void>;
    act(() => {
      reading = view.current.openPublicProfileByAiId('a');
    });
    act(() => {
      view.current.closeProfile();
    });
    await act(async () => {
      slow.resolve(profile('a'));
      await reading;
    });
    expect(view.current.publicProfile).toBeNull();
    expect(view.current.loadingProfile).toBe(false);
    expect(view.options.openModal).toHaveBeenCalledTimes(1);
  } finally {
    view.unmount();
  }
});

test('a scanner response returning after a session change cannot start a profile lookup', async () => {
  const view = mountFlows();
  try {
    const scan = deferred<string>();
    jest.mocked(scanQRCode).mockReturnValueOnce(scan.promise);
    let scanning!: Promise<void>;
    act(() => {
      scanning = view.current.startQRCodeScan();
    });
    view.changeOwner();
    expect(view.current.isScanning()).toBe(true);
    await act(async () => {
      scan.resolve('123456789012');
      await scanning;
    });
    expect(view.options.resolveScanPayload).not.toHaveBeenCalled();
    expect(view.current.isScanning()).toBe(false);
    expect(view.options.openModal).not.toHaveBeenCalled();
    expect(view.options.showToast).not.toHaveBeenCalled();
  } finally {
    view.unmount();
  }
});

test('a valid identity code opens the profile with the server relationship state', async () => {
  const view = mountFlows();
  try {
    const identity = 'miaoxun://ai/123456789012';
    const peer = {
      ...profile('peer'),
      relation: {
        isSelf: false,
        isFollowing: false,
        isFriend: false,
        incomingFriendRequestId: 'incoming',
      },
    };
    jest.mocked(scanQRCode).mockResolvedValueOnce(identity);
    view.options.resolveScanPayload.mockResolvedValueOnce(peer);

    await act(() => view.current.startQRCodeScan());

    expect(view.options.resolveScanPayload).toHaveBeenCalledWith(identity);
    expect(view.options.openModal).toHaveBeenCalledWith('public-profile');
    expect(view.current.publicProfile).toEqual(peer);
  } finally {
    view.unmount();
  }
});

test('scan denial offers Settings and cancellation exits quietly', async () => {
  const view = mountFlows();
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
  try {
    jest
      .mocked(scanQRCode)
      .mockRejectedValueOnce(
        Object.assign(new Error(), { code: 'camera_denied' }),
      )
      .mockRejectedValueOnce(
        Object.assign(new Error(), { code: 'scanner_cancelled' }),
      );
    await act(() => view.current.startQRCodeScan());
    expect(alert).toHaveBeenCalledTimes(1);
    const settingsButton = alert.mock.calls[0][2]?.find(
      button => button.text === '打开设置',
    );
    expect(settingsButton).toBeDefined();
    settingsButton?.onPress?.();
    expect(openSettings).toHaveBeenCalledTimes(1);

    await act(() => view.current.startQRCodeScan());

    expect(view.options.resolveScanPayload).not.toHaveBeenCalled();
    expect(view.options.openModal).not.toHaveBeenCalled();
    expect(view.options.showToast).not.toHaveBeenCalled();
    expect(view.current.isScanning()).toBe(false);
  } finally {
    openSettings.mockRestore();
    alert.mockRestore();
    view.unmount();
  }
});
