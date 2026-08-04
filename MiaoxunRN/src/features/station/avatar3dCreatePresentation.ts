import { Avatar3DJobDTO } from '../../models/api';
import { textFor } from '../../shared/i18n';
import { Language } from '../session/useMiaoxunSession';

export type BodyShape = 'balanced' | 'slender' | 'athletic';
export type Outfit =
  | 'business'
  | 'smart_casual'
  | 'casual'
  | 'sport'
  | 'formal';

export type ScreenColors = {
  accent: string;
  background: string;
  border: string;
  danger: string;
  muted: string;
  soft: string;
  surface: string;
  text: string;
};

export const bodyShapeOptions = (language: Language) => [
  {
    label: textFor(language, '匀称', 'Balanced'),
    value: 'balanced' as const,
  },
  {
    label: textFor(language, '修长', 'Slender'),
    value: 'slender' as const,
  },
  {
    label: textFor(language, '运动感', 'Athletic'),
    value: 'athletic' as const,
  },
];

export const outfitOptions = (language: Language) => [
  {
    label: textFor(language, '商务休闲', 'Smart Casual'),
    value: 'smart_casual' as const,
  },
  {
    label: textFor(language, '日常休闲', 'Casual'),
    value: 'casual' as const,
  },
  {
    label: textFor(language, '商务', 'Business'),
    value: 'business' as const,
  },
  {
    label: textFor(language, '运动', 'Sport'),
    value: 'sport' as const,
  },
  {
    label: textFor(language, '正式', 'Formal'),
    value: 'formal' as const,
  },
];

export const formatCost = (fen: number) => `¥${(fen / 100).toFixed(2)}`;

export function jobStatusCopy(
  language: Language,
  job: Pick<Avatar3DJobDTO, 'errorCode' | 'status'>,
) {
  const map: Record<
    Avatar3DJobDTO['status'],
    { zh: string; en: string; zhBody: string; enBody: string }
  > = {
    queued_references: {
      zh: '正在准备参考视图',
      en: 'Preparing References',
      zhBody: '任务已进入队列。',
      enBody: 'Your task is queued.',
    },
    submitting_references: {
      zh: '正在提交参考视图',
      en: 'Submitting References',
      zhBody: '正在连接图像生成服务。',
      enBody: 'Connecting to the image service.',
    },
    processing_references: {
      zh: '正在生成四视图',
      en: 'Generating Four Views',
      zhBody: '生成完成后需要你确认人物外观。',
      enBody: 'You will review the appearance next.',
    },
    persisting_references: {
      zh: '正在保存参考视图',
      en: 'Saving References',
      zhBody: '正在安全保存四个视角。',
      enBody: 'Saving all four views securely.',
    },
    awaiting_reference_confirmation: {
      zh: '参考视图已生成',
      en: 'References Ready',
      zhBody: '确认后才会开始3D建模。',
      enBody: '3D modeling starts after confirmation.',
    },
    queued_3d: {
      zh: '3D建模已排队',
      en: '3D Modeling Queued',
      zhBody: '模型任务即将开始。',
      enBody: 'Model generation will start shortly.',
    },
    submitting_3d: {
      zh: '正在提交3D建模',
      en: 'Submitting 3D Model',
      zhBody: '正在连接3D建模服务。',
      enBody: 'Connecting to the 3D service.',
    },
    processing_3d: {
      zh: '正在生成3D模型',
      en: 'Generating 3D Model',
      zhBody: '可以离开此页面，任务会在后台继续。',
      enBody: 'You can leave while the task continues.',
    },
    persisting: {
      zh: '正在保存模型',
      en: 'Saving Model',
      zhBody: '模型即将出现在“我的模样”。',
      enBody: 'Your model will appear in My Look shortly.',
    },
    succeeded: {
      zh: '3D形象已生成',
      en: '3D Avatar Ready',
      zhBody: '模型已经保存到“我的模样”。',
      enBody: 'The model is now available in My Look.',
    },
    failed: {
      zh: '生成失败',
      en: 'Generation Failed',
      zhBody: job.errorCode ? `错误代码：${job.errorCode}` : '任务未能完成。',
      enBody: job.errorCode
        ? `Error: ${job.errorCode}`
        : 'The task could not be completed.',
    },
    quality_failed: {
      zh: '模型质量未通过',
      en: 'Quality Check Failed',
      zhBody: '本次结果未达到保存标准。',
      enBody: 'The result did not meet the save threshold.',
    },
    cancelled: {
      zh: '任务已取消',
      en: 'Task Cancelled',
      zhBody: '本次任务没有生成模型。',
      enBody: 'No model was created for this task.',
    },
    submission_unknown: {
      zh: '提交状态无法确认',
      en: 'Submission Unconfirmed',
      zhBody: '为避免重复生成，系统已停止本次任务。',
      enBody: 'The task stopped to prevent duplicate generation.',
    },
  };
  const copy = map[job.status];
  return {
    body: language === 'zh' ? copy.zhBody : copy.enBody,
    title: language === 'zh' ? copy.zh : copy.en,
  };
}

export function referenceViewLabel(
  language: Language,
  view: 'front' | 'left' | 'back' | 'right',
) {
  const labels = {
    front: textFor(language, '正面', 'Front'),
    left: textFor(language, '左侧', 'Left'),
    back: textFor(language, '背面', 'Back'),
    right: textFor(language, '右侧', 'Right'),
  };
  return labels[view];
}
