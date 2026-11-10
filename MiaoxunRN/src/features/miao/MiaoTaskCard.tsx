import React, { useCallback, useRef, useState } from 'react';
import {
  Animated,
  LayoutAnimation,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { ChevronDown, ChevronUp, MoreHorizontal } from 'lucide-react-native';
import { AgentDTO } from '../../models/api';
import { Palette } from '../../shared/theme';
import { textFor } from '../../shared/i18n';
import { Language } from '../session/sessionTypes';
import {
  AIContextActions,
  AIContextActionsHandle,
} from '../assist/AIContextActions';
import { MiaoTaskAgent } from './MiaoTaskAgent';
import { MiaoCardViewState, nextMiaoCardState } from './miaoCardState';
import { useMiaoCardGesture } from './useMiaoCardGesture';
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
  updatedLabel,
  participantIds,
  agents,
  palette,
  language,
  grid,
  failed,
  renderState,
  children,
  uiPreferences,
  active = true,
  viewState: controlledViewState,
  onViewStateChange,
  ...actions
}: Omit<
  React.ComponentProps<typeof AIContextActions>,
  'children' | 'style' | 'ref'
> & {
  goal: string;
  status: string;
  detail?: string | null;
  updatedLabel?: string;
  participantIds: string[];
  agents: AgentDTO[];
  palette: Palette;
  language: Language;
  grid: boolean;
  failed: boolean;
  /** Content for the PDF's S1/S2 states. Summary children stay in S0. */
  renderState?: (state: MiaoCardViewState) => React.ReactNode;
  children?: React.ReactNode;
  uiPreferences?: UIPreferences;
  active?: boolean;
  viewState?: MiaoCardViewState;
  onViewStateChange?: (state: MiaoCardViewState) => void;
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
  const [localViewState, setLocalViewState] =
    useState<MiaoCardViewState>('summary');
  const viewState = controlledViewState ?? localViewState;
  const setViewState = useCallback(
    (next: MiaoCardViewState) => {
      if (controlledViewState === undefined) setLocalViewState(next);
      onViewStateChange?.(next);
    },
    [controlledViewState, onViewStateChange],
  );
  const translateX = useRef(new Animated.Value(0)).current;
  const assistSurface = useRef<AIContextActionsHandle>(null);
  const suppressPressUntil = useRef(0);
  const detailText = detail?.trim();
  const showDetail =
    detailText && detailText !== goal.trim() && detailText !== status.trim();
  const participants = participantIds.map(id => ({
    id,
    agent: agents.find(candidate => candidate.key === id),
  }));
  const DetailsIcon = viewState === 'summary' ? ChevronDown : ChevronUp;
  const agentNodes = participants.map(({ id, agent }) => (
    <MiaoTaskAgent
      key={id}
      agentId={id}
      agent={agent}
      palette={palette}
      language={language}
      size={grid ? 26 : 30}
      header
      gridHeader={grid}
      showName
      constrainName
    />
  ));
  const participantsVisible = participantsPreference.visible !== false;
  // Legacy single-task cards only supply navigation. Inline states require an
  // explicit renderer so their tap/swipe can never reveal an empty body.
  const inlineStatesAvailable = Boolean(renderState);
  const participantsGestureEnabled =
    inlineStatesAvailable && participantsVisible;
  const detailsGestureEnabled =
    inlineStatesAvailable && detailsPreference.visible !== false;
  // The PDF's disclosure expands the current result in this same card. The
  // participant count is the separate entry into S1.
  const showDetailsAction = detailsGestureEnabled || viewState !== 'summary';
  const detailsActionLabel =
    viewState === 'agents'
      ? textFor(language, '收起 Agent', 'Collapse Agents')
      : viewState === 'detail'
      ? textFor(language, '收起详情', 'Collapse details')
      : detailsPreference.label ||
        textFor(language, '展开详情', 'Expand details');
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
    [setViewState, translateX],
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
          ? (participantsGestureEnabled &&
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
      participantsGestureEnabled,
      resetTranslation,
      viewState,
    ],
  );
  const panHandlers = useMiaoCardGesture({
    enabled:
      active &&
      ((participantsGestureEnabled && participantsGesture.enabled) ||
        (detailsGestureEnabled && detailsGesture.enabled)),
    width,
    translation: translateX,
    finish: finishSwipe,
    reset: resetTranslation,
  });
  const stateContent =
    viewState === 'summary' ? children : renderState?.(viewState);
  const participantAction =
    participants.length && participantsGestureEnabled ? (
      <Pressable
        key="participants"
        testID="miao-card-participants-action"
        accessible
        accessibilityRole="button"
        accessibilityLabel={
          participantsPreference.label || `查看 ${participants.length} 个 Agent`
        }
        accessibilityState={{ expanded: viewState === 'agents' }}
        hitSlop={8}
        onPress={event => {
          event.stopPropagation();
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setViewState(viewState === 'agents' ? 'summary' : 'agents');
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
      accessible
      accessibilityRole="button"
      accessibilityLabel={detailsActionLabel}
      accessibilityState={{ expanded: viewState === 'detail' }}
      onPress={event => {
        event.stopPropagation();
        animateState(
          viewState === 'summary' ? 'detail' : 'summary',
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
        <DetailsIcon
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
        {detailsActionLabel}
      </Text>
    </Pressable>
  ) : null;
  const pressCard = () => {
    if (Date.now() < suppressPressUntil.current) return;
    if (!inlineStatesAvailable) {
      onOpen();
      return;
    }
    // A summary tap expands S2 in place. The content menu retains the
    // explicit full-workspace action; reading S1/S2 never navigates.
    if (viewState === 'summary' && detailsGestureEnabled)
      animateState('detail', detailsGesture.animationMs);
  };
  const title = (
    <Text
      accessible={!inlineStatesAvailable}
      numberOfLines={grid ? 5 : 3}
      style={[
        s.description,
        {
          color: palette.text,
          fontSize: uiFontSize(uiPreferences, 15.5),
        },
      ]}
    >
      {highlightTaskNumbers(goal)}
    </Text>
  );
  return (
    <Animated.View
      {...panHandlers}
      testID="miao-card-gesture-surface"
      style={grid ? s.grid : undefined}
    >
      <AIContextActions
        {...assistActions}
        ref={assistSurface}
        accessible={!inlineStatesAvailable}
        object={object}
        palette={palette}
        language={language}
        onOpen={onOpen}
        openLabel={openLabel}
        onPressOverride={pressCard}
        style={[
          s.card,
          {
            backgroundColor: palette.surface,
            borderColor: palette.border,
            borderRadius: uiPreferences?.surfaces.miao.cardRadius ?? 10,
          },
        ]}
      >
        {participantsSlot === 'topRight' && participantAction ? (
          <View testID="miao-card-top-right-actions" style={s.topRightActions}>
            {participantAction}
          </View>
        ) : null}
        <View testID="miao-card-agent-header" style={s.headerRow}>
          <View style={[s.agentStrip, grid && s.gridAgentStrip]}>
            {participantsVisible ? agentNodes : null}
          </View>
          <Pressable
            testID="miao-card-content-menu"
            accessible
            accessibilityRole="button"
            accessibilityLabel={
              object.kind === 'agent-workspace'
                ? textFor(
                    language,
                    '更多协作操作',
                    'More collaboration actions',
                  )
                : textFor(language, '更多任务操作', 'More task actions')
            }
            onPress={event => {
              event.stopPropagation();
              if (Date.now() < suppressPressUntil.current) return;
              assistSurface.current?.openMenu();
            }}
            style={s.menuAction}
          >
            <MoreHorizontal
              accessible={false}
              color={palette.secondaryText}
              size={22}
              strokeWidth={1.6}
            />
          </Pressable>
        </View>
        <Animated.View
          testID="miao-card-animated-content"
          style={{ transform: [{ translateX }] }}
        >
          {viewState !== 'agents' ? (
            inlineStatesAvailable ? (
              <Pressable
                testID="miao-card-title-action"
                accessible
                accessibilityLabel={goal}
                accessibilityRole={
                  viewState === 'summary' && detailsGestureEnabled
                    ? 'button'
                    : 'header'
                }
                disabled={viewState !== 'summary' || !detailsGestureEnabled}
                onPress={event => {
                  event.stopPropagation();
                  pressCard();
                }}
                style={s.titleAction}
              >
                {title}
              </Pressable>
            ) : (
              title
            )
          ) : null}
          {viewState === 'summary' && showDetail ? (
            <Text
              numberOfLines={2}
              style={[s.detail, { color: palette.secondaryText }]}
            >
              {detailText}
            </Text>
          ) : null}
          {stateContent}
        </Animated.View>
        <View style={[s.footer, { gap: Math.max(4, miaoRowGap / 2) }]}>
          <View style={s.footerMeta}>
            {taskStatus}
            {updatedLabel ? (
              <Text
                testID="miao-card-update-time"
                style={[s.status, { color: palette.secondaryText }]}
              >
                {updatedLabel}
              </Text>
            ) : null}
          </View>
          <View
            testID="miao-card-footer-actions"
            style={[s.footerActions, { gap: Math.max(4, miaoRowGap / 2) }]}
          >
            {actionOrder.map(id =>
              id === 'miao.taskCard.participants'
                ? participantsSlot !== 'topRight'
                  ? participantAction
                  : null
                : detailsAction,
            )}
          </View>
        </View>
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
  // PDF content card: persistent Agent header, replaceable body, shared footer.
  card: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
    padding: 12,
    overflow: 'hidden',
  },
  grid: {
    flex: 1,
    minWidth: 0,
  },
  headerRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 8 },
  titleAction: { minHeight: 44, justifyContent: 'center' },
  menuAction: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 44,
  },
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    marginTop: 8,
    minHeight: 33,
  },
  agentStrip: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    rowGap: 8,
  },
  gridAgentStrip: { gap: 4, rowGap: 4 },
  footerMeta: { gap: 2, flexShrink: 1 },
  footerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    flex: 1,
    gap: 4,
    justifyContent: 'flex-end',
  },
  status: { fontSize: 11, lineHeight: 16, maxWidth: 90 },
  // In a two-column card, status must not take the avatar viewport's width.
  gridStatus: { maxWidth: '100%' },
  description: {
    fontSize: 15.5,
    lineHeight: 24,
    fontWeight: '600',
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
