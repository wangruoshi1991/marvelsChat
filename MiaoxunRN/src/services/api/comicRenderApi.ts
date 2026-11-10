import {
  ComicRenderTaskDTO,
  parseComicRenderEventPage,
  parseComicRenderTask,
} from '../../models/comicRender';
import { assertComicRenderContract, comicRenderHeaders } from '../aiContract';
import { request } from './http';

const taskPath = (id: string) =>
  `/api/station/comic-render-tasks/${encodeURIComponent(id)}`;
const diaryPath = (id: string) =>
  `/api/station/comic-diaries/${encodeURIComponent(id)}/render-tasks`;
const invalid = () =>
  new Error('漫画画面任务响应与当前请求不一致，请刷新重试。');

export const comicRenderApi = {
  async create(token: string, comicDiaryId: string, idempotencyKey: string) {
    assertComicRenderContract(token);
    if (!idempotencyKey.trim()) throw new Error('漫画画面请求缺少幂等键。');
    const task = parseComicRenderTask(
      await request<unknown>(diaryPath(comicDiaryId), {
        method: 'POST',
        token,
        headers: comicRenderHeaders,
        body: { idempotencyKey },
      }),
    );
    if (task.comicDiaryId !== comicDiaryId) throw invalid();
    return task;
  },

  async list(token: string, comicDiaryId: string) {
    assertComicRenderContract(token);
    const value = await request<unknown>(diaryPath(comicDiaryId), {
      token,
      headers: comicRenderHeaders,
    });
    if (!Array.isArray(value) || value.length > 50) throw invalid();
    const tasks = value.map(parseComicRenderTask);
    if (
      tasks.some(task => task.comicDiaryId !== comicDiaryId) ||
      new Set(tasks.map(task => task.id)).size !== tasks.length
    )
      throw invalid();
    return tasks;
  },

  async get(token: string, taskId: string) {
    assertComicRenderContract(token);
    const task = parseComicRenderTask(
      await request<unknown>(taskPath(taskId), {
        token,
        headers: comicRenderHeaders,
      }),
    );
    if (task.id !== taskId) throw invalid();
    return task;
  },

  async events(token: string, taskId: string, afterSequence = 0) {
    assertComicRenderContract(token);
    if (!Number.isSafeInteger(afterSequence) || afterSequence < 0)
      throw new Error('漫画画面进展游标无效。');
    const limit = 100;
    const value = await request<unknown>(
      `${taskPath(
        taskId,
      )}/events?afterSequence=${afterSequence}&limit=${limit}`,
      { token, headers: comicRenderHeaders },
    );
    return parseComicRenderEventPage(value, taskId, afterSequence, limit);
  },

  async cancel(token: string, task: ComicRenderTaskDTO) {
    assertComicRenderContract(token);
    if (task.status !== 'queued' || !task.allowedActions.includes('cancel'))
      throw new Error('只能取消尚未开始的漫画画面任务。');
    const result = parseComicRenderTask(
      await request<unknown>(`${taskPath(task.id)}/cancel`, {
        method: 'POST',
        token,
        headers: comicRenderHeaders,
        body: { revision: task.revision },
      }),
    );
    if (
      result.id !== task.id ||
      result.comicDiaryId !== task.comicDiaryId ||
      result.revision < task.revision
    )
      throw invalid();
    return result;
  },
};
