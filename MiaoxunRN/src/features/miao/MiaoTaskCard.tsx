import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Animated,
  LayoutAnimation,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { ChevronDown, ChevronUp, Eye } from 'lucide-react-native';
import { AgentDTO } from '../../models/api';
import { Palette } from '../../shared/theme';
import { Language } from '../session/sessionTypes';
import { AIContextActions } from '../assist/AIContextActions';
import { MiaoTaskAgent } from './MiaoTaskAgent';
import { MiaoCardViewState, nextMiaoCardState } from './miaoCardState';
import type { UIPreferences } from '../ui/uiPreferenceTypes';
import {
  componentUIPreference,
  gestureUIPreference,
  orderedUIComponents,
  uiButtonSlot,
  uiFontSize,
  uiRowGap,
} from '../ui/uiPreferences';

/** Single tasks and collaborations share the same content and gesture surface. */
export function MiaoTaskCard({
  object,
  goal,
  status,
  detail,
  participantIds,
  agents,
  palette,
  language,
  grid,
  failed,
  showAgentNames = false,
  renderState,
  children,
  uiPreferences,
  ...actions
}: Omit<React.ComponentProps<typeof AIContextActions>, 'children' | 'style'> & {
  goal: string;
  status: string;
  detail?: string | null;
  participantIds: string[];
  agents: AgentDTO[];
  palette: Palette;
  language: Language;
  grid: boolean;
  failed: boolean;
  /** Optional fixed names for callers outside the collapsible feed. */
  showAgentNames?: boolean;
  /** Content for the PDF's S1/S2 states. Summary children stay in S0. */
  renderState?: (state: MiaoCardViewState) => React.ReactNode;
  children?: React.ReactNode;
  uiPreferences?: UIPreferences;
}) {
  const { onOpen, openLabel, ...assistActions } = actions;
  const { width } = useWindowDimensions();
  const detailsPreference = componentUIPreference(
    uiPreferences,
    'miao',
    'miao.taskCard.details',
  );
  const participantsPreference = componentUIPreference(
    uiPreferences,
    'miao',
    'miao.taskCard.participants',
  );
  const miaoButtonScale = uiPreferences?.surfaces.miao.buttonScale ?? 1;
  const miaoRowGap = uiRowGap(uiPreferences, 'miao');
  const actionOrder = orderedUIComponents(uiPreferences, 'miao', [
    'miao.taskCard.participants',
    'miao.taskCard.details',
  ]);
  const participantsSlot = uiButtonSlot(
    uiPreferences,
    'miao',
    'agentEntry',
    'miao.taskCard.participants',
  );
  const participantsGesture = gestureUIPreference(
    uiPreferences,
    'miao.taskCard.participantsSwipe',
  );
  const detailsGesture = gestureUIPreference(
    uiPreferences,
    'miao.taskCard.detailsSwipe',
  );
  const [viewState, setViewState] = useState<MiaoCardViewState>('summary');
  const translateX = useRef(new Animated.Value(0)).current;
  const suppressPressUntil = useRef(0);
  const detailText = detail?.trim();
  const showDetail =
    detailText && detailText !== goal.trim() && detailText !== status.trim();
  const participants = participantIds.map(id => ({
    id,
    agent: agents.find(candidate => candidate.key === id),
  }));
  const [agentsExpanded, setAgentsExpanded] = useState(false);
  const namesVisible = showAgentNames || agentsExpanded;
  const ToggleIcon =
    viewState !== 'summary' || agentsExpanded ? ChevronUp : ChevronDown;
  const agentNodes = participants.map(({ id, agent }, index) => (
    <MiaoTaskAgent
      key={id}
      agentId={id}
      agent={agent}
      palette={palette}
      language={language}
      size={33}
      showName={namesVisible || !agent}
      constrainName
      overlap={!namesVisible && index > 0}
    />
  ));
  const participantsVisible = participantsPreference.visible !== false;
  const detailsGestureEnabled = detailsPreference.visible !== false;
  // The prototype's default card keeps its original compact controls. A
  // customized details component has an explicit entry into this card's S2;
  // the unrelated avatar-name toggle never consumes its preferences.
  const showDetailsAction =
    detailsGestureEnabled && Object.keys(detailsPreference).length > 0;
  const controlScale = (scale = 1) =>
    Math.max(0.8, Math.min(1.3, scale * miaoButtonScale));
  const participantsScale = controlScale(participantsPreference.sizeScale);
  const detailsScale = controlScale(detailsPreference.sizeScale);
  const controlStyle = (scale: number) => ({
    minHeight: Math.max(44, 44 * scale),
    minWidth: Math.max(44, 44 * scale),
    paddingHorizontal: 8 * scale,
    paddingVertical: 3 * scale,
    borderRadius: uiPreferences?.surfaces.miao.buttonRadius ?? 12,
  });
  const taskStatus = (
    <Text
      testID="miao-task-status"
      style={[
        s.status,
        grid && s.gridStatus,
        {
          color: failed ? palette.rose : palette.secondaryText,
          fontSize: uiFontSize(uiPreferences, 11),
        },
      ]}
    >
      {status}
    </Text>
  );
  const resetTranslation = useCallback(() => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      damping: 18,
      stiffness: 220,
      mass: 0.7,
    }).start();
  }, [translateX]);
  const animateState = useCallback(
    (next: MiaoCardViewState, animationMs: number) => {
      // The PDF keeps the current card in the feed: S1 replaces its body with
      // the participant list and S2 grows it vertically for the current
      // result. Only the gesture itself follows the finger; the card never
      // flies out of the list and gets replaced by a second card.
      // Start the vertical content transition immediately while the card
      // settles back under the finger. Waiting for the spring to finish made
      // the state change look like a static replacement on a real device.
      LayoutAnimation.configureNext({
        duration: animationMs,
        create: {
          type: LayoutAnimation.Types.easeInEaseOut,
          property: LayoutAnimation.Properties.opacity,
        },
        update: { type: LayoutAnimation.Types.easeInEaseOut },
        delete: {
          type: LayoutAnimation.Types.easeInEaseOut,
          property: LayoutAnimation.Properties.opacity,
        },
      });
      setViewState(next);
      Animated.timing(translateX, {
        toValue: 0,
        duration: animationMs,
        useNativeDriver: true,
      }).start();
    },
    [translateX],
  );
  const oppositeDirection = (direction: 'left' | 'right' | 'up' | 'down') =>
    direction === 'left'
      ? 'right'
      : direction === 'right'
      ? 'left'
      : direction === 'up'
      ? 'down'
      : 'up';
  const gestureMatches = (
    preference: ReturnType<typeof gestureUIPreference>,
    direction: 'left' | 'right',
    dx: number,
    dy: number,
    vx: number,
  ) => {
    if (!preference.enabled) return false;
    const horizontal = Math.abs(dx) > Math.abs(dy) * 1.2;
    const signedDistance = direction === 'right' ? dx : -dx;
    const signedVelocity = direction === 'right' ? vx : -vx;
    return (
      horizontal &&
      (signedDistance >= preference.distance ||
        signedVelocity >= preference.velocityThreshold)
    );
  };
  const finishSwipe = useCallback(
    (dx: number, dy: number, vx: number) => {
      const horizontal = Math.abs(dx) > Math.abs(dy) * 1.2;
      if (!horizontal) {
        resetTranslation();
        return;
      }
      const direction = dx >= 0 ? 'right' : 'left';
      const entryPreference =
        viewState === 'summary'
          ? direction === participantsGesture.direction
            ? participantsGesture
            : detailsGesture
          : viewState === 'agents'
          ? participantsGesture
          : detailsGesture;
      const expectedDirection =
        viewState === 'summary'
          ? direction
          : oppositeDirection(entryPreference.direction);
      const accepted =
        viewState === 'summary'
          ? (participantsVisible &&
              direction === participantsGesture.direction &&
              gestureMatches(participantsGesture, direction, dx, dy, vx)) ||
            (direction === detailsGesture.direction &&
              detailsGestureEnabled &&
              gestureMatches(detailsGesture, direction, dx, dy, vx))
          : direction === expectedDirection &&
            gestureMatches(
              entryPreference,
              direction as 'left' | 'right',
              dx,
              dy,
              vx,
            );
      if (!accepted) {
        resetTranslation();
        return;
      }
      const next = nextMiaoCardState(
        viewState,
        direction,
        Math.max(Math.abs(dx), entryPreference.distance),
        dy,
        entryPreference.distance,
        {
          participants: participantsGesture.direction,
          details: detailsGesture.direction,
        },
      );
      if (next === viewState) {
        resetTranslation();
        return;
      }
      suppressPressUntil.current = Date.now() + 260;
      animateState(next, entryPreference.animationMs);
    },
    [
      animateState,
      detailsGesture,
      detailsGestureEnabled,
      participantsGesture,
      participantsVisible,
      resetTranslation,
      viewState,
    ],
  );
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, responder) =>
          ((participantsVisible && participantsGesture.enabled) ||
            (detailsGestureEnabled && detailsGesture.enabled)) &&
          Math.abs(responder.dx) > 8 &&
          Math.abs(responder.dx) > Math.abs(responder.dy) * 1.25,
        onMoveShouldSetPanResponderCapture: (_event, responder) =>
          ((participantsVisible && participantsGesture.enabled) ||
            (detailsGestureEnabled && detailsGesture.enabled)) &&
          Math.abs(responder.dx) > 8 &&
          Math.abs(responder.dx) > Math.abs(responder.dy) * 1.25,
        // The card is nested in Pressable and FlatList. Capture the horizontal
        // gesture before either parent can turn it into a tap or vertical list
        // scroll; vertical movement remains owned by the list.
        // Once a horizontal swipe is captured, keep ownership until release.
        // The inner Pressable must not cancel the card transition.
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          translateX.stopAnimation();
          translateX.setValue(0);
        },
        onPanResponderMove: (_event, responder) => {
          const limit = Math.max(120, Math.min(width * 0.72, 300));
          translateX.setValue(Math.max(-limit, Math.min(limit, responder.dx)));
        },
        onPanResponderRelease: (_event, responder) =>
          finishSwipe(responder.dx, responder.dy, responder.vx),
        onPanResponderTerminate: resetTranslation,
      }),
    [
      detailsGesture.enabled,
      detailsGestureEnabled,
      finishSwipe,
      participantsGesture.enabled,
      participantsVisible,
      resetTranslation,
      translateX,
      width,
    ],
  );
  const stateContent =
    viewState === 'summary' ? children : renderState?.(viewState);
  const participantAction =
    participants.length && participantsVisible ? (
      <Pressable
        key="participants"
        testID="miao-card-participants-action"
        accessibilityRole="button"
        accessibilityLabel={
          participantsPreference.label || `查看 ${participants.length} 个 Agent`
        }
        accessibilityState={{ expanded: viewState === 'agents' }}
        hitSlop={8}
        onPress={event => {
          event.stopPropagation();
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setViewState(value => (value === 'agents' ? 'summary' : 'agents'));
          resetTranslation();
        }}
        style={[s.agentCount, controlStyle(participantsScale)]}
      >
        {participantsPreference.icon ? (
          <Text
            accessible={false}
            numberOfLines={1}
            style={{
              color: palette.secondaryText,
              fontSize: uiFontSize(uiPreferences, 14) * participantsScale,
              maxWidth: 32 * participantsScale,
            }}
          >
            {participantsPreference.icon}
          </Text>
        ) : null}
        <Text
          style={[
            s.agentCountText,
            {
              color: palette.secondaryText,
              fontSize: uiFontSize(uiPreferences, 11) * participantsScale,
              lineHeight: uiFontSize(uiPreferences, 16) * participantsScale,
            },
          ]}
        >
          {participantsPreference.label || `${participants.length} 个 Agent`}
        </Text>
      </Pressable>
    ) : null;
  const detailsAction = showDetailsAction ? (
    <Pressable
      key="details"
      testID="miao-card-details-action"
      accessibilityRole="button"
      accessibilityLabel={detailsPreference.label || openLabel}
      accessibilityState={{ expanded: viewState === 'detail' }}
      onPress={event => {
        event.stopPropagation();
        animateState(
          viewState === 'detail' ? 'summary' : 'detail',
          detailsGesture.animationMs,
        );
      }}
      style={[s.agentCount, controlStyle(detailsScale)]}
    >
      {detailsPreference.icon ? (
        <Text
          accessible={false}
          numberOfLines={1}
          style={{
            color: palette.secondaryText,
            fontSize: uiFontSize(uiPreferences, 14) * detailsScale,
            maxWidth: 32 * detailsScale,
          }}
        >
          {detailsPreference.icon}
        </Text>
      ) : (
        <Eye
          color={palette.secondaryText}
          size={16 * detailsScale}
          strokeWidth={1.6}
        />
      )}
      <Text
        style={[
          s.agentCountText,
          {
            color: palette.secondaryText,
            fontSize: uiFontSize(uiPreferences, 11) * detailsScale,
            lineHeight: uiFontSize(uiPreferences, 16) * detailsScale,
          },
        ]}
      >
        {detailsPreference.label || openLabel}
      </Text>
    </Pressable>
  ) : null;
  const toggleAction = (
    <Pressable
      key="avatar-toggle"
      accessibilityRole="button"
      accessibilityLabel={
        viewState === 'detail'
          ? '收起详情'
          : viewState === 'agents'
          ? '收起 Agent'
          : agentsExpanded
          ? '收起 Agent'
          : '展开 Agent'
      }
      accessibilityState={{
        expanded: viewState !== 'summary' || agentsExpanded,
      }}
      hitSlop={8}
      onPress={event => {
        event.stopPropagation();
        if (viewState !== 'summary') {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setViewState('summary');
          resetTranslation();
        } else {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setAgentsExpanded(value => !value);
        }
      }}
      style={s.toggle}
    >
      <ToggleIcon color={palette.secondaryText} size={22} strokeWidth={1.6} />
    </Pressable>
  );
  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={{ transform: [{ translateX }] }}
    >
      <AIContextActions
        {...assistActions}
        object={object}
        palette={palette}
        language={language}
        onOpen={onOpen}
        openLabel={detailsPreference.label || openLabel}
        onPressOverride={() => {
          if (Date.now() < suppressPressUntil.current) return;
          // S1/S2 remain an in-feed preview. The explicit S0 card action is
          // the route to the full workspace screen, so tapping expanded
          // content cannot unexpectedly replace the PDF-style card state.
          if (viewState === 'summary' && detailsPreference.visible !== false)
            onOpen();
        }}
        style={[
          s.card,
          grid && s.grid,
          {
            backgroundColor: palette.surface,
            borderColor: palette.border,
            borderRadius: uiPreferences?.surfaces.miao.cardRadius ?? 19,
          },
        ]}
      >
        {participantsSlot === 'topRight' && participantAction ? (
          <View testID="miao-card-top-right-actions" style={s.topRightActions}>
            {participantAction}
          </View>
        ) : null}
        <View testID="miao-card-animated-content">
          <Text
            numberOfLines={grid ? 5 : 3}
            style={[
              s.description,
              {
                color: palette.secondaryText,
                fontSize: uiFontSize(uiPreferences, 15.5),
              },
            ]}
          >
            {highlightTaskNumbers(goal)}
          </Text>
          {viewState === 'summary' && showDetail ? (
            <Text
              numberOfLines={2}
              style={[s.detail, { color: palette.secondaryText }]}
            >
              {detailText}
            </Text>
          ) : null}
          {stateContent}
        </View>
        {grid || !participants.length ? taskStatus : null}
        {participants.length || showDetailsAction || viewState !== 'summary' ? (
          <View style={[s.footer, { gap: Math.max(4, miaoRowGap) }]}>
            {viewState === 'summary' && participantsVisible ? (
              namesVisible ? (
                <View style={[s.agentScroller, s.strip, s.expandedStrip]}>
                  {agentNodes}
                </View>
              ) : (
                <ScrollView
                  horizontal
                  style={s.agentScroller}
                  contentContainerStyle={s.strip}
                  scrollEnabled={participants.length > 1}
                  showsHorizontalScrollIndicator={false}
                >
                  {agentNodes}
                </ScrollView>
              )
            ) : (
              <View style={s.agentScroller} />
            )}
            <View
              testID="miao-card-footer-actions"
              style={[s.footerActions, { gap: Math.max(4, miaoRowGap / 2) }]}
            >
              {!grid && participants.length ? taskStatus : null}
              {actionOrder.map(id =>
                id === 'miao.taskCard.participants'
                  ? participantsSlot !== 'topRight'
                    ? participantAction
                    : null
                  : detailsAction,
              )}
              {(participants.length && participantsVisible) ||
              viewState !== 'summary'
                ? toggleAction
                : null}
            </View>
          </View>
        ) : null}
      </AIContextActions>
    </Animated.View>
  );
}

