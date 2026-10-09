import { Alert } from 'react-native';
import { mediaRetrievalApi } from '../../services/api/mediaRetrievalApi';
import { textFor } from '../../shared/i18n';
import type { Language } from '../session/sessionTypes';

export async function albumAssistantConsent(token: string, language: Language) {
  const status = await mediaRetrievalApi.status(token);
  if (status.enabled && status.consentVersion === 'media-retrieval-consent-v1')
    return undefined;
  const agreed = await new Promise<boolean>(resolve => {
    Alert.alert(
      textFor(language, '使用相册 AI', 'Use Album AI'),
      textFor(
        language,
        '相册 AI 会将你已上传的图片、视频代表帧和检索描述发送给云端 AI，建立私有检索索引，帮助在对话中查找素材。手机相册访问不会自动上传其他照片。移除相册管理 Agent 会撤回此授权并清理索引，原素材保留。是否同意？',
        'Album AI sends uploaded images, representative video frames, and search descriptions to cloud AI to build your private search index. Photo-library access does not upload other photos. Removing the Album Manager revokes this permission and deletes the index while keeping your media. Do you agree?',
      ),
      [
        {
          text: textFor(language, '取消', 'Cancel'),
          style: 'cancel',
          onPress: () => resolve(false),
        },
        {
          text: textFor(language, '同意并使用', 'Agree and continue'),
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
  if (!agreed)
    throw new Error(
      textFor(language, '已取消相册 AI 授权', 'Album AI permission cancelled'),
    );
  return 'media-retrieval-consent-v1';
}
