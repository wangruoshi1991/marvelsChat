import { MiaoxunApiError } from '../../services/api/http';
import {
  RetrievalEvent,
  RetrievalIssue,
  RetrievalPhase,
  RetrievalState,
  RetrievalStatus,
} from './mediaRetrievalTypes';

export const terminalRun = (status: string) =>
  ['succeeded', 'failed', 'cancelled', 'blocked'].includes(status);
export const initialRetrievalState = (): RetrievalState => ({
  status: null,
  results: [],
  searched: false,
  busy: null,
  refreshing: false,
  statusStale: true,
  error: null,
  run: null,
  events: [],
  purgePending: false,
  chargeReview: false,
  pendingOperation: false,
});

export function phaseFor(
  state: RetrievalState,
  registered: boolean,
): RetrievalPhase {
  if (state.purgePending) return 'purging';
  if (state.busy === 'enable') return 'enable';
  if (!state.status) return state.error ? 'blocked' : 'loading';
  if (state.statusStale) return 'blocked';
  if (
    state.chargeReview ||
    !registered ||
    !state.status.availability.canStartRun ||
    state.status.availability.state !== 'available'
  )
    return 'blocked';
  if (!state.status.enabled) return 'disabled';
  if (state.run && !terminalRun(state.run.lifecycleStatus)) return 'indexing';
  if (state.run && ['failed', 'blocked'].includes(state.run.lifecycleStatus))
    return 'blocked';
  return 'ready';
}

export function canSearch(state: RetrievalState, registered: boolean) {
  return Boolean(
    state.status?.enabled &&
      state.status.consentVersion === 'media-retrieval-consent-v1' &&
      registered &&
      state.status.availability.canStartRun &&
      state.status.availability.state === 'available' &&
      !state.purgePending &&
      !state.chargeReview &&
      !state.busy &&
      !state.pendingOperation &&
      !state.refreshing &&
      !state.statusStale &&
      (phaseFor(state, registered) === 'ready' ||
        (phaseFor(state, registered) === 'indexing' &&
          state.status.backfill.indexedAssets > 0)),
  );
}

export const statusRun = (status: RetrievalStatus) =>
  status.recentRuns.find(run => run.runType !== 'media-search') || null;

export function reconcileRetrievalStatus(
  state: RetrievalState,
  status: RetrievalStatus,
): Partial<RetrievalState> {
  let run =
    state.run &&
    !terminalRun(state.run.lifecycleStatus) &&
    !status.recentRuns.some(item => item.id === state.run?.id)
      ? state.run
      : statusRun(status);
  // Events can lead a status snapshot. A terminal task never returns to running.
  if (
    run &&
    state.run?.id === run.id &&
    terminalRun(state.run.lifecycleStatus) &&
    !terminalRun(run.lifecycleStatus)
  )
    run = state.run;
  const purge = status.recentRuns.find(item => item.runType === 'media-purge');
  const purgeConfirmed =
    !state.pendingOperation &&
    !status.enabled &&
    purge?.lifecycleStatus === 'succeeded' &&
    (run?.runType !== 'media-purge' || run.id === purge.id);
  const purgePending =
    (state.purgePending && !purgeConfirmed) ||
    (!status.enabled &&
      Boolean(purge && purge.lifecycleStatus !== 'succeeded'));
  const chargeReview =
    state.chargeReview ||
    status.recentRuns.some(
      item => item.failureCode === 'retrieval_unknown_charge_no_retry',
    );
  return {
    status,
    statusStale: false,
    run,
    purgePending,
    chargeReview,
    ...(state.error?.code === 'network' ? { error: null } : {}),
    ...(chargeReview
      ? {
          error: {
            code: 'retrieval_unknown_charge_no_retry',
            message: '上次任务需要管理员确认，目前已暂停检索，请勿重复提交。',
            retryable: false,
          },
        }
      : {}),
  };
}

