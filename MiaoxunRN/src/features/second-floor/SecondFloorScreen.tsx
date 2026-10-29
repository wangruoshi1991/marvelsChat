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
  ScrollView,
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
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Palette } from '../../shared/theme';
import { textFor } from '../../shared/i18n';
import { Language, useMiaoxunSession } from '../session/useMiaoxunSession';
import { secondFloorPalette } from './secondFloorTheme';
import { isV6Palette } from '../../shared/v6Palette';
import { isXunPalette } from '../../shared/xunPalette';
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
import {
  SecondFloorPageScrollEvent,
  SecondFloorPageScrollProps,
} from './secondFloorScroll';

/**
 * The prototype's floor holds six tools. `publish` and `settings` are the
 * user's own additions — publishing was moved here from the 我 page, and the
 * personal-settings entry was moved off that page's profile card. Both are
 * marked so they stay easy to trace back to that decision.
 */
const tools = [
  { key: 'albums', label: ['相册', 'Albums'], icon: Images, symbol: '▧' },
  { key: 'files', label: ['文件', 'Files'], icon: FileText, symbol: '▤' },
  { key: 'relationships', label: ['关系', 'People'], icon: Users, symbol: '♧' },
  { key: 'assets', label: ['资产', 'Assets'], icon: Wallet, symbol: '◈' },
  {
    key: 'information',
    label: ['信息海', 'Inbox'],
    icon: ListFilter,
    symbol: '≋',
  },
  {
    key: 'permissions',
    label: ['权限', 'Permissions'],
    icon: ShieldCheck,
    symbol: '⚿',
  },
  { key: 'publish', label: ['发布', 'Publish'], icon: Send, symbol: null },
  {
    key: 'settings',
    label: ['设置', 'Settings'],
    icon: Settings,
    symbol: null,
  },
] as const;
export type SecondFloorTool = (typeof tools)[number]['key'];

