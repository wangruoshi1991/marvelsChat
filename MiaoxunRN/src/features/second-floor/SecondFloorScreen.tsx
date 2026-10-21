import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import {
  FileText,
  Images,
  ListFilter,
  Settings,
  ShieldCheck,
  Send,
  Users,
  Wallet,
} from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Palette } from '../../shared/theme';
import { textFor } from '../../shared/i18n';
import { Language, useMiaoxunSession } from '../session/useMiaoxunSession';
import { workspacePalette } from '../../shared/workspacePalette';
import { entranceCurve, useReduceMotion } from '../../shared/useReduceMotion';
import { AgentWorkspace } from '../../models/agentWorkspace';
import { SecondFloorAlbums } from './SecondFloorAlbums';
import { SecondFloorFiles } from './SecondFloorFiles';
import { SecondFloorRelationships } from './SecondFloorRelationships';
import { SecondFloorAssets } from './SecondFloorAssets';
import { SecondFloorInformation } from './SecondFloorInformation';
import { SecondFloorPermissions } from './SecondFloorPermissions';
import { SecondFloorPublish } from './SecondFloorPublish';
import { SecondFloorSettings } from './SecondFloorSettings';

/**
 * The prototype's floor holds six tools. `publish` and `settings` are the
 * user's own additions — publishing was moved here from the 我 page, and the
 * personal-settings entry was moved off that page's profile card. Both are
 * marked so they stay easy to trace back to that decision.
 */
const tools = [
  { key: 'albums', label: ['相册', 'Albums'], icon: Images },
  { key: 'files', label: ['文件', 'Files'], icon: FileText },
  { key: 'relationships', label: ['关系', 'People'], icon: Users },
  { key: 'assets', label: ['资产', 'Assets'], icon: Wallet },
  { key: 'information', label: ['信息海', 'Inbox'], icon: ListFilter },
  { key: 'permissions', label: ['权限', 'Permissions'], icon: ShieldCheck },
  { key: 'publish', label: ['发布', 'Publish'], icon: Send },
  { key: 'settings', label: ['设置', 'Settings'], icon: Settings },
] as const;
export type SecondFloorTool = (typeof tools)[number]['key'];