/**
 * Prototype `task-number`: digits inside the description read larger than the
 * surrounding sentence. Only digit runs are split so ordinary text keeps its
 * exact string form for callers that compare it.
 */
export function highlightTaskNumbers(text: string) {
  const parts = text.split(/(\d+(?:[.,]\d+)*)/g);
  if (parts.length === 1) return text;
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <Text key={`${part}-${index}`} style={s.taskNumber}>
        {part}
      </Text>
    ) : (
      part
    ),
  );
}

const s = StyleSheet.create({
  // V6 `.brief-card`: a rounded card on the dark task-feed canvas.
  card: {
    borderRadius: 19,
    borderWidth: 0,
    gap: 7,
    padding: 18,
  },
  grid: {
    flex: 1,
    maxWidth: '50%',
    borderRadius: 19,
  },
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    marginTop: 8,
    minHeight: 33,
  },
  // V20 keeps a compact, overlapping Agent stack below the brief text.
  agentScroller: { flex: 1, minWidth: 0 },
  strip: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 0,
    paddingRight: 4,
  },
  expandedStrip: { gap: 10, flexWrap: 'wrap', rowGap: 12 },
  footerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    flexShrink: 1,
    gap: 4,
    justifyContent: 'flex-end',
  },
  status: { fontSize: 11, lineHeight: 16, maxWidth: 90 },
  // In a two-column card, status must not take the avatar viewport's width.
  gridStatus: { maxWidth: '100%' },
  toggle: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  description: {
    fontSize: 15.5,
    lineHeight: 24,
    fontWeight: '400',
  },
  taskNumber: { fontSize: 18, fontWeight: '800' },
  detail: { fontSize: 13, lineHeight: 20 },
  agentCount: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    maxWidth: '100%',
  },
  agentCountText: { fontSize: 11, lineHeight: 16, flexShrink: 1 },
  topRightActions: { alignItems: 'flex-end', alignSelf: 'stretch' },
});
