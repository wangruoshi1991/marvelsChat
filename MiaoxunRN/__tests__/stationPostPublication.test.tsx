import React from 'react';
import { Alert } from 'react-native';
import * as Keychain from 'react-native-keychain';
import { launchImageLibrary } from 'react-native-image-picker';
import TestRenderer, { act } from 'react-test-renderer';
import { useStationPostComposer } from '../src/features/station/useStationPostComposer';
import {
  hashStationPostPayload,
  stationPostAttemptStore,
} from '../src/services/stationPostAttemptStore';

const OWNER = '11111111-1111-4111-8111-111111111111';
const BORROWED = '22222222-2222-4222-8222-222222222222';
const UPLOADED = '33333333-3333-4333-8333-333333333333';
const records = new Map<string, { username: string; password: string }>();
let renderer: TestRenderer.ReactTestRenderer;
let composer: ReturnType<typeof useStationPostComposer>;
let props: any;
function Harness(value: any) {
  composer = useStationPostComposer(value);
  return null;
}
const mount = async (
  sessionOverrides = {},
  draft: any = { body: 'A comic', mediaAssetIds: [BORROWED] },
) => {
  props = {
    language: 'zh',
    initialDraft: draft,
    onClose: jest.fn(),
    onPublished: jest.fn(),
    onActionError: jest.fn(),
    session: {
      user: { id: OWNER },
      token: 'owner-token',
      ownedAgents: [],
      profile: {},
      createStationMediaAsset: jest.fn(async () => ({ id: UPLOADED })),
      createStationPost: jest.fn(async () => ({ id: 'post' })),
      resolveStationPostSubmission: jest.fn(async () => ({
        status: 'not_submitted',
      })),
      deleteStationMediaAsset: jest.fn(async () => undefined),
      ...sessionOverrides,
    },
  };
  await act(async () => {
    renderer = TestRenderer.create(<Harness {...props} />);
  });
};
beforeEach(() => {
  jest.clearAllMocks();
  records.clear();
  jest
    .mocked(Keychain.getGenericPassword)
    .mockImplementation(
      async options => (records.get(options!.service!) || false) as never,
    );
  jest
    .mocked(Keychain.setGenericPassword)
    .mockImplementation(async (username, password, options) => {
      records.set(options!.service!, { username, password });
      return true as never;
    });
  jest
    .mocked(Keychain.resetGenericPassword)
    .mockImplementation(async options => {
      records.delete(options!.service!);
      return true;
    });
});
afterEach(() => {
  if (renderer) act(() => renderer.unmount());
  jest.restoreAllMocks();
});
test('comic draft borrows ordered images privately; removing and canceling never delete them', async () => {
  await mount();
  expect(composer.body).toBe('A comic');
  expect(composer.visibility).toBe('private');
  expect(composer.attachments.map(item => (item as any).assetId)).toEqual([
    BORROWED,
  ]);
  await act(async () => {
    await composer.removeAttachment(composer.attachments[0].uri);
  });
  const alert = jest.spyOn(Alert, 'alert');
  act(() => composer.requestClose());
  await act(async () => {
    await alert.mock.calls
      .at(-1)![2]!
      .find(button => button.style === 'destructive')!.onPress!();
  });
  expect(props.session.deleteStationMediaAsset).not.toHaveBeenCalled();
  expect(props.onClose).toHaveBeenCalledTimes(1);
});
test('mixed borrowed and local images upload only the new file and persist intent before POST', async () => {
  await mount();
  jest.mocked(launchImageLibrary).mockResolvedValueOnce({
    assets: [{ uri: 'file:///new.jpg', type: 'image/jpeg', fileSize: 12 }],
  });
  await act(async () => {
    await composer.addImages();
  });
  props.session.createStationPost.mockImplementation(async (payload: any) => {
    const saved = [...records.values()].map(record =>
      JSON.parse(record.password),
    )[0];
    expect(saved.clientRequestId).toBe(payload.clientRequestId);
    expect(saved.payload.mediaAssetIds).toEqual([BORROWED, UPLOADED]);
    expect(saved.requestHash).toMatch(/^[0-9a-f]{64}$/);
    return { id: 'post' };
  });
  await act(async () => {
    await composer.publish();
  });
  expect(props.session.createStationMediaAsset).toHaveBeenCalledTimes(1);
  expect(props.session.createStationPost).toHaveBeenCalledWith(
    expect.objectContaining({
      visibility: 'private',
      mediaAssetIds: [BORROWED, UPLOADED],
      clientRequestId: expect.any(String),
    }),
  );
  expect(props.onPublished).toHaveBeenCalledTimes(1);
  expect(records.size).toBe(0);
});
test('unknown publication freezes payload, forbids resend and deletion, and survives remount for receipt-only recovery', async () => {
  await mount({
    createStationPost: jest.fn(async () => {
      throw new Error('connection lost');
    }),
    resolveStationPostSubmission: jest.fn(async () => {
      throw new Error('offline');
    }),
  });
  await act(async () => {
    await composer.publish();
  });
  const request = props.session.createStationPost.mock.calls[0][0];
  await act(async () => {
    composer.setBody('changed');
    await composer.removeAttachment(composer.attachments[0].uri);
    await composer.publish();
  });
  expect(composer.body).toBe('A comic');
  expect(composer.attachments).toHaveLength(1);
  expect(props.session.createStationPost).toHaveBeenCalledTimes(1);
  expect(props.session.deleteStationMediaAsset).not.toHaveBeenCalled();
  act(() => renderer.unmount());
  await mount({
    resolveStationPostSubmission: jest.fn(async () => ({
      status: 'submitted',
      post: { id: 'original-post' },
    })),
  });
  expect(props.session.resolveStationPostSubmission).toHaveBeenCalledWith(
    request.clientRequestId,
  );
  expect(props.session.createStationPost).not.toHaveBeenCalled();
  expect(props.onPublished).toHaveBeenCalledTimes(1);
  expect(records.size).toBe(0);
});
test('only an explicit not-submitted receipt unlocks editing and a later user intent', async () => {
  await mount({
    createStationPost: jest.fn(async () => {
      throw new Error('timeout');
    }),
  });
  await act(async () => {
    await composer.publish();
  });
  await act(async () => {
    await (composer as any).verifyPublication();
  });
  act(() => composer.setBody('changed after proof'));
  expect(composer.body).toBe('changed after proof');
  expect(props.session.createStationPost).toHaveBeenCalledTimes(1);
  expect(records.size).toBe(0);
});
test('late native picker cannot attach an old account file to a new session', async () => {
  await mount();
  let resolve!: (value: any) => void;
  jest.mocked(launchImageLibrary).mockImplementationOnce(
    () =>
      new Promise(done => {
        resolve = done;
      }),
  );
  let picking!: Promise<void>;
  act(() => {
    picking = composer.addImages();
  });
  props = {
    ...props,
    session: {
      ...props.session,
      user: { id: 'other-owner' },
      token: 'other-token',
    },
  };
  await act(async () => {
    renderer.update(<Harness {...props} />);
  });
  await act(async () => {
    resolve({
      assets: [{ uri: 'file:///old-account.jpg', type: 'image/jpeg' }],
    });
    await picking;
  });
  expect(
    composer.attachments.some(item => item.uri === 'file:///old-account.jpg'),
  ).toBe(false);
});

