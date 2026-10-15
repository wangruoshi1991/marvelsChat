import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AgentDTO, StationMediaAssetDTO } from '../../models/api';
import {
  AgentWorkspace,
  WorkspaceArtifact,
  WorkspaceOperation,
  workspaceReviewKey,
} from '../../models/agentWorkspace';
import { agentWorkspaceApi } from '../../services/api/agentWorkspaceApi';
import { MiaoxunApiError } from '../../services/api/http';
import { Palette } from '../../shared/theme';
import { Header } from '../../shared/ui';
import { textFor } from '../../shared/i18n';
import { workspacePalette } from '../../shared/workspacePalette';
import {
  WorkspaceButton,
  WorkspacePanel,
  WorkspaceState,
  workspaceStyles,
  workspaceTokens,
} from '../../shared/workspaceUi';
import { ContextReference } from '../ai/AIInteraction';
import { MiaoTaskAgent } from '../miao/MiaoTaskAgent';
import { Language } from '../session/sessionTypes';
import { SiteDocumentPreview } from '../site-document/SiteDocumentPreview';
import { StationMediaPreviewScreen } from '../station/StationMediaPreviewScreen';
import { agentScopeListLabel } from '../agents/agentPresentation';
import { workspaceStatusLabel } from './workspacePresentation';
import { WorkspaceMediaResult } from './WorkspaceMediaResult';
import { WorkspaceTextResult } from './WorkspaceTextResult';

