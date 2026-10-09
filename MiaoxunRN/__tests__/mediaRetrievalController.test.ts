import { MediaRetrievalController } from '../src/features/media-retrieval/MediaRetrievalController';
import {
  RetrievalRun,
  RetrievalStatus,
} from '../src/features/media-retrieval/mediaRetrievalTypes';
import {
  canSearch,
  phaseFor,
} from '../src/features/media-retrieval/mediaRetrievalState';
import { MiaoxunApiError } from '../src/services/api/http';
import fixture from '../../shared/media-retrieval-public-contract.fixture.json';
import { PendingRetrievalOperation } from '../src/features/media-retrieval/mediaRetrievalJournal';

const run = (
  lifecycleStatus: RetrievalRun['lifecycleStatus'],
  runType = 'media-index',
): RetrievalRun => ({
  id: 'run-1',
  agentId: 'media-retrieval',
  runType,
  status: 'pending',
  lifecycleStatus,
  traceId: null,
  attempt: 1,
  failureCode: null,
  createdAt: null,
  finishedAt: null,
});
const status = (
  enabled = true,
  runs: RetrievalRun[] = [],
): RetrievalStatus => ({
  enabled,
  consentVersion: enabled ? 'media-retrieval-consent-v1' : null,
  backfill: {
    agentRunId: runs[0]?.id || null,
    lifecycleStatus: runs[0]?.lifecycleStatus || 'idle',
    indexedAssets: 1,
    totalAssets: 1,
    skippedAssets: 0,
  },
  quota: { dailyRemaining: null, monthlyRemainingFen: null },
  availability: { state: 'available', canStartRun: true, reasonCodes: [] },
  recentRuns: runs,
});
const mockApi = () => ({
  status: jest.fn().mockResolvedValue(status()),
  enable: jest.fn().mockResolvedValue({
    agentRunId: 'run-1',
    lifecycleStatus: 'queued',
    reused: false,
  }),
  reindex: jest.fn().mockResolvedValue({
    agentRunId: 'run-1',
    lifecycleStatus: 'queued',
    reused: false,
  }),
  purge: jest.fn().mockResolvedValue({
    agentRunId: 'run-1',
    lifecycleStatus: 'queued',
    reused: false,
  }),
  search: jest.fn().mockResolvedValue(fixture.searchSuccess),
  events: jest.fn().mockResolvedValue({ run: run('running'), events: [] }),
});
const event = (id: string, sequence: number) => ({
  id,
  sequence,
  lifecycleStatus: 'running',
  eventType: 'job-started',
  visibility: 'client',
  payload: {},
  createdAt: null,
});

