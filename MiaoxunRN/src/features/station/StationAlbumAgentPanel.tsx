import React from 'react';
import { Text } from 'react-native';
import { textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { Language } from '../session/useMiaoxunSession';
import { StationModule } from './StationHomeModules';

export function StationAlbumAgentPanel({
  palette,
  language,
  onOpenConversation,
}: {
  palette: Palette;
  language: Language;
  onOpenConversation: () => void;
}) {
  return (
    <StationModule
      palette={palette}
      title={textFor(language, '相册管理', 'Album Manager')}
      action={textFor(language, '开始对话', 'Chat')}
      onAction={onOpenConversation}
    >
      <Text
        style={[styles.stationAgentLoopBody, { color: palette.secondaryText }]}
      >
        {textFor(
          language,
          '告诉相册助手你想找什么图片或视频，也可以继续补充条件、限定相册。结果会直接显示在对话中。',
          'Describe an image or video, refine your request, or choose an album. Results appear in the conversation.',
        )}
      </Text>
    </StationModule>
  );
}
