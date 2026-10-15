import { AITaskDTO, AITaskOperation, assertAITask } from '../../models/aiTask';
import { request } from './http';
import {
  aiContractHeaders,
  assertAIContract,
  assertSiteDocumentContract,
  siteDocumentHeaders,
} from '../aiContract';

export type AITaskEvent = {
  sequence: number;
  status: AITaskDTO['status'];
  phase: string;
  errorCode?: string;
  createdAt: string;
};

export type AITaskEventPage = {
  task: AITaskDTO;
  events: AITaskEvent[];
  hasMore: boolean;
  nextSequence: number;
};

function readEventPage(
  value: unknown,
  taskId: string,
  afterSequence: number,
  limit: number,
): AITaskEventPage {
  const invalid = () =>
    new Error('任务进展数据格式不受支持，请更新应用或联系支持。');
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw invalid();
  const page = value as AITaskEventPage;
  assertAITask(page.task);
  if (
    page.task.id !== taskId ||
    page.task.revision < afterSequence ||
    !Array.isArray(page.events) ||
    page.events.length > limit ||
    typeof page.hasMore !== 'boolean' ||
    !Number.isInteger(page.nextSequence)
  )
    throw invalid();
  const phases: Record<AITaskDTO['status'], string[]> = {
    queued: ['queued'],
    running: ['validating', 'generating', 'searching'],
    awaiting_confirmation: ['awaiting_confirmation'],
    succeeded: ['completed'],
    failed: ['failed'],
    cancelled: ['cancelled'],
    interrupted: ['interrupted'],
  };
  let previous = afterSequence;
  for (const event of page.events) {
    if (
      !event ||
      typeof event !== 'object' ||
      Array.isArray(event) ||
      Object.keys(event).some(
        key =>
          !['sequence', 'status', 'phase', 'errorCode', 'createdAt'].includes(
            key,
          ),
      ) ||
      !Number.isInteger(event.sequence) ||
      event.sequence !== previous + 1 ||
      event.sequence > page.task.revision ||
      !Object.prototype.hasOwnProperty.call(phases, event.status) ||
      !phases[event.status]?.includes(event.phase) ||
      typeof event.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(event.createdAt)) ||
      (event.errorCode !== undefined &&
        (typeof event.errorCode !== 'string' ||
          !/^[A-Za-z][A-Za-z0-9._-]{0,99}$/.test(event.errorCode))) ||
      (event.sequence === page.task.revision &&
        (event.status !== page.task.status || event.phase !== page.task.phase))
    )
      throw invalid();
    previous = event.sequence;
  }
  if (
    page.nextSequence !== previous ||
    (page.hasMore && page.events.length === 0)
  )
    throw invalid();
  return page;
}

export const aiTaskApi = {
  async list(
    token: string,
    filter: { threadId?: string; kind?: AITaskDTO['kind'] } = {},
  ) {
    assertAIContract(token);
    const query = ['limit=30'];
    if (filter.threadId)
      query.push(`threadId=${encodeURIComponent(filter.threadId)}`);
    if (filter.kind) query.push(`kind=${filter.kind}`);
    const tasks = await request<unknown>(`/api/tasks?${query.join('&')}`, {
      token,
      headers: aiContractHeaders,
    });
    if (!Array.isArray(tasks)) throw new Error('任务列表格式不受支持。');
    tasks.forEach(assertAITask);
    return tasks as AITaskDTO[];
  },
  async get(token: string, id: string) {
    assertAIContract(token);
    const task = await request<unknown>(
      `/api/tasks/${encodeURIComponent(id)}`,
      { token, headers: aiContractHeaders },
    );
    assertAITask(task);
    return task;
  },
  async events(token: string, id: string, afterSequence = 0) {
    assertAIContract(token);
    if (!Number.isInteger(afterSequence) || afterSequence < 0)
      throw new Error('任务进展游标无效。');
    const limit = 100;
    const page = await request<unknown>(
      `/api/tasks/${encodeURIComponent(
        id,
      )}/events?afterSequence=${afterSequence}&limit=${limit}`,
      { token, headers: aiContractHeaders },
    );
    return readEventPage(page, id, afterSequence, limit);
  },
  async decide(token: string, task: AITaskDTO, operation: AITaskOperation) {
    assertAIContract(token);
    if (operation === 'confirm') assertSiteDocumentContract(token);
    const result = await request<unknown>(
      `/api/tasks/${encodeURIComponent(task.id)}/decision`,
      {
        token,
        method: 'POST',
        headers:
          operation === 'confirm' ? siteDocumentHeaders : aiContractHeaders,
        body: {
          revision: task.revision,
          operation,
          ...(task.approval ? { approvalId: task.approval.id } : {}),
        },
      },
    );
    assertAITask(result);
    return result;
  },
};
