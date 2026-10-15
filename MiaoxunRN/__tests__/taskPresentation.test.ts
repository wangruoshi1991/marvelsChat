import { assistContextSummary } from '../src/features/assist/assistRequest';
import { AIAssistObjectReference } from '../src/features/assist/aiAssistTypes';
import { taskPhaseLabel } from '../src/features/ai/taskPresentation';

const object: AIAssistObjectReference = {
  kind: 'ai-task',
  id: 'task-1',
  title: '检索旅行相册',
  scene: {
    page: 'miao.feed',
    label: '妙 · 任务动态',
    task: {
      id: 'task-1',
      goal: '检索旅行相册',
      status: 'running',
      phase: 'searching',
      agentId: 'album-manager',
      revision: 3,
      inputMessageId: 'message-1',
    },
  },
};

test('task context exposes the observed phase while distinguishing its snapshot from current progress', () => {
  const summary = assistContextSummary(object.scene, object, 'zh');
  expect(summary).toContain('选中时正在执行 · 正在查找素材');
  expect(summary).toContain('最新进展请查看任务详情');
  const english = assistContextSummary(object.scene, object, 'en');
  expect(english).toContain('Running · Searching media when selected');
  expect(english).toContain('Check task details for current progress');
});

test.each(['unrecognized-phase', 'constructor', '__proto__'])(
  'an unknown phase %s does not invent execution details in the request',
  phase => {
    const selected = {
      ...object,
      scene: {
        ...object.scene!,
        task: { ...object.scene!.task!, phase },
      },
    };
    expect(taskPhaseLabel(phase, 'zh')).toBeNull();
    const summary = assistContextSummary(selected.scene, selected, 'zh');
    expect(summary).toContain('选中时正在执行，最新进展请查看任务详情。');
    expect(summary).not.toContain(phase);
  },
);

test('a terminal snapshot does not present a stale active phase as ongoing work', () => {
  const selected: AIAssistObjectReference = {
    ...object,
    scene: {
      ...object.scene!,
      task: { ...object.scene!.task!, status: 'interrupted' },
    },
  };
  const summary = assistContextSummary(selected.scene, selected, 'zh');
  expect(summary).toContain('选中时执行中断，最新进展请查看任务详情。');
  expect(summary).not.toContain('正在查找素材');
});
