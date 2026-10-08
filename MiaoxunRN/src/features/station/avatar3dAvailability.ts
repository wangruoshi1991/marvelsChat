import { Avatar3DBootstrapDTO } from '../../models/api';
import { textFor } from '../../shared/i18n';
import { Language } from '../session/useMiaoxunSession';

export function avatar3dCreationUnavailableReason(
  bootstrap: Avatar3DBootstrapDTO | null,
  language: Language,
) {
  if (!bootstrap?.feature.enabled) {
    return textFor(
      language,
      '3D形象服务未启用',
      '3D avatar service is unavailable',
    );
  }
  if (!bootstrap.feature.generationAvailable) {
    return textFor(
      language,
      '3D建模服务暂时不可用',
      '3D generation is temporarily unavailable',
    );
  }
  if (bootstrap.quota.dailyRemaining <= 0) {
    return textFor(
      language,
      '今日生成次数已用完',
      'No generations remain today',
    );
  }
  if (bootstrap.quota.hasActiveJob) {
    return textFor(
      language,
      '当前形象正在生成中',
      'An avatar is already being generated',
    );
  }
  return null;
}
