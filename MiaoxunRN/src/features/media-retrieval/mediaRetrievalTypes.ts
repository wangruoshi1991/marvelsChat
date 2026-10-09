export type RetrievalLifecycle =
  | 'accepted'
  | 'queued'
  | 'running'
  | 'awaiting_user'
  | 'purging'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'blocked'
  | 'idle';

export type RetrievalRun = {
  id: string;
  agentId: 'media-retrieval';
  runType: string;
  status: 'success' | 'error' | 'pending';
  lifecycleStatus: Exclude<RetrievalLifecycle, 'idle'>;
  traceId: string | null;
  attempt: number;
  failureCode: string | null;
  createdAt: string | null;
  finishedAt: string | null;
};

export type RetrievalStatus = {
  enabled: boolean;
  consentVersion: 'media-retrieval-consent-v1' | null;
  backfill: {
    agentRunId: string | null;
    lifecycleStatus: RetrievalLifecycle;
    indexedAssets: number;
    skippedAssets: number;
    totalAssets: number;
  };
  quota: { dailyRemaining: number | null; monthlyRemainingFen: number | null };
  availability: {
    state: 'available' | 'temporarily-unavailable';
    canStartRun: boolean;
    reasonCodes: string[];
  };
  recentRuns: RetrievalRun[];
};

export type RetrievalAccepted = {
  agentRunId: string;
  lifecycleStatus: RetrievalLifecycle;
  reused: boolean;
  backfill?: { totalAssets: number; enqueued: number; reused: number };
  jobs?: { totalAssets: number; enqueued: number; reused: number };
};

export type MediaRetrievalSearchResult = {
  mediaAssetId: string;
  kind: 'image' | 'video';
  matchedFrameTimestampMs: number | null;
  summary: string;
  matchReasons: string[];
  scoreBucket: 'high' | 'medium' | 'low';
};

export type RetrievalSearchResponse = {
  agentRunId: string;
  lifecycleStatus: 'succeeded';
  method: 'b7-product-baseline';
  results: MediaRetrievalSearchResult[];
};

export type RetrievalEvent = {
  id: string;
  sequence: number;
  lifecycleStatus: Exclude<RetrievalLifecycle, 'idle'>;
  eventType: string;
  visibility: 'client';
  payload: Record<string, unknown>;
  createdAt: string | null;
};

export type RetrievalEvents = { run: RetrievalRun; events: RetrievalEvent[] };
export type RetrievalAction = 'enable' | 'reindex' | 'purge';
export type RetrievalPhase =
  | 'loading'
  | 'disabled'
  | 'enable'
  | 'indexing'
  | 'ready'
  | 'blocked'
  | 'purging';
export type RetrievalIssue = {
  message: string;
  retryable: boolean;
  code: string;
};
export type RetrievalState = {
  status: RetrievalStatus | null;
  results: MediaRetrievalSearchResult[];
  searched: boolean;
  busy: RetrievalAction | 'search' | null;
  refreshing: boolean;
  statusStale: boolean;
  error: RetrievalIssue | null;
  run: RetrievalRun | null;
  events: RetrievalEvent[];
  purgePending: boolean;
  chargeReview: boolean;
  pendingOperation: boolean;
};