type Props = {
  token: string;
  workspace: AgentWorkspace;
  agents: AgentDTO[];
  palette: Palette;
  language: Language;
  onClose: () => void;
  onManageAgents: () => void;
  onNewTask: (workspace: AgentWorkspace) => void;
};
export function AgentWorkspaceScreen(props: Props) {
  return (
    <WorkspaceScreen key={`${props.token}:${props.workspace.id}`} {...props} />
  );
}
function WorkspaceScreen({
  token,
  workspace: initial,
  agents,
  palette,
  language,
  onClose,
  onManageAgents,
  onNewTask,
}: Props) {
  const colors = workspacePalette(palette);
  const [workspace, setWorkspace] = useState<AgentWorkspace | null>(null);
  const current = useRef<AgentWorkspace | null>(null);
  const [error, setError] = useState('');
  const [decisionError, setDecisionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState('');
  const [reviewed, setReviewed] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [media, setMedia] = useState<{
    asset: StationMediaAssetDTO;
    timestampMs: number | null;
  } | null>(null);
  const [textRefreshKey, setTextRefreshKey] = useState(0);
  const [foreground, setForeground] = useState(
    AppState.currentState !== 'background' &&
      AppState.currentState !== 'inactive',
  );
  const alive = useRef(true);
  const foregroundRef = useRef(foreground);
  const pending = useRef(false);
  const sequence = useRef(0);
  const mediaSequence = useRef(0);
  const accept = useCallback((next: AgentWorkspace) => {
    if (!current.current || next.revision >= current.current.revision) {
      current.current = next;
      setWorkspace(next);
    }
  }, []);
  const refresh = useCallback(async () => {
    if (!alive.current || !foregroundRef.current || pending.current) return;
    const seq = ++sequence.current;
    try {
      const next = await agentWorkspaceApi.get(token, initial.id);
      if (!alive.current || !foregroundRef.current || sequence.current !== seq)
        return;
      accept(next);
      setError('');
    } catch (issue) {
      if (!alive.current || sequence.current !== seq) return;
      if (
        issue instanceof MiaoxunApiError &&
        [401, 403, 404].includes(issue.status || 0)
      ) {
        current.current = null;
        setWorkspace(null);
        setPreview(null);
        setMedia(null);
        setReviewed('');
      }
      setError(issue instanceof Error ? issue.message : '无法读取协作进展。');
    }
  }, [accept, initial.id, token]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      sequence.current += 1;
      mediaSequence.current += 1;
    };
  }, []);
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      foregroundRef.current = state === 'active';
      setForeground(state === 'active');
      if (state !== 'active') {
        sequence.current += 1;
        mediaSequence.current += 1;
        setReviewed('');
        setMedia(null);
      }
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!foreground) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await refresh();
      if (active) timer = setTimeout(poll, 3000);
    };
    poll();
    return () => {
      active = false;
      clearTimeout(timer);
      sequence.current += 1;
    };
  }, [foreground, refresh]);
  useEffect(() => {
    setReply('');
  }, [workspace?.question, workspace?.status]);
  const decide = async (operation: WorkspaceOperation) => {
    const shown = current.current;
    if (
      !shown ||
      !alive.current ||
      !foregroundRef.current ||
      pending.current ||
      !shown.allowedActions.includes(operation)
    )
      return;
    if (operation === 'confirm' && reviewed !== workspaceReviewKey(shown))
      return;
    if (operation === 'reply' && !reply.trim()) return;
    pending.current = true;
    sequence.current += 1;
    setBusy(true);
    setDecisionError('');
    try {
      const updated = await agentWorkspaceApi.decide(
        token,
        shown,
        operation,
        operation === 'reply' ? reply.trim() : undefined,
      );
      if (!alive.current || !foregroundRef.current) return;
      accept(updated);
      setReviewed('');
      if (operation === 'reply') setReply('');
    } catch (issue) {
      if (alive.current && foregroundRef.current) {
        setReviewed('');
        setDecisionError(
          issue instanceof Error
            ? `${issue.message} 请刷新确认当前进展后再操作。`
            : '操作结果尚未确认，请刷新协作进展。',
        );
      }
    } finally {
      pending.current = false;
      if (alive.current) {
        setBusy(false);
        refresh();
      }
    }
  };
  const openMedia = async (
    artifact: Extract<WorkspaceArtifact, { kind: 'media_selection' }>,
    index: number,
  ) => {
    if (!foregroundRef.current) return;
    const selected = artifact.assets[index];
    const seq = ++mediaSequence.current;
    const revision = current.current?.revision ?? initial.revision;
    setDecisionError('');
    try {
      const asset = await agentWorkspaceApi.media(
        token,
        initial.id,
        selected.id,
      );
      if (
        alive.current &&
        foregroundRef.current &&
        seq === mediaSequence.current &&
        current.current?.revision === revision &&
        [
          current.current.result,
          ...current.current.steps.map(step => step.result),
        ].some(
          result =>
            result?.kind === 'media_selection' &&
            result.assets.some(
              item =>
                item.id === selected.id && item.version === selected.version,
            ),
        )
      )
        setMedia({ asset, timestampMs: selected.matchedFrameTimestampMs });
    } catch (issue) {
      if (alive.current && seq === mediaSequence.current)
        setDecisionError(
          issue instanceof Error ? issue.message : '素材读取失败。',
        );
    }
  };
  const resultView = (artifact: WorkspaceArtifact, key: string) => (
    <View key={key} style={s.result}>
      <Text style={[workspaceTokens.typography.title, { color: colors.text }]}>
        {artifact.title}
      </Text>
      {artifact.kind === 'site_draft' ? (
        <WorkspaceButton
          palette={colors}
          variant="secondary"
          label={textFor(language, '打开完整页面预览', 'Preview the full page')}
          disabled={!foreground || busy}
          onPress={() => {
            setReviewed('');
            setPreview(artifact.id);
          }}
        />
      ) : artifact.kind === 'text_result' ? (
        <WorkspaceTextResult
          artifact={artifact}
          token={token}
          workspaceId={initial.id}
          foreground={foreground}
          disabled={busy}
          refreshKey={textRefreshKey}
          palette={colors}
          language={language}
        />
      ) : artifact.assets.length ? (
        <WorkspaceMediaResult
          artifact={artifact}
          token={token}
          workspaceId={initial.id}
          revision={workspace?.revision ?? initial.revision}
          foreground={foreground}
          disabled={busy}
          palette={colors}
          language={language}
          onOpen={openMedia}
        />
      ) : (
        <Text style={{ color: colors.secondaryText }}>
          {textFor(language, '没有找到匹配的素材', 'No matching media found')}
        </Text>
      )}
    </View>
  );
  const approval = workspace?.approval;
  const reviewKey = workspace ? workspaceReviewKey(workspace) : '';
  return (
    <View style={[s.screen, { backgroundColor: colors.background }]}>
      <Header
        palette={colors}
        title={textFor(language, '协作工作空间', 'Agent workspace')}
        onBack={onClose}
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.content}
      >
        {error ? (
          <WorkspaceState
            palette={colors}
            tone="error"
            title={error}
            onRetry={refresh}
            retryLabel={textFor(language, '刷新进展', 'Refresh')}
          />
        ) : null}
        {!workspace && !error ? (
          <WorkspaceState
            palette={colors}
            busy
            title={textFor(language, '正在读取协作进展…', 'Loading workspace…')}
          />
        ) : null}
        {workspace ? (
          <>
            <WorkspacePanel palette={colors}>
              <Text
                style={[
                  workspaceTokens.typography.heading,
                  { color: colors.text },
                ]}
              >
                {workspace.goal}
              </Text>
              <ContextReference
                references={workspace.contextRefs}
                palette={colors}
                language={language}
              />
              <Text
                accessibilityLiveRegion="polite"
                style={[
                  workspaceTokens.typography.title,
                  { color: workspace.error ? colors.rose : colors.text },
                ]}
              >
                {workspace.inputRequest?.kind === 'agent_access'
                  ? textFor(language, '需要处理授权', 'Agent access required')
                  : workspaceStatusLabel(workspace.status, language)}
              </Text>
              {workspace.summary ? (
                <Text
                  style={[
                    workspaceTokens.typography.body,
                    { color: colors.text },
                  ]}
                >
                  {workspace.summary}
                </Text>
              ) : null}
              {workspace.error ? (
                <WorkspaceState
                  palette={colors}
                  tone="error"
                  title={workspace.error.message}
                />
              ) : null}
            </WorkspacePanel>
            {workspace.inputRequest?.kind === 'agent_access' ? (
              <WorkspacePanel palette={colors}>
                <Text
                  accessibilityRole="header"
                  style={[
                    workspaceTokens.typography.title,
                    { color: colors.text },
                  ]}
                >
                  {textFor(language, '当前待办', 'Action required')}
                </Text>
                <Text
                  style={[
                    workspaceTokens.typography.body,
                    { color: colors.text },
                  ]}
                >
                  {workspace.inputRequest.question}
                </Text>
                {workspace.inputRequest.requirements.map(requirement => (
                  <Text
                    key={`${requirement.agentId}:${requirement.capability}`}
                    style={[
                      workspaceTokens.typography.caption,
                      { color: colors.secondaryText },
                    ]}
                  >
                    {requirement.agentName} ·{' '}
                    {agentScopeListLabel(requirement.requiredScopes, language)}
                  </Text>
                ))}
                {workspace.inputRequest.nextAction ===
                'manage_agents_then_restart' ? (
                  <WorkspaceButton
                    testID="workspace-manage-access"
                    palette={colors}
                    label={textFor(
                      language,
                      '前往我的 Agent',
                      'Manage my agents',
                    )}
                    disabled={busy || !foreground}
                    onPress={onManageAgents}
                  />
                ) : null}
                <WorkspaceButton
                  testID="workspace-new-task"
                  palette={colors}
                  variant="secondary"
                  label={textFor(
                    language,
                    '以此目标准备新任务',
                    'Prepare a new task with this goal',
                  )}
                  disabled={busy || !foreground}
                  onPress={() => onNewTask(workspace)}
                />
                <Text
                  style={[
                    workspaceTokens.typography.caption,
                    { color: colors.secondaryText },
                  ]}
                >
                  {textFor(
                    language,
                    '将保留目标、已补充的要求和引用，先打开草稿，不会自动执行。',
                    'The draft retains your goal, follow-ups and references. Nothing runs until you submit it.',
                  )}
                </Text>
              </WorkspacePanel>
            ) : null}
            {workspace.inputRequest?.kind === 'clarification' &&
            workspace.allowedActions.includes('reply') ? (
              <WorkspacePanel palette={colors}>
                <Text
                  style={[
                    workspaceTokens.typography.title,
                    { color: colors.text },
                  ]}
                >
                  {workspace.question}
                </Text>
                <TextInput
                  testID="workspace-reply-input"
                  accessibilityLabel={textFor(
                    language,
                    '补充需求',
                    'Additional information',
                  )}
                  value={reply}
                  onChangeText={setReply}
                  multiline
                  maxLength={2000}
                  editable={!busy && foreground}
                  style={[
                    s.input,
                    { color: colors.text, borderColor: colors.border },
                  ]}
                />
                <WorkspaceButton
                  testID="workspace-reply"
                  palette={colors}
                  label={textFor(
                    language,
                    '提交补充并继续',
                    'Reply and continue',
                  )}
                  disabled={!reply.trim() || busy || !foreground}
                  onPress={() => decide('reply')}
                />
              </WorkspacePanel>
            ) : null}
            <Text
              accessibilityRole="header"
              style={[workspaceTokens.typography.title, { color: colors.text }]}
            >
              {textFor(language, '协作进展', 'Activity')}
            </Text>
            {workspace.steps
              .filter(step => step.capability !== 'workspace.coordinate')
              .map(step => (
                <WorkspacePanel key={step.id} palette={colors}>
                  <View style={s.stepHeader}>
                    <MiaoTaskAgent
                      agentId={step.agentId}
                      agent={agents.find(a => a.key === step.agentId)}
                      palette={colors}
                      language={language}
                    />
                    <Text
                      style={[
                        workspaceTokens.typography.caption,
                        { color: colors.secondaryText },
                      ]}
                    >
                      {workspaceStatusLabel(step.status, language)}
                    </Text>
                  </View>
                  <Text
                    style={[
                      workspaceTokens.typography.body,
                      { color: colors.text },
                    ]}
                  >
                    {step.goal}
                  </Text>
                  {(() => {
                    const incoming = step.dependencies
                      .map(key => {
                        const dependency = workspace.steps.find(
                          item => item.key === key,
                        );
                        return (
                          dependency &&
                          agents.find(agent => agent.key === dependency.agentId)
                            ?.name
                        );
                      })
                      .filter((name): name is string => Boolean(name));
                    const outgoing = workspace.steps
                      .filter(item => item.dependencies.includes(step.key))
                      .map(
                        item =>
                          agents.find(agent => agent.key === item.agentId)
                            ?.name,
                      )
                      .filter((name): name is string => Boolean(name));
                    return incoming.length || outgoing.length ? (
                      <Text
                        style={[
                          workspaceTokens.typography.caption,
                          { color: colors.secondaryText },
                        ]}
                      >
                        {[
                          incoming.length
                            ? `${textFor(
                                language,
                                '接收',
                                'Receives',
                              )} ${incoming.join('、')}`
                            : '',
                          outgoing.length
                            ? `${textFor(
                                language,
                                '交付给',
                                'Hands off to',
                              )} ${outgoing.join('、')}`
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    ) : null;
                  })()}
                  {step.summary ? (
                    <Text
                      style={[
                        workspaceTokens.typography.body,
                        { color: colors.secondaryText },
                      ]}
                    >
                      {workspace.inputRequest?.kind === 'clarification' &&
                      step.summary === workspace.inputRequest.question
                        ? textFor(
                            language,
                            '已提出补充问题，见当前待办。',
                            'Requested clarification; see the current action.',
                          )
                        : step.summary}
                    </Text>
                  ) : null}
                  {step.error ? (
                    <WorkspaceState
                      palette={colors}
                      tone="error"
                      title={step.error.message}
                    />
                  ) : null}
                  {step.status === 'succeeded' &&
                  step.result &&
                  (!workspace.result ||
                    JSON.stringify(step.result) !==
                      JSON.stringify(workspace.result))
                    ? resultView(step.result, step.id)
                    : null}
                </WorkspacePanel>
              ))}
            {workspace.result ? (
              <WorkspacePanel palette={colors}>
                {resultView(workspace.result, 'final')}
              </WorkspacePanel>
            ) : null}
            {workspace.status === 'awaiting_confirmation' ? (
              <Text
                style={[
                  workspaceTokens.typography.body,
                  { color: colors.secondaryText },
                ]}
              >
                {textFor(
                  language,
                  '完整预览页面后再确认保存，仅自己可见。',
                  'Review the full page before saving it privately.',
                )}
              </Text>
            ) : null}
            {decisionError ? (
              <WorkspaceState
                palette={colors}
                title={decisionError}
                tone="error"
              />
            ) : null}
            {workspace.allowedActions.includes('confirm') ? (
              <WorkspaceButton
                testID="workspace-confirm"
                palette={colors}
                label={textFor(language, '确认保存页面', 'Save page')}
                disabled={
                  busy || !foreground || !reviewKey || reviewed !== reviewKey
                }
                busy={busy}
                onPress={() => decide('confirm')}
              />
            ) : null}
            {workspace.allowedActions.includes('reject') ? (
              <WorkspaceButton
                palette={colors}
                variant="secondary"
                label={textFor(language, '不保存此方案', 'Discard proposal')}
                disabled={busy || !foreground}
                onPress={() => decide('reject')}
              />
            ) : null}
            {workspace.allowedActions.includes('cancel') ? (
              <WorkspaceButton
                testID="workspace-cancel"
                palette={colors}
                variant="secondary"
                label={textFor(language, '取消协作', 'Cancel workspace')}
                disabled={busy || !foreground}
                busy={busy}
                onPress={() => decide('cancel')}
              />
            ) : null}
            <WorkspaceButton
              palette={colors}
              variant="ghost"
              label={textFor(language, '刷新协作进展', 'Refresh workspace')}
              disabled={busy || !foreground}
              onPress={() => {
                setTextRefreshKey(value => value + 1);
                refresh();
              }}
            />
          </>
        ) : null}
      </ScrollView>
      {preview ? (
        <SiteDocumentPreview
          key={`${token}:${preview}:${reviewKey}`}
          draftId={preview}
          token={token}
          active={foreground}
          palette={colors}
          language={language}
          expected={
            approval?.draftId === preview
              ? {
                  documentHash: approval.draftHash,
                  resourcesHash: approval.resourcesHash,
                }
              : undefined
          }
          onReviewed={() => setReviewed(reviewKey)}
          onInvalidated={() => setReviewed('')}
          onClose={() => setPreview(null)}
        />
      ) : null}
      {media ? (
        <Modal
          visible={foreground}
          animationType="slide"
          onRequestClose={() => setMedia(null)}
        >
          <SafeAreaView
            style={[s.screen, { backgroundColor: colors.background }]}
          >
            <StationMediaPreviewScreen
              asset={media.asset}
              token={token}
              timestampMs={media.timestampMs}
              palette={colors}
              language={language}
              onBack={() => setMedia(null)}
              onUnavailable={() => {
                setMedia(null);
                setDecisionError(
                  textFor(
                    language,
                    '素材已不可用，请刷新结果。',
                    'Media is unavailable. Refresh the result.',
                  ),
                );
              }}
            />
          </SafeAreaView>
        </Modal>
      ) : null}
    </View>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    ...workspaceStyles.content,
    paddingBottom: 32,
    gap: workspaceTokens.space.lg,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  result: { gap: 12 },
  input: {
    borderWidth: 1,
    borderRadius: workspaceTokens.radius.control,
    padding: 12,
    minHeight: 90,
    textAlignVertical: 'top',
    ...workspaceTokens.typography.body,
  },
});
