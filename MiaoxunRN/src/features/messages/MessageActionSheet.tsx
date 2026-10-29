import React from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  ContactRound,
  MessageCirclePlus,
  UsersRound,
} from 'lucide-react-native';

import { textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { IconComponent } from '../../shared/ui';
import { Language } from '../session/useMiaoxunSession';
import { isXunPalette } from '../../shared/xunPalette';

export function resolveMessageMenuAnchor(
  xunTheme: boolean,
  anchorTop?: number,
  pullHintVisible = false,
): number | undefined {
  if (!xunTheme || !pullHintVisible || anchorTop === undefined)
    return anchorTop;
  return Math.max(46, anchorTop - 23);
}

export function MessageActionSheet({
  palette,
  anchorTop,
  pullHintVisible = false,
  language,
  onBack,
  onStartChat,
  onCreateGroup,
  onScanQRCode,
}: {
  palette: Palette;
  anchorTop?: number;
  pullHintVisible?: boolean;
  language: Language;
  onBack: () => void;
  onStartChat: () => void;
  onCreateGroup: () => void;
  onScanQRCode: () => void;
}) {
  const xunTheme = isXunPalette(palette);
  // The V15 prototype omits the pull hint while state 04 is open. The
  // native list keeps that hint mounted under the transparent modal, so
  // compensate for its 23pt height when anchoring the menu to the plus.
  const resolvedAnchorTop = resolveMessageMenuAnchor(
    xunTheme,
    anchorTop,
    pullHintVisible,
  );
  return (
    <View style={[styles.messageMenuOverlay, styles.pointerEventsBoxNone]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={textFor(language, '关闭新建菜单', 'Close new menu')}
        style={[
          styles.actionSheetBackdrop,
          xunTheme && styles.xunMessageMenuBackdrop,
        ]}
        onPress={onBack}
      />
      <View
        style={[
          xunTheme ? styles.xunMessageMenu : styles.messageMenu,
          resolvedAnchorTop !== undefined && { top: resolvedAnchorTop },
          {
            backgroundColor: xunTheme ? palette.surface : palette.background,
            borderColor: palette.border,
            shadowColor: palette.shadow,
          },
        ]}
      >
        <View
          style={[
            styles.messageMenuArrow,
            xunTheme && styles.xunMessageMenuArrow,
            styles.pointerEventsNone,
            {
              backgroundColor: xunTheme ? palette.surface : palette.background,
              borderLeftColor: palette.border,
              borderTopColor: palette.border,
            },
          ]}
        />
        <ActionSheetRow
          icon={MessageCirclePlus}
          symbol="dot"
          palette={palette}
          title={textFor(language, '发起聊天', 'Start chat')}
          onPress={onStartChat}
          xunTheme={xunTheme}
        />
        <ActionSheetRow
          icon={UsersRound}
          symbol="phone"
          palette={palette}
          title={textFor(language, '创建群聊', 'Create group')}
          onPress={onCreateGroup}
          xunTheme={xunTheme}
        />
        <ActionSheetRow
          icon={ContactRound}
          symbol="card"
          palette={palette}
          title={textFor(language, '扫描名片', 'Scan card')}
          onPress={onScanQRCode}
          xunTheme={xunTheme}
          last
        />
      </View>
    </View>
  );
}

function ActionSheetRow({
  icon: Icon,
  symbol,
  palette,
  title,
  onPress,
  xunTheme,
  last,
}: {
  icon: IconComponent;
  symbol?: XunMenuSymbol;
  palette: Palette;
  title: string;
  onPress?: () => void;
  xunTheme?: boolean;
  last?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={[
        styles.actionSheetRow,
        xunTheme && styles.xunActionSheetRow,
        { backgroundColor: palette.surface, borderColor: palette.border },
      ]}
    >
      {xunTheme ? (
        <View accessibilityElementsHidden style={styles.xunActionSheetIcon}>
          <XunMenuIcon symbol={symbol || 'dot'} />
        </View>
      ) : (
        <View
          style={[
            styles.actionSheetIcon,
            { backgroundColor: `${palette.mint}24` },
          ]}
        >
          <Icon color={palette.mint} size={19} strokeWidth={2.4} />
        </View>
      )}
      <View
        style={[
          styles.actionSheetCopy,
          xunTheme && styles.xunActionSheetCopy,
          xunTheme && styles.xunActionSheetCopyDivider,
          xunTheme && last && styles.xunActionSheetCopyLast,
        ]}
      >
        <Text
          style={[
            styles.actionSheetRowTitle,
            xunTheme && styles.xunActionSheetRowTitle,
            { color: palette.text },
          ]}
        >
          {title}
        </Text>
      </View>
    </Pressable>
  );
}

type XunMenuSymbol = 'dot' | 'phone' | 'card';

/** The V15 prototype uses these compact glyphs for the three new actions. */
function XunMenuIcon({ symbol }: { symbol: XunMenuSymbol }) {
  const glyph = symbol === 'dot' ? '●' : symbol === 'phone' ? '☏' : '▣';
  return (
    <Text accessibilityElementsHidden style={styles.xunActionSheetSymbol}>
      {glyph}
    </Text>
  );
}