const swipeReturnTools: ReadonlySet<SecondFloorTool> = new Set([
  'albums',
  'files',
  'relationships',
  'assets',
  'information',
  'permissions',
  'publish',
  'settings',
]);

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
  const colors = useMemo(() => secondFloorPalette(palette), [palette]);
  const v6 = isV6Palette(colors);
  const xun = isXunPalette(colors);
  const [toolsWidth, setToolsWidth] = useState(width);
  const [landingViewportHeight, setLandingViewportHeight] = useState(0);
  // V15 shows six floor tools in the first viewport; legacy palettes keep the
  // existing five-card strip and its snap geometry.
  const toolSlots = xun ? 6 : 5;
  const toolHorizontalPadding = v6 || xun ? 12 : 24;
  const toolGap = v6 || xun ? 3 : 6;
  const toolWidth =
    (toolsWidth - toolHorizontalPadding - toolGap * (toolSlots - 1)) /
    toolSlots;
  const toolStep = toolWidth + toolGap;
  const trailingToolOffset = Math.max(0, (tools.length - toolSlots) * toolStep);
  const toolListRef = useRef<ScrollView>(null);
  const toolScroll = useRef(new Animated.Value(0)).current;
  // V15 opens on the personal-space landing state; legacy themes retain the
  // existing direct-to-albums behavior.
  const [selected, setSelected] = useState<SecondFloorTool | null>(
    xun ? null : 'albums',
  );
  // Prototype `.xun-floor-panel` runs `xun-floor-panel-in .24s
  // cubic-bezier(.2,.8,.2,1)` — `opacity 0 → 1` with `translateY(12px) → 0`.
  const panelEntrance = useRef(new Animated.Value(1)).current;
  const reduceMotion = useReduceMotion();
  useEffect(() => {
    if (selected === null) {
      // Closing during the entrance animation must restore the landing state.
      panelEntrance.stopAnimation();
      panelEntrance.setValue(1);
      return;
    }
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
  // Observe the scroller's own touch stream: after native scrolling starts,
  // ScrollView refuses responder termination, so a parent PanResponder cannot
  // reliably take over a bottom-edge swipe on a device.
  const pageAtBottom = useRef(false);
  const pageStartAtBottom = useRef(false);
  const pageScrollScope = useMemo(
    () => ({ active, selected, xun }),
    [active, selected, xun],
  );
  const currentPageScrollScope = useRef(pageScrollScope);
  currentPageScrollScope.current = pageScrollScope;
  const pageTouch = useRef<{
    scope: typeof pageScrollScope;
    x: number;
    y: number;
  } | null>(null);
  const pageNativeDragging = useRef(false);
  const pageContentHeight = useRef(0);
  const pageViewportHeight = useRef(0);
  const pageOffsetY = useRef(0);
  const clearPageScrollState = useCallback(() => {
    pageAtBottom.current = false;
    pageStartAtBottom.current = false;
    pageTouch.current = null;
    pageNativeDragging.current = false;
  }, []);
  useEffect(() => {
    clearPageScrollState();
    pageContentHeight.current = 0;
    pageViewportHeight.current = 0;
    pageOffsetY.current = 0;
  }, [pageScrollScope, clearPageScrollState]);
  const ownsPageScroll = useCallback(
    (source: SecondFloorTool | null, scope: typeof pageScrollScope) =>
      currentPageScrollScope.current === scope &&
      scope.active &&
      scope.xun &&
      scope.selected === source &&
      (source === null || swipeReturnTools.has(source)),
    [],
  );
  const updatePageScrollPosition = useCallback(
    (event: SecondFloorPageScrollEvent) => {
      const { contentOffset, contentSize, layoutMeasurement } =
        event.nativeEvent;
      const offsetY = Math.max(0, contentOffset?.y ?? 0);
      const contentHeight = contentSize?.height ?? 0;
      const viewportHeight = layoutMeasurement?.height ?? 0;
      pageOffsetY.current = offsetY;
      if (contentHeight > 0) pageContentHeight.current = contentHeight;
      if (viewportHeight > 0) pageViewportHeight.current = viewportHeight;
      pageAtBottom.current =
        viewportHeight > 0 &&
        (contentHeight <= viewportHeight ||
          offsetY >= contentHeight - viewportHeight - 10);
    },
    [],
  );
  const panelPalette = useMemo(
    () => ({
      ...colors,
      background: v6 || xun ? colors.background : colors.surface,
      input: v6 ? colors.input : colors.surface,
    }),
    [colors, v6, xun],
  );
  const selectedContentThemeStyle = useMemo(
    () => ({
      backgroundColor: panelPalette.background,
      borderColor: v6 || xun ? 'transparent' : colors.border,
    }),
    [colors.border, panelPalette.background, v6, xun],
  );
  const toolThemeStyle = useCallback(
    (key: SecondFloorTool) => ({
      backgroundColor: xun
        ? selected === key
          ? colors.mint
          : 'transparent'
        : selected === key
        ? v6
          ? colors.mint
          : colors.text
        : colors.surface,
      borderColor:
        (v6 || xun) && selected === key
          ? colors.mint
          : xun
          ? 'transparent'
          : colors.border,
    }),
    [
      colors.border,
      colors.mint,
      colors.surface,
      colors.text,
      selected,
      v6,
      xun,
    ],
  );
  const onBusyChange = useCallback((value: boolean) => {
    pending.current = value;
    setBusy(value);
  }, []);
  const closeFloor = useCallback(() => {
    if (!active || pending.current) return;
    clearPageScrollState();
    Keyboard.dismiss();
    onClose();
  }, [active, clearPageScrollState, onClose]);
  const pageScrollProps = useMemo(() => {
    if (!xun) return undefined;
    const sources: (SecondFloorTool | null)[] = [
      null,
      ...tools.map(tool => tool.key),
    ];
    return Object.fromEntries(
      sources.map(source => {
        const isCurrent = () => ownsPageScroll(source, pageScrollScope);
        const props: SecondFloorPageScrollProps = {
          alwaysBounceVertical: true,
          onContentSizeChange: (_width, height) => {
            if (!isCurrent()) return;
            pageContentHeight.current = height;
            pageAtBottom.current =
              pageViewportHeight.current > 0 &&
              height <= pageViewportHeight.current;
          },
          onLayout: event => {
            if (!isCurrent()) return;
            pageViewportHeight.current = event.nativeEvent.layout.height;
            pageAtBottom.current =
              pageContentHeight.current > 0 &&
              pageContentHeight.current <= pageViewportHeight.current;
          },
          onScroll: event => {
            if (isCurrent()) updatePageScrollPosition(event);
          },
          onScrollBeginDrag: event => {
            if (!isCurrent()) return;
            pageNativeDragging.current = true;
            updatePageScrollPosition(event);
            pageStartAtBottom.current = pageAtBottom.current;
          },
          onScrollEndDrag: _event => {
            if (!isCurrent()) return;
            pageNativeDragging.current = false;
            // iOS may emit this before touchEnd. Keep the same touch's origin
            // and bottom latch until its release instead of losing the swipe.
            if (!pageTouch.current) clearPageScrollState();
          },
          onMomentumScrollEnd: _event => {
            if (!isCurrent() || pageNativeDragging.current || pageTouch.current)
              return;
            clearPageScrollState();
          },
          onTouchStart: event => {
            if (!isCurrent() || pending.current) return;
            const { touches } = event.nativeEvent;
            const firstTouch = touches[0];
            const pageX = firstTouch?.pageX ?? event.nativeEvent.pageX;
            const pageY = firstTouch?.pageY ?? event.nativeEvent.pageY;
            if (
              touches.length !== 1 ||
              !Number.isFinite(pageX) ||
              !Number.isFinite(pageY)
            ) {
              clearPageScrollState();
              return;
            }
            pageTouch.current = { scope: pageScrollScope, x: pageX, y: pageY };
            const contentFitsViewport =
              pageContentHeight.current > 0 &&
              pageViewportHeight.current > 0 &&
              pageContentHeight.current <= pageViewportHeight.current;
            const offsetAtBottom =
              pageContentHeight.current > 0 &&
              pageViewportHeight.current > 0 &&
              pageOffsetY.current >=
                pageContentHeight.current - pageViewportHeight.current - 10;
            pageStartAtBottom.current =
              pageAtBottom.current || contentFitsViewport || offsetAtBottom;
          },
          onTouchMove: event => {
            if (isCurrent() && event.nativeEvent.touches.length !== 1)
              clearPageScrollState();
          },
          onTouchStartCapture: event => {
            props.onTouchStart?.(event);
          },
          onTouchEnd: event => {
            if (!isCurrent()) return;
            const origin = pageTouch.current;
            const { touches, changedTouches } = event.nativeEvent;
            const changedTouch =
              changedTouches.length === 1 ? changedTouches[0] : undefined;
            const pageX = changedTouch?.pageX;
            const pageY = changedTouch?.pageY;
            const hasValidReleasePoint =
              changedTouches.length === 1 &&
              Number.isFinite(pageX) &&
              Number.isFinite(pageY);
            const dx =
              hasValidReleasePoint && origin ? (pageX as number) - origin.x : 0;
            const dy =
              hasValidReleasePoint && origin ? (pageY as number) - origin.y : 0;
            const shouldClose =
              origin?.scope === pageScrollScope &&
              changedTouches.length === 1 &&
              touches.length === 0 &&
              hasValidReleasePoint &&
              pageStartAtBottom.current &&
              dy < -100 &&
              Math.abs(dy) > Math.abs(dx) * 1.4;
            clearPageScrollState();
            if (shouldClose) closeFloor();
          },
          onTouchEndCapture: event => {
            props.onTouchEnd?.(event);
          },
          onTouchCancel: _event => {
            if (isCurrent()) clearPageScrollState();
          },
          scrollEventThrottle: 16,
        };
        return [source ?? 'landing', props];
      }),
    ) as Record<SecondFloorTool | 'landing', SecondFloorPageScrollProps>;
  }, [
    clearPageScrollState,
    closeFloor,
    ownsPageScroll,
    pageScrollScope,
    updatePageScrollPosition,
    xun,
  ]);
  const selectTool = (key: SecondFloorTool) => {
    if (!active || pending.current) return;
    clearPageScrollState();
    Keyboard.dismiss();
    setVisited(current =>
      current.includes(key) ? current : [...current, key],
    );
    // V15 keeps the current panel open when its entrance is tapped again;
    // legacy themes retain their existing toggle behavior.
    setSelected(current => (xun ? key : current === key ? null : key));
  };
  useEffect(() => {
    if (!xun) return;
    const selectedIndex = selected
      ? tools.findIndex(tool => tool.key === selected)
      : 0;
    toolListRef.current?.scrollTo({
      x: selectedIndex < toolSlots ? 0 : trailingToolOffset,
      animated: false,
    });
  }, [selected, toolSlots, trailingToolOffset, xun]);
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
        onMoveShouldSetPanResponderCapture: (_event, gesture) =>
          active &&
          !pending.current &&
          gesture.dy < -10 &&
          Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.4,
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
  // In V15 the floor header belongs to the page's scroller, while the tool
  // tray and return gesture stay fixed below it.
  const pageHeader = xun ? (
    <View style={s.floorHeaderXun}>
      <Pressable
        testID="floor-header-back"
        accessibilityRole="button"
        accessibilityLabel={textFor(
          language,
          '返回对话',
          'Back to conversations',
        )}
        accessibilityState={{ disabled: busy || !active, busy }}
        disabled={busy || !active}
        onPress={closeFloor}
        style={s.floorHeaderBack}
      >
        <Svg height={21} viewBox="0 0 24 24" width={21}>
          <Path
            d="m14 5-7 7 7 7"
            fill="none"
            stroke="#526577"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.9}
          />
        </Svg>
      </Pressable>
      <Text style={[s.floorHeaderTitle, { color: colors.text }]}>
        {textFor(language, '二楼 · 个人空间', 'SECOND FLOOR · YOUR SPACE')}
      </Text>
      <View style={s.floorHeaderSpacer} />
    </View>
  ) : null;
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
          !v6 && !xun && selected !== null && s.selectedContent,
          (v6 || xun) && s.contentV6,
          selected !== null && selectedContentThemeStyle,
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
                header={selected === 'albums' ? pageHeader : null}
                palette={panelPalette}
                language={language}
                session={session}
                onBusyChange={onBusyChange}
                scrollProps={pageScrollProps?.albums}
              />
            </View>
          ) : null}
          {selected === null && xun ? (
            <ScrollView
              {...pageScrollProps?.landing}
              testID="floor-landing-scroll"
              style={s.screen}
              contentContainerStyle={s.landingScroller}
              onLayout={event => {
                pageScrollProps?.landing?.onLayout?.(event);
                setLandingViewportHeight(event.nativeEvent.layout.height);
              }}
              showsVerticalScrollIndicator={false}
            >
              {pageHeader}
              <View
                style={[
                  s.landing,
                  { minHeight: Math.max(300, landingViewportHeight * 0.6) },
                ]}
                accessibilityRole="summary"
              >
                <View style={s.landingOrb}>
                  <Svg
                    pointerEvents="none"
                    style={StyleSheet.absoluteFill}
                    viewBox="0 0 90 90"
                  >
                    <Defs>
                      <RadialGradient
                        id="secondFloorOrb"
                        cx="32%"
                        cy="27%"
                        rx="76%"
                        ry="76%"
                      >
                        <Stop offset="0" stopColor="#cafbf6" />
                        <Stop offset="0.35" stopColor="#64cbd5" />
                        <Stop offset="0.68" stopColor="#404e83" />
                        <Stop offset="1" stopColor="#171b31" />
                      </RadialGradient>
                    </Defs>
                    <Rect
                      fill="url(#secondFloorOrb)"
                      height="90"
                      rx="31.5"
                      width="90"
                    />
                  </Svg>
                  <Text accessibilityElementsHidden style={s.landingSymbol}>
                    {/* Keep the orb mark monochrome like the V15 prototype. */}
                    ✳︎
                  </Text>
                </View>
                <Text style={s.landingTitle}>
                  {textFor(
                    language,
                    '你的生活，有序安放。',
                    'A PLACE FOR YOUR LIFE.',
                  )}
                </Text>
                <Text style={s.landingCopy}>
                  {textFor(
                    language,
                    '记忆、关系与资产\n都在这片属于你的空间',
                    'Memories, relationships, and assets\nshare this space with you.',
                  )}
                </Text>
                <Text style={s.landingHint}>
                  {textFor(
                    language,
                    '选择下方功能，开始探索',
                    'Choose a tool below to explore',
                  )}
                </Text>
              </View>
            </ScrollView>
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
                header={selected === 'files' ? pageHeader : null}
                palette={panelPalette}
                language={language}
                session={session}
                active={active && selected === 'files'}
                onBusyChange={onBusyChange}
                onOpenWorkspace={onOpenWorkspace}
                onOpenFileAgent={onOpenFileAgent}
                scrollProps={pageScrollProps?.files}
              />
            </View>
          ) : null}
          {selected === 'relationships' ? (
            <SecondFloorRelationships
              header={selected === 'relationships' ? pageHeader : null}
              palette={panelPalette}
              language={language}
              session={session}
              onOpenFriendThread={onOpenFriendThread}
              onOpenProfile={onOpenProfile}
              scrollProps={pageScrollProps?.relationships}
            />
          ) : null}
          {selected === 'assets' ? (
            <SecondFloorAssets
              header={selected === 'assets' ? pageHeader : null}
              palette={panelPalette}
              language={language}
              miaoPoints={session.profile.miaoPoints}
              onLoadEntries={session.listMiaoPointLedger}
              scrollProps={pageScrollProps?.assets}
            />
          ) : null}
          {selected === 'information' ? (
            <SecondFloorInformation
              header={selected === 'information' ? pageHeader : null}
              palette={panelPalette}
              language={language}
              notices={session.notices}
              unreadCount={session.unreadNoticeCount}
              onOpenNotices={onOpenNotices}
              scrollProps={pageScrollProps?.information}
            />
          ) : null}
          {selected === 'permissions' ? (
            <SecondFloorPermissions
              header={selected === 'permissions' ? pageHeader : null}
              palette={panelPalette}
              language={language}
              onOpenSettings={onOpenSettings}
              scrollProps={pageScrollProps?.permissions}
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
                header={selected === 'publish' ? pageHeader : null}
                palette={panelPalette}
                language={language}
                session={session}
                onOpenPostComposer={onOpenPostComposer}
                onBusyChange={onBusyChange}
                scrollProps={pageScrollProps?.publish}
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
                header={selected === 'settings' ? pageHeader : null}
                palette={panelPalette}
                language={language}
                session={session}
                onOpenDeleteAccount={onOpenDeleteAccount}
                scrollProps={pageScrollProps?.settings}
              />
            </View>
          ) : null}
        </Animated.View>
      </View>
      <View
        style={v6 ? s.toolsViewportV6 : xun ? s.toolsViewportXun : undefined}
        onLayout={event => {
          const measured = event.nativeEvent.layout.width;
          if (measured > 48) setToolsWidth(measured);
        }}
        testID="floor-tools-viewport"
      >
        <Animated.ScrollView
          ref={toolListRef}
          testID="floor-tools"
          horizontal
          keyboardShouldPersistTaps="handled"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[s.tools, (v6 || xun) && s.toolsV6]}
          decelerationRate="fast"
          snapToInterval={xun ? undefined : toolStep}
          snapToOffsets={xun ? [0, trailingToolOffset] : undefined}
          snapToAlignment="start"
          bounces={false}
          scrollEventThrottle={16}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { x: toolScroll } } }],
            { useNativeDriver: true },
          )}
        >
          {tools.map(({ key, label, icon: Icon, symbol }, index) => (
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
                      outputRange: xun ? [1, 1, 1, 1] : [0.92, 1, 1, 0.92],
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
                  xun && s.toolXun,
                  busy && selected !== key && s.disabled,
                  toolThemeStyle(key),
                ]}
              >
                {xun && symbol ? (
                  <Text
                    accessibilityElementsHidden
                    style={[
                      s.toolSymbol,
                      selected === key
                        ? s.toolSymbolSelected
                        : s.toolSymbolIdle,
                    ]}
                  >
                    {symbol}
                  </Text>
                ) : (
                  <Icon
                    size={xun ? 19 : 22}
                    color={
                      selected === key
                        ? v6
                          ? '#093337'
                          : xun
                          ? '#073b3d'
                          : colors.surface
                        : colors.secondaryText
                    }
                  />
                )}
                <Text
                  numberOfLines={2}
                  style={[
                    s.toolLabel,
                    xun && s.toolLabelXun,
                    {
                      color:
                        selected === key
                          ? v6
                            ? '#093337'
                            : xun
                            ? '#073b3d'
                            : colors.surface
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
      <View {...responder.panHandlers} testID="floor-return-swipe-area">
        <Pressable
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
          onPress={xun ? closeFloor : undefined}
          onAccessibilityTap={closeFloor}
          onAccessibilityEscape={closeFloor}
          style={[s.return, xun && s.returnXun]}
        >
          {!xun ? (
            <View
              style={[s.handle, { backgroundColor: colors.secondaryText }]}
            />
          ) : null}
          {xun ? (
            <Text style={s.returnText}>
              {textFor(language, '⌃  上滑返回讯', '⌃  Swipe up to return')}
            </Text>
          ) : null}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, minHeight: 0 },
  floorHeaderXun: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  floorHeaderBack: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#e6edf3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floorHeaderTitle: { fontSize: 17, fontWeight: '700' },
  floorHeaderSpacer: { width: 34, height: 34 },
  hidden: { display: 'none' },
  landingScroller: { paddingTop: 8, paddingHorizontal: 17 },
  landing: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  landingOrb: {
    alignItems: 'center',
    borderRadius: 32,
    height: 90,
    justifyContent: 'center',
    shadowColor: '#00c7cb',
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    transform: [{ rotate: '-8deg' }],
    width: 90,
  },
  landingTitle: {
    color: '#294458',
    fontSize: 23,
    lineHeight: 32,
    fontWeight: '700',
    marginTop: 30,
    textAlign: 'center',
  },
  landingSymbol: {
    alignSelf: 'center',
    color: '#152839',
    fontSize: 34,
    fontWeight: '400',
    lineHeight: 40,
  },
  landingCopy: {
    color: '#7c8598',
    fontSize: 13,
    lineHeight: 22,
    marginTop: 31,
    textAlign: 'center',
  },
  landingHint: {
    color: '#7c8598',
    fontSize: 11,
    lineHeight: 19,
    marginTop: 13,
    textAlign: 'center',
  },
  selectedContent: { borderWidth: 1 },
  contentV6: {
    marginHorizontal: 0,
    marginTop: 0,
    borderRadius: 0,
  },
  disabled: { opacity: 0.45 },
  content: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    marginHorizontal: 12,
    marginTop: 14,
    borderRadius: 12,
  },
  tools: { paddingHorizontal: 12, paddingVertical: 7, gap: 6 },
  toolsViewportV6: {
    marginHorizontal: 13,
    borderRadius: 17,
    backgroundColor: '#242a3a',
  },
  toolsViewportXun: {
    marginHorizontal: 13,
    borderRadius: 17,
    backgroundColor: '#e5ecf3',
    shadowColor: '#25394d',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.055,
    shadowRadius: 13,
    elevation: 1,
  },
  toolsV6: { paddingHorizontal: 6, paddingVertical: 6, gap: 3 },
  toolLabel: { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  toolLabelXun: { fontSize: 10, fontWeight: '400' },
  toolSymbol: { fontSize: 19, lineHeight: 22, fontWeight: '400' },
  toolSymbolSelected: { color: '#073b3d' },
  toolSymbolIdle: { color: '#718295' },
  tool: {
    width: '100%',
    minHeight: 72,
    padding: 6,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  toolXun: { gap: 7, height: 67, minHeight: 67, paddingVertical: 10 },
  return: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  returnXun: { height: 40 },
  handle: { width: 32, height: 4, borderRadius: 2, opacity: 0.5 },
  returnText: { color: '#6a7f92', fontSize: 11, marginTop: 3 },
});
