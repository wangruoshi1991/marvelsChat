import { MiaoxunApiError } from '../../services/api/http';
import {
  RetrievalAccepted,
  RetrievalEvents,
  RetrievalSearchResponse,
  RetrievalStatus,
} from './mediaRetrievalTypes';

const lifecycles = [
  'accepted',
  'queued',
  'running',
  'awaiting_user',
  'purging',
  'succeeded',
  'failed',
  'cancelled',
  'blocked',
  'idle',
];
const record = (value: unknown): value is Record<string, any> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));
const count = (value: unknown) =>
  Number.isSafeInteger(value) && Number(value) >= 0;
const nullableCount = (value: unknown) => value === null || count(value);
const text = (value: unknown) => typeof value === 'string' && value.length > 0;
const nullableText = (value: unknown) =>
  value === null || typeof value === 'string';
const exact = (value: Record<string, unknown>, keys: string[]) =>
  Object.keys(value).length === keys.length && keys.every(key => key in value);
const run = (value: unknown) =>
  record(value) &&
  text(value.id) &&
  value.agentId === 'media-retrieval' &&
  text(value.runType) &&
  ['success', 'error', 'pending'].includes(value.status) &&
  lifecycles.includes(value.lifecycleStatus) &&
  value.lifecycleStatus !== 'idle' &&
  nullableText(value.failureCode) &&
  count(value.attempt) &&
  nullableText(value.traceId) &&
  nullableText(value.createdAt) &&
  nullableText(value.finishedAt);

function valid(condition: boolean): asserts condition {
  if (!condition)
    throw new MiaoxunApiError('检索服务响应格式无效，请稍后检查状态。', {
      code: 'retrieval_contract_invalid',
    });
}

export function assertRetrievalStatus(
  value: unknown,
): asserts value is RetrievalStatus {
  valid(record(value));
  valid(
    typeof value.enabled === 'boolean' &&
      [null, 'media-retrieval-consent-v1'].includes(value.consentVersion),
  );
  valid(
    record(value.backfill) &&
      nullableText(value.backfill.agentRunId) &&
      lifecycles.includes(value.backfill.lifecycleStatus) &&
      ['indexedAssets', 'skippedAssets', 'totalAssets'].every(key =>
        count(value.backfill[key]),
      ),
  );
  valid(
    record(value.quota) &&
      nullableCount(value.quota.dailyRemaining) &&
      nullableCount(value.quota.monthlyRemainingFen),
  );
  valid(
    record(value.availability) &&
      ['available', 'temporarily-unavailable'].includes(
        value.availability.state,
      ) &&
      typeof value.availability.canStartRun === 'boolean' &&
      Array.isArray(value.availability.reasonCodes) &&
      value.availability.reasonCodes.every(
        (code: unknown) => typeof code === 'string',
      ),
  );
  valid(Array.isArray(value.recentRuns) && value.recentRuns.every(run));
}

export function assertRetrievalAccepted(
  value: unknown,
): asserts value is RetrievalAccepted {
  valid(
    record(value) &&
      text(value.agentRunId) &&
      lifecycles.includes(value.lifecycleStatus) &&
      value.lifecycleStatus !== 'idle' &&
      typeof value.reused === 'boolean',
  );
}

export function assertRetrievalSearch(
  value: unknown,
): asserts value is RetrievalSearchResponse {
  valid(
    record(value) &&
      exact(value, ['agentRunId', 'lifecycleStatus', 'method', 'results']) &&
      text(value.agentRunId) &&
      value.lifecycleStatus === 'succeeded' &&
      value.method === 'b7-product-baseline',
  );
  assertRetrievalResults(value.results);
}

export function assertRetrievalResults(
  value: unknown,
): asserts value is RetrievalSearchResponse['results'] {
  valid(
    Array.isArray(value) &&
      value.length <= 20 &&
      value.every(
        (item: unknown) =>
          record(item) &&
          exact(item, [
            'mediaAssetId',
            'kind',
            'matchedFrameTimestampMs',
            'summary',
            'matchReasons',
            'scoreBucket',
          ]) &&
          text(item.mediaAssetId) &&
          item.mediaAssetId.length <= 64 &&
          ['image', 'video'].includes(item.kind) &&
          (item.matchedFrameTimestampMs === null ||
            count(item.matchedFrameTimestampMs)) &&
          typeof item.summary === 'string' &&
          item.summary.length <= 160 &&
          Array.isArray(item.matchReasons) &&
          item.matchReasons.length <= 6 &&
          item.matchReasons.every(
            (reason: unknown) =>
              typeof reason === 'string' && reason.length <= 64,
          ) &&
          ['high', 'medium', 'low'].includes(item.scoreBucket),
      ),
  );
}

export function assertRetrievalEvents(
  value: unknown,
): asserts value is RetrievalEvents {
  valid(
    record(value) &&
      run(value.run) &&
      Array.isArray(value.events) &&
      value.events.every(
        (event: unknown) =>
          record(event) &&
          text(event.id) &&
          count(event.sequence) &&
          event.visibility === 'client' &&
          text(event.eventType) &&
          lifecycles.includes(event.lifecycleStatus) &&
          event.lifecycleStatus !== 'idle' &&
          record(event.payload) &&
          nullableText(event.createdAt),
      ),
  );
}
