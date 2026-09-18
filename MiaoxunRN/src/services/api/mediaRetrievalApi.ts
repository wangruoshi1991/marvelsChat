import { longRequestTimeoutMs, request } from './http';
import {
  assertRetrievalAccepted,
  assertRetrievalEvents,
  assertRetrievalSearch,
  assertRetrievalStatus,
} from '../../features/media-retrieval/mediaRetrievalContract';

const base = '/api/station/media-retrieval';
const keyHeaders = (key: string) => {
  if (!/^[A-Za-z0-9._-]{8,160}$/.test(key))
    throw new Error('无效的检索操作标识。');
  return { 'Idempotency-Key': key };
};

export const mediaRetrievalApi = {
  async status(token: string) {
    const data = await request<unknown>(`${base}/status`, { token });
    assertRetrievalStatus(data);
    return data;
  },
  async enable(token: string, key: string) {
    const data = await request<unknown>(`${base}/enable`, {
      method: 'POST',
      token,
      headers: keyHeaders(key),
      body: { consentVersion: 'media-retrieval-consent-v1' },
    });
    assertRetrievalAccepted(data);
    return data;
  },
  async reindex(token: string, key: string) {
    const data = await request<unknown>(`${base}/reindex`, {
      method: 'POST',
      token,
      headers: keyHeaders(key),
      body: { scope: 'stale' },
    });
    assertRetrievalAccepted(data);
    return data;
  },
  async purge(token: string, key: string) {
    const data = await request<unknown>(`${base}/index`, {
      method: 'DELETE',
      token,
      headers: keyHeaders(key),
    });
    assertRetrievalAccepted(data);
    return data;
  },
  async search(
    token: string,
    input: { query: string; kind?: 'image' | 'video' },
    key: string,
  ) {
    const query = input.query.trim();
    if (!query || query.length > 240)
      throw new Error('请用 1–240 个字描述要找的素材。');
    const data = await request<unknown>(`${base}/search`, {
      method: 'POST',
      token,
      headers: keyHeaders(key),
      body: { ...input, query, limit: 20 },
      timeoutMs: longRequestTimeoutMs,
    });
    assertRetrievalSearch(data);
    return data;
  },
  async events(token: string, runId: string, afterSequence: number) {
    const data = await request<unknown>(
      `/api/agent-runs/${encodeURIComponent(
        runId,
      )}/events?afterSequence=${afterSequence}`,
      { token },
    );
    assertRetrievalEvents(data);
    return data;
  },
};
