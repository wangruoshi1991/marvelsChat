import { mediaRetrievalApi } from '../../services/api/mediaRetrievalApi';
import { MiaoxunApiError } from '../../services/api/http';
import {
  PendingRetrievalOperation,
  RetrievalJournal,
} from './mediaRetrievalJournal';
import {
  appendEvents,
  canSearch,
  initialRetrievalState,
  retrievalIssue,
  reconcileRetrievalStatus,
  terminalRun,
} from './mediaRetrievalState';
import {
  RetrievalAction,
  RetrievalRun,
  RetrievalState,
} from './mediaRetrievalTypes';

type Api = typeof mediaRetrievalApi;
const actionRunType = {
  enable: 'media-index',
  reindex: 'media-reindex',
  purge: 'media-purge',
};
let keySequence = 0;
const operationKey = () =>
  `rn-${Date.now().toString(36)}-${++keySequence}-${Math.random()
    .toString(36)
    .slice(2, 14)}`;

export class MediaRetrievalController {
  state = initialRetrievalState();
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private alive = true;
  private foreground = false;
  private polling = false;
  private failures = 0;
  private revision = 0;
  private sequence = new Map<string, number>();
  private eventsByRun = new Map<string, RetrievalState['events']>();
  private pending: PendingRetrievalOperation | null = null;
  private pendingSearch: {
    key: string;
    query: string;
    kind?: 'image' | 'video';
  } | null = null;
  private journalLoaded = false;
  private ignoredRuns = new Set<string>();
  constructor(
    private token: string,
    private registered: boolean,
    private api: Api = mediaRetrievalApi,
    private journal?: RetrievalJournal,
  ) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.state;
  private update(patch: Partial<RetrievalState>) {
    if (!this.alive) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(listener => listener());
  }
  dispose() {
    this.alive = false;
    this.stopTimer();
    this.listeners.clear();
    this.eventsByRun.clear();
    this.sequence.clear();
    this.pending = null;
    this.pendingSearch = null;
    this.token = '';
    this.state = initialRetrievalState();
  }
  setRegistered(registered: boolean) {
    this.registered = registered;
  }
  setForeground(active: boolean) {
    this.foreground = active;
    this.stopTimer();
    if (active) this.refresh();
  }
  private stopTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
  private schedule() {
    this.stopTimer();
    const run = this.state.run;
    if (
      !this.alive ||
      !this.foreground ||
      !run ||
      terminalRun(run.lifecycleStatus) ||
      (this.state.chargeReview && run.runType !== 'media-purge') ||
      this.ignoredRuns.has(run.id)
    )
      return;
    this.timer = setTimeout(() => {
      this.poll();
    }, [1500, 3000, 5000][Math.min(this.failures, 2)]);
  }
  private failed(error: unknown) {
    const issue = retrievalIssue(error);
    this.update({
      error: issue,
      ...(issue.code === 'retrieval_unknown_charge_no_retry'
        ? { chargeReview: true }
        : {}),
    });
    return issue;
  }
  async refresh() {
    if (!this.alive || this.state.refreshing) return;
    const revision = this.revision;
    this.update({ refreshing: true });
    try {
      if (this.journal && !this.journalLoaded) {
        const saved = await this.journal.read();
        if (!this.alive) return;
        this.pending = saved;
        this.journalLoaded = true;
        if (saved)
          this.update({
            pendingOperation: true,
            purgePending: saved.action === 'purge',
            chargeReview: saved.chargeReview === true,
            error: {
              code: 'pending_operation',
              message: '上次操作尚未确认。重试本次操作会沿用原操作编号。',
              retryable: saved.action === 'purge' || !saved.chargeReview,
            },
          });
      }
      const status = await this.api.status(this.token);
      if (!this.alive || revision !== this.revision) return;
      const next = reconcileRetrievalStatus(this.state, status);
      this.update({
        ...next,
        events: next.run ? this.eventsByRun.get(next.run.id) || [] : [],
      });
      if (this.pending && !this.state.error)
        this.update({
          error: {
            code: 'pending_operation',
            message: '上次操作尚未确认。重试本次操作会沿用原操作编号。',
            retryable:
              this.pending.action === 'purge' || !this.state.chargeReview,
          },
        });
    } catch (error) {
      this.update({ statusStale: true });
      this.failed(error);
    } finally {
      this.update({ refreshing: false });
      this.schedule();
    }
  }
  private async poll() {
    const run = this.state.run;
    if (!this.alive || !this.foreground || !run || this.polling) return;
    this.polling = true;
    try {
      const data = await this.api.events(
        this.token,
        run.id,
        this.sequence.get(run.id) || 0,
      );
      if (!this.alive || this.state.run?.id !== run.id) return;
      if (data.run.id !== run.id) throw new Error('Invalid run owner response');
      const events = appendEvents(
        this.eventsByRun.get(run.id) || [],
        data.events,
      );
      this.eventsByRun.set(run.id, events);
      this.sequence.set(
        run.id,
        events.reduce((last, event) => Math.max(last, event.sequence), 0),
      );
      this.failures = 0;
      const chargeReview =
        data.run.failureCode === 'retrieval_unknown_charge_no_retry';
      this.update({
        run: data.run,
        events,
        chargeReview: this.state.chargeReview || chargeReview,
      });
      if (terminalRun(data.run.lifecycleStatus)) {
        if (data.run.failureCode)
          this.update({ error: retrievalIssueFromRun(data.run) });
        await this.refresh();
      } else if (this.foreground) {
        await this.refresh();
      }
    } catch (error) {
      if (!this.alive) return;
      const issue = this.failed(error);
      this.failures += 1;
      if (!issue.retryable || this.failures >= 3) this.ignoredRuns.add(run.id);
      if (issue.code === 'run_not_found') await this.refresh();
    } finally {
      this.polling = false;
      this.schedule();
    }
  }
  async checkStatus() {
    this.ignoredRuns.clear();
    this.failures = 0;
    this.update({ error: null });
    await this.refresh();
  }
  async perform(action: RetrievalAction, retry = false) {
    if (!this.alive || this.state.busy || this.state.refreshing) return;
    if (this.journal && !this.journalLoaded) return;
    if (
      action !== 'purge' &&
      (!this.registered ||
        this.state.chargeReview ||
        this.state.statusStale ||
        this.state.purgePending ||
        !this.state.status?.availability.canStartRun ||
        this.state.status.availability.state !== 'available')
    )
      return;
    if (
      retry &&
      (!this.pending ||
        this.pending.action !== action ||
        (this.state.chargeReview && action !== 'purge'))
    )
      return;
    if (!retry && this.pending && this.pending.action !== action) {
      if (action !== 'purge') return;
      this.pending = null;
    }
    if (!this.pending)
      this.pending = {
        action,
        key: operationKey(),
        chargeReview: this.state.chargeReview,
      };
    if (!this.pending) return;
    const pending = this.pending;
    this.revision += 1;
    this.stopTimer();
    this.update({
      busy: action,
      pendingOperation: true,
      error: null,
      ...(action === 'purge'
        ? { results: [], searched: false, purgePending: true }
        : {}),
    });
    try {
      await this.journal?.write(pending);
      if (!this.alive) return;
      const accepted = await this.api[action](this.token, pending.key);
      if (!this.alive) return;
      await this.journal?.write(null);
      this.pending = null;
      const run: RetrievalRun = {
        id: accepted.agentRunId,
        agentId: 'media-retrieval',
        runType: actionRunType[action],
        status: 'pending',
        lifecycleStatus:
          accepted.lifecycleStatus as RetrievalRun['lifecycleStatus'],
        traceId: null,
        attempt: 1,
        failureCode: null,
        createdAt: null,
        finishedAt: null,
      };
      this.update({ run, events: [], busy: null, pendingOperation: false });
      await this.refresh();
    } catch (error) {
      if (!this.alive) return;
      const issue = this.failed(error);
      if (
        !issue.retryable &&
        error instanceof MiaoxunApiError &&
        error.status !== undefined &&
        error.status >= 400 &&
        error.status < 500 &&
        issue.code !== 'retrieval_unknown_charge_no_retry'
      ) {
        try {
          await this.journal?.write(null);
          this.pending = null;
          this.update({ pendingOperation: false });
        } catch (storageError) {
          this.failed(storageError);
        }
      } else if (issue.code === 'retrieval_unknown_charge_no_retry') {
        pending.chargeReview = true;
        await this.journal
          ?.write(pending)
          .catch(storageError => this.failed(storageError));
      }
      // An uncertain write never becomes a second automatically submitted action.
    } finally {
      this.update({ busy: null });
      this.schedule();
    }
  }
  retryAction() {
    if (this.pending) return this.perform(this.pending.action, true);
    return Promise.resolve();
  }
  hasRetryAction() {
    return Boolean(
      this.pending &&
        (this.pending.action === 'purge' || !this.state.chargeReview),
    );
  }
  async search(query: string, kind?: 'image' | 'video') {
    if (!canSearch(this.state, this.registered)) return;
    if (!query.trim() || query.trim().length > 240) {
      this.update({
        error: {
          code: 'validation',
          message: '请用 1–240 个字描述要找的素材。',
          retryable: false,
        },
      });
      return;
    }
    const normalizedQuery = query.trim();
    if (
      !this.pendingSearch ||
      this.pendingSearch.query !== normalizedQuery ||
      this.pendingSearch.kind !== kind
    ) {
      this.pendingSearch = {
        key: operationKey(),
        query: normalizedQuery,
        ...(kind ? { kind } : {}),
      };
    }
    const pendingSearch = this.pendingSearch;
    this.update({ busy: 'search', error: null, results: [], searched: false });
    try {
      const response = await this.api.search(
        this.token,
        {
          query: normalizedQuery,
          ...(kind ? { kind } : {}),
        },
        pendingSearch.key,
      );
      if (!this.alive || this.state.purgePending) return;
      this.pendingSearch = null;
      this.update({ results: response.results, searched: true });
      await this.refresh();
    } catch (error) {
      const issue = this.failed(error);
      const resultIsUncertain =
        error instanceof MiaoxunApiError &&
        (error.isNetworkError ||
          [
            'retrieval_request_in_progress',
            'retrieval_contract_invalid',
          ].includes(error.code || ''));
      if (!resultIsUncertain) this.pendingSearch = null;
      if (issue.code === 'retrieval_consent_required') await this.refresh();
    } finally {
      this.update({ busy: null });
    }
  }
  removeResult(id: string) {
    this.update({
      results: this.state.results.filter(item => item.mediaAssetId !== id),
      error: {
        code: 'asset_unavailable',
        message: '该素材已不可用，已从当前结果移除。',
        retryable: false,
      },
    });
    this.refresh();
  }
}

function retrievalIssueFromRun(run: RetrievalRun) {
  // Run failure messages are selected locally, never rendered from event payloads.
  const error = new MiaoxunApiError('Retrieval task failed', {
    code: run.failureCode || undefined,
    retryable: false,
  });
  return retrievalIssue(error);
}