export function SecondFloorScreen({
  active = true,
  palette,
  language,
  session,
  onClose,
  onToolChange,
  onOpenFriendThread,
  onOpenProfile,
  onOpenSettings,
  onOpenDeleteAccount,
  onOpenNotices,
  onOpenPostComposer,
  onOpenWorkspace,
  onOpenFileAgent,
}: {
  active?: boolean;
  palette: Palette;
  language: Language;
  session: ReturnType<typeof useMiaoxunSession>;
  onClose: () => void;
  onToolChange?: (tool: SecondFloorTool | null) => void;
  onOpenFriendThread: (id: string) => void;
  onOpenProfile: (aiId: string) => void;
  onOpenSettings: () => void;
  /** Account deletion keeps its own confirmation screen in the app shell. */
  onOpenDeleteAccount: () => void;
  onOpenNotices: () => void;
  /** Opens the app-shell post composer from the floor's publish panel. */
  onOpenPostComposer: () => void;
  onOpenWorkspace: (workspace: AgentWorkspace) => void;
  onOpenFileAgent?: (
    reference: import('../../models/aiTask').AIContextReference,
  ) => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [toolsWidth, setToolsWidth] = useState(width);
  const toolWidth = (toolsWidth - 24 - 6 * 4) / 5;
  const toolStep = toolWidth + 6;
  const toolScroll = useRef(new Animated.Value(0)).current;
  // The floor opens straight on 相册 rather than on an empty tool row: it is
  // the panel people come up here for.
  const [selected, setSelected] = useState<SecondFloorTool | null>('albums');
  // Prototype `.xun-floor-panel` runs `xun-floor-panel-in .24s
  // cubic-bezier(.2,.8,.2,1)` — `opacity 0 → 1` with `translateY(12px) → 0`.
  const panelEntrance = useRef(new Animated.Value(1)).current;
  const reduceMotion = useReduceMotion();
  useEffect(() => {
    if (selected === null) return;
    panelEntrance.stopAnimation();
    if (reduceMotion) {
      panelEntrance.setValue(1);
      return;
    }
    panelEntrance.setValue(0);
    const animation = Animated.timing(panelEntrance, {
      toValue: 1,
      duration: 240,
      easing: Easing.bezier(...entranceCurve),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [selected, panelEntrance, reduceMotion]);
  useEffect(() => {
    onToolChange?.(selected);
  }, [selected, onToolChange]);
  const [visited, setVisited] = useState<SecondFloorTool[]>(['albums']);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const colors = useMemo(() => workspacePalette(palette), [palette]);
  const panelPalette = useMemo(
    () => ({
      ...colors,
      background: colors.surface,
      input: colors.surface,
    }),
    [colors],
  );
  const onBusyChange = useCallback((value: boolean) => {
    pending.current = value;
    setBusy(value);
  }, []);
  const closeFloor = useCallback(() => {
    if (!active || pending.current) return;
    Keyboard.dismiss();
    onClose();
  }, [active, onClose]);
  const selectTool = (key: SecondFloorTool) => {
    if (!active || pending.current) return;
    Keyboard.dismiss();
    setVisited(current =>
      current.includes(key) ? current : [...current, key],
    );
    setSelected(current => (current === key ? null : key));
  };
  useEffect(() => {
    if (!active) return;
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      closeFloor();
      return true;
    });
    return () => listener.remove();
  }, [active, closeFloor]);
  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          active &&
          !pending.current &&
          gesture.dy < -10 &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.4,
        onPanResponderRelease: (_event, gesture) => {
          if (
            gesture.dy < -55 &&
            Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.4
          )
            closeFloor();
        },
      }),
    [active, closeFloor],
  );
  return (
    <KeyboardAvoidingView
      testID="second-floor"
      keyboardVerticalOffset={insets.top}
      style={[s.screen, { backgroundColor: colors.background }]}
      behavior={
        Platform.OS === 'ios' && selected === 'files' ? 'padding' : undefined
      }
    >
      <View
        testID="floor-content"
        style={[
          s.content,
          selected !== null && s.selectedContent,
          selected !== null && {
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}
      >
        <Animated.View
          style={[
            s.screen,
            {
              opacity: panelEntrance,
              transform: [
                {
                  translateY: panelEntrance.interpolate({
                    inputRange: [0, 1],
                    outputRange: [12, 0],
                  }),
                },
              ],
            },
          ]}
        >
          {visited.includes('albums') ? (
            <View
              style={[s.screen, selected !== 'albums' && s.hidden]}
              pointerEvents={selected === 'albums' ? 'auto' : 'none'}
              accessibilityElementsHidden={selected !== 'albums'}
              importantForAccessibility={
                selected === 'albums' ? 'auto' : 'no-hide-descendants'
              }
            >
              <SecondFloorAlbums
                palette={panelPalette}
                language={language}
                session={session}
                onBusyChange={onBusyChange}
              />
            </View>
          ) : null}
          {visited.includes('files') ? (
            <View
              style={[s.screen, selected !== 'files' && s.hidden]}
              pointerEvents={selected === 'files' ? 'auto' : 'none'}
              accessibilityElementsHidden={selected !== 'files'}
              importantForAccessibility={
                selected === 'files' ? 'auto' : 'no-hide-descendants'
              }
            >
              <SecondFloorFiles
                palette={panelPalette}
                language={language}
                session={session}
                active={active && selected === 'files'}
                onBusyChange={onBusyChange}
                onOpenWorkspace={onOpenWorkspace}
                onOpenFileAgent={onOpenFileAgent}
              />
            </View>
          ) : null}
          {selected === 'relationships' ? (
            <SecondFloorRelationships
              palette={panelPalette}
              language={language}
              session={session}
              onOpenFriendThread={onOpenFriendThread}
              onOpenProfile={onOpenProfile}
            />
          ) : null}
          {selected === 'assets' ? (
            <SecondFloorAssets
              palette={panelPalette}
              language={language}
              miaoPoints={session.profile.miaoPoints}
              onLoadEntries={session.listMiaoPointLedger}
            />
          ) : null}
          {selected === 'information' ? (
            <SecondFloorInformation
              palette={panelPalette}
              language={language}
              notices={session.notices}
              unreadCount={session.unreadNoticeCount}
              onOpenNotices={onOpenNotices}
            />
          ) : null}
          {selected === 'permissions' ? (
            <SecondFloorPermissions
              palette={panelPalette}
              language={language}
              onOpenSettings={onOpenSettings}
            />
          ) : null}
          {visited.includes('publish') ? (
            <View
              style={[s.screen, selected !== 'publish' && s.hidden]}
              pointerEvents={selected === 'publish' ? 'auto' : 'none'}
              accessibilityElementsHidden={selected !== 'publish'}
              importantForAccessibility={
                selected === 'publish' ? 'auto' : 'no-hide-descendants'
              }
            >
              <SecondFloorPublish
                palette={panelPalette}
                language={language}
                session={session}
                onOpenPostComposer={onOpenPostComposer}
                onBusyChange={onBusyChange}
              />
            </View>
          ) : null}
          {visited.includes('settings') ? (
            <View
              style={[s.screen, selected !== 'settings' && s.hidden]}
              pointerEvents={selected === 'settings' ? 'auto' : 'none'}
              accessibilityElementsHidden={selected !== 'settings'}
              importantForAccessibility={
                selected === 'settings' ? 'auto' : 'no-hide-descendants'
              }
            >
              <SecondFloorSettings
                palette={panelPalette}
                language={language}
                session={session}
                onOpenDeleteAccount={onOpenDeleteAccount}
              />
            </View>
          ) : null}
        </Animated.View>
      </View>
      <View
        onLayout={event => {
          const measured = event.nativeEvent.layout.width;
          if (measured > 48) setToolsWidth(measured);
        }}
        testID="floor-tools-viewport"
      >
        <Animated.ScrollView
          testID="floor-tools"
          horizontal
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.tools}
          decelerationRate="fast"
          snapToInterval={toolStep}
          snapToAlignment="start"
          bounces={false}
          scrollEventThrottle={16}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: toolScroll } } }],
            { useNativeDriver: true },
          )}
        >
          {tools.map(({ key, label, icon: Icon }, index) => (
            <Animated.View
              key={key}
              style={{
                width: toolWidth,
                transform: [
                  {
                    scale: toolScroll.interpolate({
                      inputRange: [
                        (index - 5) * toolStep,
                        (index - 4) * toolStep,
                        index * toolStep,
                        (index + 1) * toolStep,
                      ],
                      outputRange: [0.92, 1, 1, 0.92],
                      extrapolate: 'clamp',
                    }),
                  },
                ],
              }}
            >
              <Pressable
                testID={`floor-tool-${key}`}
                accessibilityRole="tab"
                accessibilityState={{
                  selected: selected === key,
                  disabled: busy || !active,
                }}
                accessibilityLabel={textFor(language, label[0], label[1])}
                disabled={busy || !active}
                onPress={() => selectTool(key)}
                style={[
                  s.tool,
                  busy && selected !== key && s.disabled,
                  {
                    backgroundColor:
                      selected === key ? colors.text : colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Icon
                  size={22}
                  color={
                    selected === key ? colors.surface : colors.secondaryText
                  }
                />
                <Text
                  numberOfLines={2}
                  style={[
                    s.toolLabel,
                    {
                      color:
                        selected === key
                          ? colors.surface
                          : colors.secondaryText,
                    },
                  ]}
                >
                  {textFor(language, label[0], label[1])}
                </Text>
              </Pressable>
            </Animated.View>
          ))}
        </Animated.ScrollView>
      </View>
      <View
        {...responder.panHandlers}
        testID="floor-return-gesture"
        accessible
        accessibilityRole="button"
        accessibilityState={{ disabled: busy || !active, busy }}
        accessibilityLabel={textFor(
          language,
          '返回对话',
          'Back to conversations',
        )}
        accessibilityHint={textFor(
          language,
          busy ? '正在保存，完成后可返回对话' : '向上滑动返回',
          busy ? 'Saving. Return after it completes.' : 'Swipe up to return',
        )}
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={event => {
          if (event.nativeEvent.actionName === 'activate') closeFloor();
        }}
        onAccessibilityTap={closeFloor}
        onAccessibilityEscape={closeFloor}
        style={s.return}
      >
        <View style={[s.handle, { backgroundColor: colors.secondaryText }]} />
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1 },
  hidden: { display: 'none' },
  selectedContent: { borderWidth: 1 },
  disabled: { opacity: 0.45 },
  content: {
    flex: 1,
    overflow: 'hidden',
    marginHorizontal: 12,
    marginTop: 14,
    borderRadius: 12,
  },
  tools: { paddingHorizontal: 12, paddingVertical: 7, gap: 6 },
  toolLabel: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  tool: {
    width: '100%',
    minHeight: 72,
    padding: 6,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  return: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: { width: 32, height: 4, borderRadius: 2, opacity: 0.5 },
});