export function appendEvents(
  previous: RetrievalEvent[],
  incoming: RetrievalEvent[],
) {
  const ids = new Set(previous.map(event => event.id));
  const lastSequence = previous.reduce(
    (last, event) => Math.max(last, event.sequence),
    0,
  );
  return [
    ...previous,
    ...[...incoming]
      .sort((a, b) => a.sequence - b.sequence)
      .filter(event => {
        if (event.sequence <= lastSequence || ids.has(event.id)) return false;
        ids.add(event.id);
        return true;
      }),
  ];
}

const messages: Record<string, string> = {
  retrieval_not_enabled: '找素材暂未开放，请稍后查看。',
  retrieval_consent_required: '请先同意并启用私有素材检索。',
  retrieval_budget_exhausted: '当前检索额度已用完，请稍后再试。',
  retrieval_service_unavailable: '检索服务暂不可用，请稍后检查状态。',
  retrieval_request_invalid: '请检查输入，用 1–240 个字描述要找的素材。',
  retrieval_request_in_progress: '本次检索仍在处理中，请稍后重试。',
  asset_not_indexable: '该素材暂时无法检索，请检查素材状态。',
  run_not_found: '当前任务不可用，已停止跟踪，请刷新状态。',
  retrieval_policy_unverifiable: '暂时无法处理这段描述，请换一种方式描述画面。',
  retrieval_provider_transport_unavailable:
    '检索服务连接暂时中断，请稍后再试。',
  retrieval_purge_incomplete: '清理仍待确认，完成前无法检索。',
  retrieval_unknown_charge_no_retry:
    '上次任务需要管理员确认，目前已暂停检索，请勿重复提交。',
  retrieval_temporary_cleanup_pending: '素材清理处理中，请稍后检查状态。',
  retrieval_index_enqueue_failed: '素材尚未进入索引队列，可稍后手动补建索引。',
  retrieval_repository_write_failed: '未能确认操作结果，请先刷新状态。',
  retrieval_job_lease_lost: '任务正在恢复，请稍后检查状态。',
  retrieval_staging_missing: '索引数据待恢复，请稍后检查状态。',
  retrieval_contract_invalid: '检索服务响应格式异常，请稍后检查状态。',
  retrieval_local_storage: '无法读取或保存本次操作，请稍后刷新状态后重试。',
};

export function retrievalIssue(error: unknown): RetrievalIssue {
  if (!(error instanceof MiaoxunApiError))
    return {
      code: 'unexpected',
      message: '暂时无法完成操作，请稍后再试。',
      retryable: false,
    };
  if (error.status === 401)
    return {
      code: 'unauthorized',
      message: '登录已失效，请重新登录。',
      retryable: false,
    };
  if (error.isNetworkError)
    return {
      code: 'network',
      message: '网络连接中断，请检查网络后再试。',
      retryable: true,
    };
  return {
    code: error.code || 'unknown',
    message: messages[error.code || ''] || '检索服务暂不可用，请稍后检查状态。',
    retryable: error.retryable === true,
  };
}

export const matchReasonLabels: Record<string, string> = {
  'visual-vector': '画面相似',
  'identity-caption-exact': '描述匹配',
  'identity-tag-exact': '标签匹配',
  'identity-ocr-exact': '画面文字匹配',
  'caption-match': '描述匹配',
  'tag-match': '标签匹配',
  'ocr-match': '画面文字匹配',
  'metadata-match': '素材信息匹配',
};

export function eventMessage(event?: RetrievalEvent) {
  if (!event) return '';
  const labels: Record<string, string> = {
    accepted: '任务已接收',
    queued: '正在排队',
    started: '正在处理素材',
    'job-started': '正在处理素材',
    'job-succeeded': '素材索引已更新',
    completed: '任务状态已更新',
    'recovery-queued': '任务正在恢复',
    'purge-started': '正在清理检索数据',
  };
  return labels[event.eventType] || '状态已更新';
}
