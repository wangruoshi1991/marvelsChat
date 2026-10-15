import { AITaskStatus } from '../../models/aiTask';
import { textFor } from '../../shared/i18n';
import { Language } from '../session/sessionTypes';

const statusLabels: Record<AITaskStatus, [string, string]> = {
  queued: ['已排队', 'Queued'],
  running: ['正在执行', 'Running'],
  awaiting_confirmation: ['等待确认', 'Awaiting confirmation'],
  succeeded: ['已完成', 'Completed'],
  failed: ['执行失败', 'Failed'],
  cancelled: ['已取消', 'Cancelled'],
  interrupted: ['执行中断', 'Interrupted'],
};

// Only phases with a defined progress description add detail to the status.
// Unrecognized phases must not imply work the runtime did not report.
const phaseLabels = new Map<string, [string, string]>([
  ['validating', ['正在核对引用与授权', 'Checking references and access']],
  ['generating', ['正在生成内容', 'Generating content']],
  ['searching', ['正在查找素材', 'Searching media']],
]);

export function taskStatusLabel(status: AITaskStatus, language: Language) {
  return textFor(language, ...statusLabels[status]);
}

export function taskPhaseLabel(
  phase: string,
  language: Language,
): string | null {
  const labels = phaseLabels.get(phase);
  return labels ? textFor(language, ...labels) : null;
}
