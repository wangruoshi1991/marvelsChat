import { mediaRetrievalApi } from '../../services/api/mediaRetrievalApi';
import { textFor } from '../../shared/i18n';
import type { Language } from '../session/sessionTypes';

export const albumAIConsentVersion = 'media-retrieval-consent-v1' as const;
export type AlbumAIConsentVersion = typeof albumAIConsentVersion;

export function albumAssistantDisclosure(language: Language) {
  return textFor(
    language,
    '相册 AI 会将你已上传的图片、视频代表帧和检索描述发送给云端 AI 分析，建立私有检索索引。此授权适用于已上传素材，不只限于本次选中的相册。手机相册访问权限独立，不会自动上传其他照片。你可以随时移除相册管理 Agent，撤回授权并清理索引，原素材保留。',
    'Album AI sends uploaded images, representative video frames, and search descriptions to cloud AI for analysis and a private search index. This applies to uploaded media, not only the album selected for a task. Phone photo-library permission is separate and does not upload other photos automatically. You can remove Album Manager at any time to revoke consent and delete the index while keeping your original media.',
  );
}

export async function albumAssistantConsentRequirement(
  token: string,
  language: Language,
  isCurrent: () => boolean,
) {
  const assertCurrent = () => {
    if (!isCurrent())
      throw new Error(
        textFor(
          language,
          '账号已切换或操作已取消，请重新发起相册 AI 授权。',
          'Account changed or the operation was cancelled. Start Album AI authorization again.',
        ),
      );
  };
  assertCurrent();
  const status = await mediaRetrievalApi.status(token);
  assertCurrent();
  if (status.enabled && status.consentVersion === albumAIConsentVersion)
    return undefined;
  return albumAIConsentVersion;
}

// The shared Agent confirmation owns the single user decision. Recheck consent
// before PATCH so a revoked existing consent cannot be silently renewed.
export async function albumAssistantConsent(
  token: string,
  language: Language,
  isCurrent: () => boolean,
  confirmedVersion?: AlbumAIConsentVersion,
) {
  const required = await albumAssistantConsentRequirement(
    token,
    language,
    isCurrent,
  );
  if (required && confirmedVersion !== required)
    throw new Error(
      textFor(
        language,
        '相册 AI 授权状态已变化，请重新查看范围及云端使用说明后确认。',
        'Album AI consent changed. Review the access scopes and cloud use before confirming again.',
      ),
    );
  return required;
}
