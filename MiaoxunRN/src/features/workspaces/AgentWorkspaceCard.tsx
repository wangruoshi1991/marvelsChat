import React from 'react';
import { useEffect, useState } from 'react';
import {
  AppState,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AgentDTO } from '../../models/api';
import { AgentWorkspace } from '../../models/agentWorkspace';
import { Palette } from '../../shared/theme';
import { Language } from '../session/sessionTypes';
import { MiaoTaskCard } from '../miao/MiaoTaskCard';
import type { UIPreferences } from '../ui/uiPreferenceTypes';
import { MiaoTaskAgent, taskAgentDisplayName } from '../miao/MiaoTaskAgent';
import {
  workspaceCardPresentation,
  workspaceStatusLabel,
} from './workspacePresentation';
import { workspaceAssistContext } from '../assist/workspaceAssistContext';
import { textFor } from '../../shared/i18n';
import { WorkspaceTextResult } from './WorkspaceTextResult';
import {
  MiaoParticipantProjection,
  MiaoCardViewState,
  participantProjection,
} from '../miao/miaoCardState';

export function AgentWorkspaceCard({
  workspace,
  token,
  active,
  agents,
  palette,
  language,
  onOpen,
  onOpenParticipant,
  grid,
  uiPreferences,
  viewState,
  onViewStateChange,
}: {
  workspace: AgentWorkspace;
  token: string;
  active: boolean;
  agents: AgentDTO[];
  palette: Palette;
  language: Language;
  onOpen: () => void;
  onOpenParticipant?: (step: AgentWorkspace['steps'][number]) => void;
  grid: boolean;
  uiPreferences?: UIPreferences;
  viewState?: MiaoCardViewState;
  onViewStateChange?: (state: MiaoCardViewState) => void;
}) {
  const [foreground, setForeground] = useState(
    AppState.currentState !== 'background' &&
      AppState.currentState !== 'inactive',
  );
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      setForeground(state === 'active');
    });
    return () => subscription.remove();
  }, []);
  const [selectedParticipant, setSelectedParticipant] =
    useState<MiaoParticipantProjection | null>(null);
  const participantItems = participantProjection(workspace, agents).filter(
    item => item.step.round === workspace.currentRound,
  );
  // Keep every real workspace participant reachable. The coordinator row is
  // useful context when a specialist has no direct chat message of its own.
  const participants = participantItems.map(item => item.agentId);
  const content = workspaceCardPresentation(workspace, language);
  const activities = content.activities.map(activity => ({
    ...activity,
    name: taskAgentDisplayName(
      agents.find(agent => agent.key === activity.agentId),
      language,
    ),
  }));
  const status = workspaceStatusLabel(
    workspace.status,
    language,
    workspace.executionMode,
  );
  const activityText = activities.map(
    activity => `${activity.name} · ${activity.description}`,
  );
  const outcomeText = content.outcome
    ? `${content.outcome.label}：${content.outcome.title}`
    : null;
  return (
    <>
      <MiaoTaskCard
        viewState={viewState}
        onViewStateChange={onViewStateChange}
        active={active && foreground}
        testID={`miao-workspace-${workspace.id}`}
        object={workspaceAssistContext(workspace, agents, language)}
        goal={workspace.goal}
        status={status}
        // S0 keeps the single real workspace summary. S1/S2 replace the body
        // with participant/current-result content instead of duplicating it.
        detail={content.detail}
        updatedLabel={workspaceUpdatedLabel(workspace.updatedAt, language)}
        participantIds={participants}
        agents={agents}
        grid={grid}
        failed={Boolean(workspace.error)}
        uiPreferences={uiPreferences}
        palette={palette}
        language={language}
        openLabel={
          workspace.executionMode === 'direct'
            ? textFor(language, '查看任务', 'View task')
            : textFor(language, '查看协作', 'View workspace')
        }
        accessibilityLabel={[
          workspace.goal,
          status,
          content.detail,
          ...activityText,
          content.attention,
          outcomeText,
        ]
          .filter(Boolean)
          .join(' · ')}
        onOpen={onOpen}
        renderState={state => {
          if (state === 'agents') {
            return (
              <View style={s.agentList} testID="miao-workspace-participants">
                {participantItems.length ? (
                  participantItems.map(({ step, agent }) => {
                    const summary = step.summary.trim() || step.goal.trim();
                    return (
                      <View
                        key={step.id}
                        style={[
                          s.agentRow,
                          { borderBottomColor: palette.border },
                        ]}
                      >
                        <MiaoTaskAgent
                          agentId={step.agentId}
                          agent={agent || undefined}
                          palette={palette}
                          language={language}
                          compact
                          showName={false}
                          size={30}
                        />
                        <View style={s.agentCopy}>
                          <Text style={[s.agentRole, { color: palette.text }]}>
                            {taskAgentDisplayName(agent || undefined, language)}
                          </Text>
                          <Text
                            numberOfLines={2}
                            style={[s.agentRole, { color: palette.text }]}
                          >
                            {step.goal}
                          </Text>
                          <Text
                            numberOfLines={2}
                            style={[s.detail, { color: palette.secondaryText }]}
                          >
                            {summary ||
                              textFor(
                                language,
                                '正在等待本 Agent 的结果',
                                'Waiting for this Agent',
                              )}
                          </Text>
                          <Text
                            style={[
                              s.agentMeta,
                              { color: palette.secondaryText },
                            ]}
                          >
                            {workspaceUpdatedLabel(step.updatedAt, language)}
                          </Text>
                        </View>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`查看 ${taskAgentDisplayName(
                            agent || undefined,
                            language,
                          )} 详情`}
                          onPress={() =>
                            setSelectedParticipant({
                              step,
                              agentId: step.agentId,
                              agent,
                            })
                          }
                          style={s.agentDetail}
                        >
                          <Text style={[s.detailLink, { color: palette.text }]}>
                            {textFor(language, '详情', 'Details')}
                          </Text>
                        </Pressable>
                      </View>
                    );
                  })
                ) : (
                  <Text style={[s.detail, { color: palette.secondaryText }]}>
                    {textFor(
                      language,
                      '暂时没有可展示的参与结果。',
                      'No participant result is available yet.',
                    )}
                  </Text>
                )}
              </View>
            );
          }
          // Participant rows collapse repeated Agent steps, while deliveries
          // must retain an earlier success even if that Agent later failed.
          const finalStep = workspace.steps
            .filter(
              step =>
                step.round === workspace.currentRound &&
                step.status === 'succeeded' &&
                step.result,
            )
            .sort(
              (left, right) =>
                Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
            )[0];
          const artifact = workspace.result || finalStep?.result;
          const detail = finalStep?.summary.trim() || workspace.summary.trim();
          return (
            <View style={s.detailPanel} testID="miao-workspace-detail">
              {artifact ? (
                <Text style={[s.resultTitle, { color: palette.text }]}>
                  {artifact.title}
                </Text>
              ) : null}
              <Text
                numberOfLines={3}
                style={[s.detail, { color: palette.secondaryText }]}
              >
                {detail ||
                  textFor(
                    language,
                    '协作结果正在整理中。',
                    'The collaboration result is still being prepared.',
                  )}
              </Text>
              {artifact?.kind === 'text_result' ? (
                <View
                  testID="miao-workspace-text-reader"
                  accessibilityLabel={textFor(
                    language,
                    '当前文字成果',
                    'Current text result',
                  )}
                  style={s.textResultReader}
                >
                  <WorkspaceTextResult
                    artifact={artifact}
                    token={token}
                    workspaceId={workspace.id}
                    foreground={active && foreground && Boolean(token)}
                    disabled={!active || !foreground}
                    // A workspace revision advances during normal worker
                    // polling. Keep the visible result mounted until the
                    // current round or artifact itself changes.
                    refreshKey={workspace.currentRound}
                    palette={palette}
                    language={language}
                  />
                </View>
              ) : null}
            </View>
          );
        }}
      >
        {activities.length || content.attention || content.outcome ? (
          <View style={s.activity}>
            {activities.map((activity, index) => (
              <Text
                key={activity.id}
                testID={`workspace-active-${activity.id}`}
                numberOfLines={2}
                accessibilityLabel={activityText[index]}
                style={[s.detail, { color: palette.secondaryText }]}
              >
                <Text style={s.name}>{activity.name}</Text>
                {' · '}
                {activity.description}
              </Text>
            ))}
            {content.attention ? (
              <Text
                testID="workspace-card-attention"
                numberOfLines={3}
                style={[s.attention, { color: palette.text }]}
              >
                {content.attention}
              </Text>
            ) : null}
            {outcomeText ? (
              <Text
                testID="workspace-card-outcome"
                numberOfLines={2}
                style={[s.detail, { color: palette.secondaryText }]}
              >
                {outcomeText}
              </Text>
            ) : null}
          </View>
        ) : null}
      </MiaoTaskCard>
      <Modal
        visible={Boolean(selectedParticipant)}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedParticipant(null)}
      >
        <View
          accessible={false}
          accessibilityViewIsModal
          onAccessibilityEscape={() => setSelectedParticipant(null)}
          style={s.modalContainer}
        >
          <Pressable
            accessible
            accessibilityRole="button"
            accessibilityLabel={textFor(
              language,
              '关闭 Agent 详情',
              'Close Agent details',
            )}
            style={s.modalBackdrop}
            onPress={() => setSelectedParticipant(null)}
          />
          <View
            accessible={false}
            style={[
              s.modalSheet,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            {selectedParticipant ? (
              <>
                <View style={s.modalHeader}>
                  <View style={s.modalAgent}>
                    <MiaoTaskAgent
                      agentId={selectedParticipant.agentId}
                      agent={selectedParticipant.agent || undefined}
                      palette={palette}
                      language={language}
                      compact
                    />
                  </View>
                  <Pressable
                    accessible
                    accessibilityRole="button"
                    accessibilityLabel={textFor(language, '关闭', 'Close')}
                    onPress={() => setSelectedParticipant(null)}
                    style={s.closeButton}
                  >
                    <Text style={[s.detailLink, { color: palette.text }]}>
                      ×
                    </Text>
                  </Pressable>
                </View>
                <ScrollView
                  accessible={false}
                  testID="workspace-participant-reader"
                  directionalLockEnabled
                  nestedScrollEnabled
                  style={s.modalBody}
                  contentContainerStyle={s.modalBodyContent}
                >
                  <Text style={[s.modalRole, { color: palette.text }]}>
                    {selectedParticipant.step.goal}
                  </Text>
                  <Text style={[s.modalMeta, { color: palette.secondaryText }]}>
                    {workspaceUpdatedLabel(
                      selectedParticipant.step.updatedAt,
                      language,
                    )}
                    {' · '}
                    {workspaceStatusLabel(
                      selectedParticipant.step.status,
                      language,
                      workspace.executionMode,
                    )}
                  </Text>
                  <Text
                    style={[s.modalSummary, { color: palette.secondaryText }]}
                  >
                    {selectedParticipant.step.summary.trim() ||
                      textFor(
                        language,
                        '该 Agent 尚未提交摘要。',
                        'This Agent has not submitted a summary yet.',
                      )}
                  </Text>
                </ScrollView>
                <Pressable
                  accessible
                  accessibilityRole="button"
                  accessibilityLabel={textFor(
                    language,
                    onOpenParticipant ? '打开 Agent 对话' : '查看协作详情',
                    onOpenParticipant
                      ? 'Open Agent chat'
                      : 'View collaboration details',
                  )}
                  onPress={() => {
                    setSelectedParticipant(null);
                    if (onOpenParticipant)
                      onOpenParticipant(selectedParticipant.step);
                    else onOpen();
                  }}
                  style={[s.modalAction, { backgroundColor: palette.text }]}
                >
                  <Text style={[s.modalActionText, { color: palette.surface }]}>
                    {onOpenParticipant
                      ? textFor(language, '打开 Agent 对话', 'Open Agent chat')
                      : textFor(
                          language,
                          '查看协作详情',
                          'View collaboration details',
                        )}
                  </Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </>
  );
}

function workspaceUpdatedLabel(value: string, language: Language) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return textFor(language, '最近更新未知', 'Update time unavailable');
  }
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (language === 'zh') {
    if (minutes < 1) return '刚刚更新';
    if (minutes < 60) return `${minutes} 分钟前更新`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} 小时前更新`;
    return `${Math.floor(hours / 24)} 天前更新`;
  }
  if (minutes < 1) return 'Updated just now';
  if (minutes < 60) return `Updated ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Updated ${hours}h ago`;
  return `Updated ${Math.floor(hours / 24)}d ago`;
}

const s = StyleSheet.create({
  activity: { gap: 6 },
  detail: { fontSize: 13, lineHeight: 20 },
  name: { fontWeight: '600' },
  attention: { fontSize: 14, lineHeight: 21, fontWeight: '500' },
  agentList: { gap: 0 },
  agentRow: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#d9d9d9',
    flexDirection: 'row',
    gap: 10,
    minHeight: 68,
    paddingVertical: 10,
  },
  agentCopy: { flex: 1, gap: 3, minWidth: 0 },
  agentRole: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  agentMeta: { fontSize: 11, lineHeight: 15 },
  agentDetail: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailLink: { fontSize: 12, lineHeight: 17, fontWeight: '600' },
  detailPanel: { gap: 8, paddingTop: 4 },
  // S2 grows the current feed item; the outer list owns vertical reading.
  textResultReader: { minHeight: 48 },
  resultTitle: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 12,
    maxHeight: '85%',
    padding: 20,
    paddingBottom: 30,
  },
  modalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  modalAgent: { flex: 1, minWidth: 0 },
  modalBody: { flexGrow: 0, flexShrink: 1 },
  modalBodyContent: { gap: 12 },
  closeButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  modalRole: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  modalMeta: { fontSize: 12, lineHeight: 17 },
  modalSummary: { fontSize: 14, lineHeight: 22 },
  modalAction: { alignItems: 'center', borderRadius: 12, paddingVertical: 13 },
  modalActionText: { fontSize: 14, fontWeight: '600' },
});