describe('media retrieval lifecycle', () => {
  const controllers: MediaRetrievalController[] = [];
  const create = (api: ReturnType<typeof mockApi>, token = 'owner') => {
    const controller = new MediaRetrievalController(token, true, api);
    controllers.push(controller);
    return controller;
  };
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    controllers.forEach(controller => controller.dispose());
    controllers.length = 0;
    jest.useRealTimers();
  });

  it('keeps 202 queued as indexing, prevents double submit, and does not automatically search', async () => {
    const api = mockApi();
    api.status
      .mockResolvedValueOnce(status(false))
      .mockResolvedValue(status(true, [run('queued')]));
    const controller = create(api);
    await controller.refresh();
    await Promise.all([
      controller.perform('enable'),
      controller.perform('enable'),
    ]);
    expect(api.enable).toHaveBeenCalledTimes(1);
    expect(phaseFor(controller.state, true)).toBe('indexing');
    expect(api.search).not.toHaveBeenCalled();
  });
  it('retries an uncertain lifecycle write only on user action with the original idempotency key', async () => {
    const api = mockApi();
    api.status.mockResolvedValue(status(false));
    api.enable.mockRejectedValueOnce(
      new MiaoxunApiError('offline', { isNetworkError: true }),
    );
    const controller = create(api);
    await controller.refresh();
    await controller.perform('enable');
    await jest.advanceTimersByTimeAsync(15000);
    expect(api.enable).toHaveBeenCalledTimes(1);
    await controller.retryAction();
    expect(api.enable).toHaveBeenCalledTimes(2);
    expect(api.enable.mock.calls[0][1]).toBe(api.enable.mock.calls[1][1]);
  });
  it('restores an uncertain operation after leaving the screen and never redispatches automatically', async () => {
    const api = mockApi();
    api.status.mockResolvedValue(status(false));
    api.enable.mockRejectedValueOnce(
      new MiaoxunApiError('offline', { isNetworkError: true }),
    );
    let saved: PendingRetrievalOperation | null = null;
    const journal = {
      read: async () => saved,
      write: async (value: PendingRetrievalOperation | null) => {
        saved = value;
      },
    };
    const first = new MediaRetrievalController('token', true, api, journal);
    await first.refresh();
    await first.perform('enable');
    const firstKey = api.enable.mock.calls[0][1];
    first.dispose();
    const resumed = new MediaRetrievalController('token', true, api, journal);
    controllers.push(resumed);
    await resumed.refresh();
    expect(api.enable).toHaveBeenCalledTimes(1);
    expect(resumed.hasRetryAction()).toBe(true);
    await resumed.checkStatus();
    await resumed.retryAction();
    expect(api.enable.mock.calls[1][1]).toBe(firstKey);
    expect(saved).toBeNull();
  });
  it('never starts a lifecycle request when its operation key cannot be persisted', async () => {
    const api = mockApi();
    api.status.mockResolvedValue(status(false));
    const journal = {
      read: async () => null,
      write: async () => {
        throw new MiaoxunApiError('storage', {
          code: 'retrieval_local_storage',
          retryable: true,
        });
      },
    };
    const controller = new MediaRetrievalController(
      'token',
      true,
      api,
      journal,
    );
    controllers.push(controller);
    await controller.refresh();
    await controller.perform('enable');
    expect(api.enable).not.toHaveBeenCalled();
    expect(controller.state.error?.code).toBe('retrieval_local_storage');
  });
  it('preserves a rejected operation key when clearing its journal fails', async () => {
    const api = mockApi();
    api.status.mockResolvedValue(status(false));
    api.enable.mockRejectedValueOnce(
      new MiaoxunApiError('unavailable', {
        code: 'retrieval_not_enabled',
        status: 403,
        retryable: false,
      }),
    );
    let refuseClear = true;
    let saved: PendingRetrievalOperation | null = null;
    const journal = {
      read: async () => saved,
      write: async (value: PendingRetrievalOperation | null) => {
        if (!value && refuseClear)
          throw new MiaoxunApiError('storage', {
            code: 'retrieval_local_storage',
            retryable: true,
          });
        saved = value;
      },
    };
    const controller = new MediaRetrievalController(
      'token',
      true,
      api,
      journal,
    );
    controllers.push(controller);
    await controller.refresh();
    await controller.perform('enable');
    expect(controller.state.pendingOperation).toBe(true);
    expect(controller.state.error?.code).toBe('retrieval_local_storage');
    expect(controller.hasRetryAction()).toBe(true);
    refuseClear = false;
    await controller.retryAction();
    expect(api.enable.mock.calls[1][1]).toBe(api.enable.mock.calls[0][1]);
    expect(saved).toBeNull();
  });
  it('retains the operation key when a successful HTTP response has an invalid contract', async () => {
    const api = mockApi();
    api.status.mockResolvedValue(status(false));
    api.enable.mockRejectedValueOnce(
      new MiaoxunApiError('invalid response', {
        code: 'retrieval_contract_invalid',
      }),
    );
    const controller = create(api);
    await controller.refresh();
    await controller.perform('enable');
    expect(controller.state.pendingOperation).toBe(true);
    expect(controller.hasRetryAction()).toBe(true);
    await controller.retryAction();
    expect(api.enable.mock.calls[1][1]).toBe(api.enable.mock.calls[0][1]);
  });
  it('restores and retries a privacy purge under a charge lock using the same key', async () => {
    const api = mockApi();
    api.search.mockRejectedValue(
      new MiaoxunApiError('review', {
        code: 'retrieval_unknown_charge_no_retry',
        retryable: false,
      }),
    );
    api.purge.mockRejectedValueOnce(
      new MiaoxunApiError('offline', { isNetworkError: true }),
    );
    let saved: PendingRetrievalOperation | null = null;
    const journal = {
      read: async () => saved,
      write: async (value: PendingRetrievalOperation | null) => {
        saved = value;
      },
    };
    const first = new MediaRetrievalController('token', true, api, journal);
    await first.refresh();
    await first.search('dress');
    await first.perform('purge');
    expect(first.hasRetryAction()).toBe(true);
    first.dispose();
    const resumed = new MediaRetrievalController('token', true, api, journal);
    controllers.push(resumed);
    await resumed.refresh();
    expect(resumed.state.chargeReview).toBe(true);
    expect(resumed.hasRetryAction()).toBe(true);
    await resumed.retryAction();
    expect(api.purge.mock.calls[1][1]).toBe(api.purge.mock.calls[0][1]);
    await resumed.perform('reindex');
    expect(api.reindex).not.toHaveBeenCalled();
  });
  it('resumes events after foreground status refresh, deduplicates IDs, and stops on terminal', async () => {
    const api = mockApi();
    api.status.mockResolvedValue(status(true, [run('running')]));
    api.events.mockResolvedValueOnce({
      run: run('running'),
      events: [event('e1', 1), event('e1', 1)],
    });
    const controller = create(api);
    controller.setForeground(true);
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(1500);
    expect(controller.state.events).toHaveLength(1);
    controller.setForeground(false);
    await jest.advanceTimersByTimeAsync(5000);
    expect(api.events).toHaveBeenCalledTimes(1);
    api.events.mockResolvedValueOnce({
      run: run('succeeded'),
      events: [event('e1', 1), event('e2', 2)],
    });
    api.status.mockResolvedValue(status(true, [run('succeeded')]));
    // The foreground snapshot still reports running until the terminal event arrives.
    api.status.mockResolvedValueOnce(status(true, [run('running')]));
    controller.setForeground(true);
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(1500);
    expect(api.events).toHaveBeenLastCalledWith('owner', 'run-1', 1);
    expect(controller.state.events).toHaveLength(2);
    await jest.advanceTimersByTimeAsync(10000);
    expect(api.events).toHaveBeenCalledTimes(2);
  });
  it('keeps unknown charge locked after stale status refresh and never retries search', async () => {
    const api = mockApi();
    api.search.mockRejectedValue(
      new MiaoxunApiError('unknown charge', {
        code: 'retrieval_unknown_charge_no_retry',
        retryable: false,
      }),
    );
    const controller = create(api);
    await controller.refresh();
    await controller.search('dress');
    await controller.checkStatus();
    await controller.search('dress');
    await controller.perform('reindex');
    await jest.advanceTimersByTimeAsync(10000);
    expect(controller.state.chargeReview).toBe(true);
    expect(canSearch(controller.state, true)).toBe(false);
    expect(api.search).toHaveBeenCalledTimes(1);
    expect(api.reindex).not.toHaveBeenCalled();
  });
  it('reuses the search idempotency key after an uncertain response and rotates it after success', async () => {
    const api = mockApi();
    api.search
      .mockRejectedValueOnce(
        new MiaoxunApiError('offline', { isNetworkError: true }),
      )
      .mockResolvedValue(fixture.searchSuccess);
    const controller = create(api);
    await controller.refresh();

    await controller.search('  yellow dress  ', 'image');
    await controller.search('yellow dress', 'image');
    expect(api.search).toHaveBeenCalledTimes(2);
    expect(api.search.mock.calls[0][2]).toBe(api.search.mock.calls[1][2]);

    await controller.search('yellow dress', 'image');
    expect(api.search).toHaveBeenCalledTimes(3);
    expect(api.search.mock.calls[2][2]).not.toBe(api.search.mock.calls[1][2]);
  });
  it('keeps purge locked through failed cleanup and only clears on server-confirmed succeeded', async () => {
    const api = mockApi();
    const controller = create(api);
    await controller.refresh();
    await controller.search('dress');
    api.status.mockResolvedValue(status(false, [run('queued', 'media-purge')]));
    await controller.perform('purge');
    expect(controller.state.results).toEqual([]);
    expect(phaseFor(controller.state, true)).toBe('purging');
    api.status.mockResolvedValue(status(false, [run('failed', 'media-purge')]));
    await controller.refresh();
    expect(phaseFor(controller.state, true)).toBe('purging');
    api.status.mockResolvedValue(
      status(false, [run('succeeded', 'media-purge')]),
    );
    await controller.refresh();
    expect(phaseFor(controller.state, true)).toBe('disabled');
  });
  it('does not mistake a historical successful purge for confirmation of the new request', async () => {
    const api = mockApi();
    const oldPurge = { ...run('succeeded', 'media-purge'), id: 'old-purge' };
    const controller = create(api);
    await controller.refresh();
    api.status.mockResolvedValue(status(false, [oldPurge]));
    api.purge.mockRejectedValueOnce(
      new MiaoxunApiError('offline', { isNetworkError: true }),
    );
    await controller.perform('purge');
    await controller.refresh();
    expect(controller.state.purgePending).toBe(true);
    await controller.retryAction();
    expect(controller.state.run?.id).toBe('run-1');
    expect(controller.state.purgePending).toBe(true);
    api.status.mockResolvedValue(
      status(false, [run('succeeded', 'media-purge'), oldPurge]),
    );
    await controller.refresh();
    expect(controller.state.purgePending).toBe(false);
  });
  it('does not accept stale search responses after session disposal', async () => {
    const api = mockApi();
    let resolveSearch!: (value: unknown) => void;
    api.search.mockReturnValue(
      new Promise(resolve => {
        resolveSearch = resolve;
      }),
    );
    const first = create(api, 'first-owner');
    await first.refresh();
    const pending = first.search('dress');
    first.dispose();
    const second = create(mockApi(), 'second-owner');
    await second.refresh();
    resolveSearch(fixture.searchSuccess);
    await pending;
    expect(first.state.results).toEqual([]);
    expect(second.state.results).toEqual([]);
  });
  it('does not keep polling nonretryable missing runs', async () => {
    const api = mockApi();
    api.status.mockResolvedValue(status(true, [run('running')]));
    api.events.mockRejectedValue(
      new MiaoxunApiError('missing', {
        code: 'run_not_found',
        status: 404,
        retryable: false,
      }),
    );
    const controller = create(api);
    controller.setForeground(true);
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(15000);
    expect(api.events).toHaveBeenCalledTimes(1);
    expect(controller.state.error?.code).toBe('run_not_found');
  });

  it('keeps search blocked if foreground status cannot be verified', async () => {
    const api = mockApi();
    const controller = create(api);
    await controller.refresh();
    api.status.mockRejectedValue(
      new MiaoxunApiError('offline', { isNetworkError: true }),
    );
    await controller.refresh();
    await controller.search('dress');
    expect(canSearch(controller.state, true)).toBe(false);
    expect(api.search).not.toHaveBeenCalled();
  });

  it('clears an obsolete status-read error after a verified refresh', async () => {
    const api = mockApi();
    api.status.mockRejectedValueOnce(
      new MiaoxunApiError('unavailable', {
        code: 'retrieval_service_unavailable',
        status: 503,
      }),
    );
    const controller = create(api);
    await controller.refresh();
    expect(controller.state.statusStale).toBe(true);
    expect(controller.state.error?.code).toBe('retrieval_service_unavailable');
    await controller.refresh();
    expect(controller.state.error).toBeNull();
    expect(canSearch(controller.state, true)).toBe(true);
  });

  it.each([
    new MiaoxunApiError('offline', { isNetworkError: true }),
    new MiaoxunApiError('unavailable', {
      code: 'retrieval_service_unavailable',
      status: 503,
    }),
  ])('preserves a search failure when status refresh succeeds', async error => {
    const api = mockApi();
    api.search.mockRejectedValueOnce(error);
    const controller = create(api);
    await controller.refresh();
    await controller.search('yellow dress');
    const issue = controller.state.error;
    await controller.refresh();
    expect(controller.state.error).toBe(issue);
    expect(api.search).toHaveBeenCalledTimes(1);
  });

  it.each(['media-index', 'media-reindex'])(
    'searches ready assets after partial %s failure without restarting index tasks',
    async runType => {
      const api = mockApi();
      const partial = status(true, [
        {
          ...run('failed', runType),
          failureCode: 'retrieval_child_jobs_failed',
        },
      ]);
      partial.backfill = {
        ...partial.backfill,
        indexedAssets: 5,
        totalAssets: 7,
        skippedAssets: 2,
      };
      api.status.mockResolvedValue(partial);
      const controller = create(api);
      await controller.refresh();
      expect(phaseFor(controller.state, true)).toBe('ready');
      expect(canSearch(controller.state, true)).toBe(true);
      expect(api.search).not.toHaveBeenCalled();
      await controller.search('yellow dress');
      expect(api.search).toHaveBeenCalledTimes(1);
      expect(api.enable).not.toHaveBeenCalled();
      expect(api.reindex).not.toHaveBeenCalled();
      expect(controller.state.status?.backfill.skippedAssets).toBe(2);
    },
  );

  it.each([
    'retrieval_unknown_charge_no_retry',
    'retrieval_purge_incomplete',
    'retrieval_repository_write_failed',
  ])('keeps %s blocked despite indexed assets', async failureCode => {
    const api = mockApi();
    api.status.mockResolvedValue(
      status(true, [{ ...run('failed'), failureCode }]),
    );
    const controller = create(api);
    await controller.refresh();
    await controller.search('yellow dress');
    expect(phaseFor(controller.state, true)).toBe('blocked');
    expect(api.search).not.toHaveBeenCalled();
  });

  it('does not enable partial retrieval with zero ready assets or a closed service', async () => {
    const api = mockApi();
    const partial = status(true, [
      { ...run('failed'), failureCode: 'retrieval_child_jobs_failed' },
    ]);
    partial.backfill.indexedAssets = 0;
    api.status.mockResolvedValue(partial);
    const controller = create(api);
    await controller.refresh();
    expect(canSearch(controller.state, true)).toBe(false);
    api.status.mockResolvedValue({
      ...partial,
      backfill: { ...partial.backfill, indexedAssets: 1 },
      availability: {
        state: 'temporarily-unavailable',
        canStartRun: false,
        reasonCodes: ['operator-disabled'],
      },
    });
    await controller.refresh();
    await controller.search('yellow dress');
    expect(api.search).not.toHaveBeenCalled();
  });

  it('keeps tracking an older active task when a newer upload has completed', async () => {
    const api = mockApi();
    const active = { ...run('running', 'media-reindex'), id: 'older-reindex' };
    api.status.mockResolvedValue(
      status(true, [{ ...run('succeeded'), id: 'new-upload' }, active]),
    );
    const controller = create(api);
    await controller.refresh();
    expect(controller.state.run?.id).toBe(active.id);
    expect(phaseFor(controller.state, true)).toBe('indexing');
  });

  it('clears displayed results after consent is withdrawn on another device', async () => {
    const api = mockApi();
    const controller = create(api);
    await controller.refresh();
    await controller.search('yellow dress');
    expect(controller.state.results.length).toBeGreaterThan(0);
    api.status.mockResolvedValue(status(false));
    await controller.refresh();
    expect(controller.state.results).toEqual([]);
    expect(controller.state.searched).toBe(false);
    expect(canSearch(controller.state, true)).toBe(false);
  });

  it.each(['dailyRemaining', 'monthlyRemainingFen'] as const)(
    'does not dispatch a search when %s is exhausted',
    async field => {
      const api = mockApi();
      const exhausted = status();
      exhausted.quota[field] = 0;
      api.status.mockResolvedValue(exhausted);
      const controller = create(api);
      await controller.refresh();
      await controller.search('yellow dress');
      expect(canSearch(controller.state, true)).toBe(false);
      expect(api.search).not.toHaveBeenCalled();
    },
  );

  it('allows searching when the server explicitly reports no usage or spending ceiling', async () => {
    const api = mockApi();
    api.status.mockResolvedValue(status());
    const controller = create(api);
    await controller.refresh();
    await controller.search('yellow dress');
    expect(api.search).toHaveBeenCalledTimes(1);
  });

  it('still tracks physical purge while an unknown-charge review is pending', async () => {
    const api = mockApi();
    const controller = create(api);
    await controller.refresh();
    api.search.mockRejectedValue(
      new MiaoxunApiError('review', {
        code: 'retrieval_unknown_charge_no_retry',
        retryable: false,
      }),
    );
    await controller.search('dress');
    api.status.mockResolvedValue(status(false, [run('queued', 'media-purge')]));
    await controller.perform('purge');
    api.events.mockResolvedValue({
      run: run('succeeded', 'media-purge'),
      events: [],
    });
    controller.setForeground(true);
    await Promise.resolve();
    api.status.mockResolvedValue(
      status(false, [run('succeeded', 'media-purge')]),
    );
    await jest.advanceTimersByTimeAsync(1500);
    expect(api.events).toHaveBeenCalledTimes(1);
    expect(controller.state.purgePending).toBe(false);
    expect(controller.state.chargeReview).toBe(true);
  });

  it('does not restart a terminal run when the status snapshot briefly lags behind events', async () => {
    const api = mockApi();
    api.status.mockResolvedValue(status(true, [run('running')]));
    api.events.mockResolvedValue({ run: run('succeeded'), events: [] });
    const controller = create(api);
    controller.setForeground(true);
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(15000);
    expect(api.events).toHaveBeenCalledTimes(1);
    expect(controller.state.run?.lifecycleStatus).toBe('succeeded');
  });
});
