import { ModuleDTO } from '../../models/api';
import { textFor } from '../../shared/i18n';
import { Language } from '../session/useMiaoxunSession';

const pendingStatusByKey: Record<string, { zh: string; en: string }> = {
  music: { zh: '音乐待接入', en: 'Music pending' },
  notifications: { zh: '偏好待接入', en: 'Preferences pending' },
  createGroup: { zh: '群组待接入', en: 'Groups pending' },
  files: { zh: '文件待接入', en: 'Files pending' },
};

export function stationModuleStatusText(
  language: Language,
  key: string,
  module?: ModuleDTO,
) {
  if (!module) {
    return textFor(language, '同步中', 'Syncing');
  }

  if (module.status === 'connected') {
    return module.needs?.length
      ? textFor(language, '基础已接入', 'Base connected')
      : textFor(language, '已接入', 'Connected');
  }

  if (module.status === 'pending') {
    const mapped = pendingStatusByKey[key];
    return mapped
      ? textFor(language, mapped.zh, mapped.en)
      : textFor(language, '待接入', 'Pending');
  }

  return textFor(language, '同步中', 'Syncing');
}
