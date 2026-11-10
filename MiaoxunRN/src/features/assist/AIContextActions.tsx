import React from 'react';
import { GestureResponderEvent, StyleProp, ViewStyle } from 'react-native';
import { Bot, Eye, MoreHorizontal, Pencil } from 'lucide-react-native';
import { textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import { Language } from '../session/sessionTypes';
import { AIAssistGestureSurface } from './AIAssistGestureSurface';
import { useAIAssist } from './AIAssistProvider';
import { AIAssistAction, AIAssistObjectReference } from './aiAssistTypes';

type AIContextActionsProps = {
  object: AIAssistObjectReference;
  palette: Palette;
  language: Language;
  onOpen: () => void;
  openLabel: string;
  onEdit?: () => void;
  editLabel?: string;
  onMore?: () => void;
  onPressOverride?: () => void;
  accessible?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  onTouchStart?: (event: GestureResponderEvent) => void;
  onTouchMove?: (event: GestureResponderEvent) => void;
  onTouchEnd?: (event: GestureResponderEvent) => void;
  onTouchCancel?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children: React.ReactNode;
};

export type AIContextActionsHandle = { openMenu: () => void };

export const AIContextActions = React.forwardRef<
  AIContextActionsHandle,
  AIContextActionsProps
>(function AIContextActionsComponent(
  {
    object,
    palette,
    language,
    onOpen,
    openLabel,
    onEdit,
    editLabel,
    onMore,
    onPressOverride,
    accessible = true,
    accessibilityLabel,
    accessibilityHint,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
    style,
    testID,
    children,
  },
  ref,
) {
  const assist = useAIAssist();
  // A tapped menu is independent from the surrounding long-press gesture.
  // Its touch-end/cancel events must not release or dismiss this new menu.
  const menuSourceId = React.useId();
  const { dismiss, routeKey } = assist;
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
  React.useImperativeHandle(ref, () => ({
    openMenu: () =>
      assist.open({
        object,
        actions,
        sourceId: menuSourceId,
        hapticOnOpen: true,
      }),
  }));
  React.useEffect(
    () => () => dismiss(menuSourceId),
    [dismiss, menuSourceId, routeKey],
  );
  return (
    <AIAssistGestureSurface
      object={object}
      actions={actions}
      palette={palette}
      onPress={onPressOverride || onOpen}
      accessible={accessible}
      accessibilityLabel={accessibilityLabel || object.title}
      accessibilityHint={
        accessibilityHint ||
        textFor(
          language,
          '轻点打开，长按查看内容操作',
          'Tap to open; hold for content actions',
        )
      }
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
      style={style}
      testID={testID}
    >
      {children}
    </AIAssistGestureSurface>
  );
});