test('an old discard alert cannot close or invalidate the next session draft', async () => {
  await mount();
  const alert = jest.spyOn(Alert, 'alert');
  act(() => composer.requestClose());
  const discard = alert.mock.calls
    .at(-1)![2]!
    .find(button => button.style === 'destructive')!.onPress!;
  props = {
    ...props,
    session: { ...props.session, token: 'refreshed-owner-token' },
  };
  await act(async () => {
    renderer.update(<Harness {...props} />);
  });
  act(() => composer.setBody('new session draft'));
  let resolve!: (value: any) => void;
  jest.mocked(launchImageLibrary).mockImplementationOnce(
    () =>
      new Promise(done => {
        resolve = done;
      }),
  );
  let picking!: Promise<void>;
  act(() => {
    picking = composer.addImages();
  });
  await act(async () => {
    await discard();
  });
  await act(async () => {
    resolve({
      assets: [{ uri: 'file:///new-session.jpg', type: 'image/jpeg' }],
    });
    await picking;
  });
  expect(props.onClose).not.toHaveBeenCalled();
  expect(props.session.deleteStationMediaAsset).not.toHaveBeenCalled();
  expect(composer.body).toBe('new session draft');
  expect(composer.attachments.map(item => item.uri)).toEqual([
    'file:///new-session.jpg',
  ]);
});

test('preflight storage failure sends no POST and keeps uploaded files available for explicit recovery', async () => {
  await mount();
  jest
    .mocked(Keychain.setGenericPassword)
    .mockRejectedValueOnce(new Error('keychain locked'));
  await act(async () => {
    await composer.publish();
  });
  expect(props.session.createStationPost).not.toHaveBeenCalled();
  expect(props.session.deleteStationMediaAsset).not.toHaveBeenCalled();
  expect(composer.publishError).toBeTruthy();
});
test('resolved absence allows canceling only local temporary uploads while preserving comic media', async () => {
  await mount({
    createStationPost: jest.fn(async () => {
      throw new Error('timeout');
    }),
  });
  jest.mocked(launchImageLibrary).mockResolvedValueOnce({
    assets: [{ uri: 'file:///new.jpg', type: 'image/jpeg' }],
  });
  await act(async () => {
    await composer.addImages();
  });
  await act(async () => {
    await composer.publish();
  });
  await act(async () => {
    await composer.verifyPublication();
  });
  const alert = jest.spyOn(Alert, 'alert');
  act(() => composer.requestClose());
  await act(async () => {
    await alert.mock.calls
      .at(-1)![2]!
      .find(button => button.style === 'destructive')!.onPress!();
  });
  expect(props.session.deleteStationMediaAsset).toHaveBeenCalledTimes(1);
  expect(props.session.deleteStationMediaAsset).toHaveBeenCalledWith(UPLOADED);
});

