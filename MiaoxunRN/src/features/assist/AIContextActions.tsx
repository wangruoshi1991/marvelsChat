import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import { Bot, Eye, MoreHorizontal, Pencil } from 'lucide-react-native';
import { textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import { Language } from '../session/sessionTypes';
import { AIAssistGestureSurface } from './AIAssistGestureSurface';
import { useAIAssist } from './AIAssistProvider';
import { AIAssistAction, AIAssistObjectReference } from './aiAssistTypes';

export function AIContextActions({
  object,
  palette,
  language,
  onOpen,
  openLabel,
  onEdit,
  editLabel,
  onMore,
  onPressOverride,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
  children,
}: {
  object: AIAssistObjectReference;
  palette: Palette;
  language: Language;
  onOpen: () => void;
  openLabel: string;
  onEdit?: () => void;
  editLabel?: string;
  onMore?: () => void;
  onPressOverride?: () => void;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children: React.ReactNode;
}) {
  const assist = useAIAssist();
  const actions: AIAssistAction[] = [
    {
      direction: 'up',
      label: openLabel,
      Icon: Eye,
      accent: palette.text,
      onSelect: onOpen,
    },
    {
      direction: 'right',
      label: textFor(language, '妙管家', 'Butler'),
      Icon: Bot,
      accent: palette.text,
      onSelect: selected => assist.askButler(selected),
    },
  ];
  if (onEdit)
    actions.push({
      direction: 'down',
      label: editLabel || textFor(language, '编辑', 'Edit'),
      Icon: Pencil,
      accent: palette.text,
      onSelect: onEdit,
    });
  if (onMore)
    actions.push({
      direction: 'left',
      label: textFor(language, '更多', 'More'),
      Icon: MoreHorizontal,
      accent: palette.text,
      onSelect: onMore,
    });
  return (
    <AIAssistGestureSurface
      object={object}
      actions={actions}
      palette={palette}
      onPress={onPressOverride || onOpen}
      accessibilityLabel={accessibilityLabel || object.title}
      accessibilityHint={
        accessibilityHint ||
        textFor(
          language,
          '轻点打开，长按查看内容操作',
          'Tap to open; hold for content actions',
        )
      }
      style={style}
      testID={testID}
    >
      {children}
    </AIAssistGestureSurface>
  );
}
