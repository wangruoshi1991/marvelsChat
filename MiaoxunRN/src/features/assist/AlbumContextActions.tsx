import React, { useEffect, useRef } from 'react';
import { Alert, Share } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { StationAlbumDTO } from '../../models/api';
import { appErrorText, textFor } from '../../shared/i18n';
import { AIContextActions } from './AIContextActions';
import { AIAssistScene } from './aiAssistTypes';
import { useAIAssist } from './AIAssistProvider';

type Props = Omit<
  React.ComponentProps<typeof AIContextActions>,
  'object' | 'openLabel' | 'editLabel' | 'onMore'
> & {
  album: StationAlbumDTO;
  scene: AIAssistScene;
};

// An album has the same actions wherever it is shown. Only its origin changes.
export function AlbumContextActions({ album, scene, ...props }: Props) {
  const assist = useAIAssist();
  const alive = useRef(true);
  const route = useRef(assist.routeKey);
  route.current = assist.routeKey;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const { language } = props;
  const text = [album.title.trim(), album.description?.trim()]
    .filter(Boolean)
    .join('\n\n');
  return (
    <AIContextActions
      {...props}
      object={{
        kind: 'station-album',
        id: album.id,
        title: album.title,
        scene,
      }}
      openLabel={textFor(language, '查看相册', 'View album')}
      editLabel={textFor(language, '编辑相册', 'Edit album')}
      onMore={() => {
        assist.dismiss();
        const openedRoute = route.current;
        const isCurrent = () => alive.current && route.current === openedRoute;
        Alert.alert(album.title, undefined, [
          {
            text: textFor(language, '分享文字', 'Share text'),
            onPress: () => {
              if (!isCurrent()) return;
              Share.share({ message: text }).catch(error => {
                if (!isCurrent()) return;
                Alert.alert(
                  textFor(language, '分享失败', 'Sharing failed'),
                  appErrorText(
                    language,
                    error,
                    '无法打开系统分享，请重试。',
                    'Unable to open sharing. Try again.',
                  ),
                );
              });
            },
          },
          {
            text: textFor(language, '复制文字', 'Copy text'),
            onPress: () => {
              if (isCurrent()) Clipboard.setString(text);
            },
          },
          { text: textFor(language, '取消', 'Cancel'), style: 'cancel' },
        ]);
      }}
    />
  );
}