test('late upload from an old account cannot start publication or replace the new draft', async () => {
  let resolve!: (value: any) => void;
  const upload = jest.fn(
    () =>
      new Promise(done => {
        resolve = done;
      }),
  );
  await mount({ createStationMediaAsset: upload });
  const oldSession = props.session;
  jest.mocked(launchImageLibrary).mockResolvedValueOnce({
    assets: [{ uri: 'file:///old-upload.jpg', type: 'image/jpeg' }],
  });
  await act(async () => {
    await composer.addImages();
  });
  let publishing!: Promise<void>;
  act(() => {
    publishing = composer.publish();
  });
  props = {
    ...props,
    session: {
      ...props.session,
      user: { id: 'other-owner' },
      token: 'other-token',
    },
  };
  await act(async () => {
    renderer.update(<Harness {...props} />);
  });
  await act(async () => {
    resolve({ id: UPLOADED });
    await publishing;
  });
  expect(composer.attachments).toEqual([]);
  expect(oldSession.createStationPost).not.toHaveBeenCalled();
  expect(oldSession.deleteStationMediaAsset).toHaveBeenCalledWith(UPLOADED);
});

test('a keychain write that saved before rejecting freezes its original payload and only resolves it', async () => {
  await mount();
  jest
    .mocked(Keychain.setGenericPassword)
    .mockImplementationOnce(async (username, password, options) => {
      records.set(options!.service!, { username, password });
      throw new Error('native response lost');
    });
  await act(async () => {
    await composer.publish();
  });
  act(() => composer.setBody('must remain frozen'));
  expect(composer.body).toBe('A comic');
  expect(composer.isEditingLocked).toBe(true);
  expect(props.session.createStationPost).not.toHaveBeenCalled();
  const saved = JSON.parse([...records.values()][0].password);
  await act(async () => {
    await composer.verifyPublication();
  });
  expect(props.session.resolveStationPostSubmission).toHaveBeenCalledWith(
    saved.clientRequestId,
  );
});

test('only one native attachment picker is active and an excessive returned selection is rejected explicitly', async () => {
  await mount();
  let resolve!: (value: any) => void;
  jest.mocked(launchImageLibrary).mockImplementationOnce(
    () =>
      new Promise(done => {
        resolve = done;
      }),
  );
  let picking!: Promise<void>;
  act(() => {
    picking = composer.addImages();
  });
  await act(async () => {
    await composer.addVideo();
  });
  expect(launchImageLibrary).toHaveBeenCalledTimes(1);
  await act(async () => {
    resolve({
      assets: Array.from({ length: 9 }, (_, index) => ({
        uri: `file:///too-many-${index}.jpg`,
        type: 'image/jpeg',
      })),
    });
    await picking;
  });
  expect(composer.attachments).toHaveLength(1);
  expect(props.onActionError).toHaveBeenCalled();
});

test('an unavailable submitted post keeps the frozen intent and explicit error without re-adding or republishing', async () => {
  await mount({
    createStationPost: jest.fn(async () => {
      throw new Error('response lost');
    }),
    resolveStationPostSubmission: jest.fn(async () => {
      throw new Error('Submitted post is unavailable');
    }),
  });
  await act(async () => {
    await composer.publish();
  });
  await act(async () => {
    await composer.verifyPublication();
  });
  expect(composer.publishError).toBe('Submitted post is unavailable');
  expect(composer.isEditingLocked).toBe(true);
  expect(records.size).toBe(1);
  expect(props.onPublished).not.toHaveBeenCalled();
  expect(props.session.createStationPost).toHaveBeenCalledTimes(1);
});

test('a competing saved intent wins over a new failed preparation and recovery resolves the stored ID', async () => {
  await mount();
  const payload = {
    body: 'Original saved story',
    locationLabel: '',
    visibility: 'private' as const,
    agentCapabilities: [],
    mediaAssetIds: [BORROWED],
  };
  const clientRequestId = '55555555-5555-4555-8555-555555555555';
  await stationPostAttemptStore.save(OWNER, {
    version: 1,
    clientRequestId,
    payload,
    requestHash: hashStationPostPayload(payload),
    attachments: [
      { assetId: BORROWED, kind: 'image', source: 'existingAsset' },
    ],
  });
  await act(async () => {
    await composer.publish();
  });
  expect(composer.body).toBe('Original saved story');
  expect(props.session.createStationPost).not.toHaveBeenCalled();
  await act(async () => {
    await composer.verifyPublication();
  });
  expect(props.session.resolveStationPostSubmission).toHaveBeenCalledWith(
    clientRequestId,
  );
  expect(records.size).toBe(0);
});
