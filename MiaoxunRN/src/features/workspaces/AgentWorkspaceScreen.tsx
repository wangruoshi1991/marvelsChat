import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  WorkspaceContinuationDraft,
  WorkspaceContextSelector,
  isWorkspaceContextSelector,
  sameWorkspaceContext,
  workspaceContextSelector,
} from '../../models/workspaceContext';
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
  WorkspaceContinuationAttempt,
  workspaceReviewKey,
  workspaceArtifactsMatch,
} from '../../models/agentWorkspace';
import { agentWorkspaceApi } from '../../services/api/agentWorkspaceApi';
import { workspaceContinuationStore } from '../../services/workspaceContinuationStore';
import { MiaoxunApiError } from '../../services/api/http';
import { Palette } from '../../shared/theme';
import { createIdempotencyKey } from '../../shared/createIdempotencyKey';
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

// These contract-5 errors are emitted only after no permanent receipt exists.
// ACCESS_REVOKED is intentionally excluded: accepted replays also check account access.
const definiteContinuationRejections = new Set([
  'WORKSPACE_REVISION_CONFLICT',
  'WORKSPACE_SOURCES_CHANGED',
  'WORKSPACE_CONTINUATION_UNAVAILABLE',
  'WORKSPACE_AGENT_CHANGED',
  'WORKSPACE_MEDIA_CHANGED',
  'AI_CONTEXT_CHANGED',
]);

type Props = {
  token: string;
  userId: string;
  workspace: AgentWorkspace;
  agents: AgentDTO[];
  palette: Palette;
  language: Language;
  onClose: () => void;
  onManageAgents: () => void;
  onNewTask: (workspace: AgentWorkspace) => void;
  onOpenSource?: (workspace: AgentWorkspace) => void;
  initialContinuationDraft?: WorkspaceContinuationDraft;
  onContinuationDraftConsumed?: () => void;
};
export function AgentWorkspaceScreen(props: Props) {
  return (
    <WorkspaceScreen
      key={`${props.token}:${props.userId}:${props.workspace.id}`}
      {...props}
    />
  );
}
function WorkspaceScreen({
  token,
  userId,
  workspace: initial,
  agents,
  palette,
  language,
  onClose,
  onManageAgents,
  onNewTask,
  onOpenSource,
  initialContinuationDraft,
  onContinuationDraftConsumed,
}: Props) {
  const colors = workspacePalette(palette);
  const [workspace, setWorkspace] = useState<AgentWorkspace | null>(null);
  const current = useRef<AgentWorkspace | null>(null);
  const [error, setError] = useState('');
  const [decisionError, setDecisionError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState('');
  const [continuationOpen, setContinuationOpen] = useState(false);
  const [continuation, setContinuation] = useState('');
  const [continuationBase, setContinuationBase] =
    useState<WorkspaceContextSelector | null>(null);
  const consumedDraft = useRef<string | null>(null);
  const [historyRound, setHistoryRound] = useState<number | null>(null);
  const [continuationUnknown, setContinuationUnknown] = useState(false);
  const [continuationAccessIssue, setContinuationAccessIssue] = useState(false);
  const [continuationConflictRevision, setContinuationConflictRevision] =
    useState<number | null>(null);
  const continuationAttempt = useRef<WorkspaceContinuationAttempt | null>(null);
  const continuationReceipt = useRef<
    | { kind: 'accepted'; workspace: AgentWorkspace }
    | { kind: 'rejected'; message: string; revision: number | null }
    | null
  >(null);
  const [continuationStorage, setContinuationStorage] = useState<
    'loading' | 'ready' | 'failed'
  >('loading');
  const [continuationStorageError, setContinuationStorageError] = useState('');
  const [continuationRestoreVersion, setContinuationRestoreVersion] =
    useState(0);
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
    let active = true;
    setContinuationStorage('loading');
    setContinuationStorageError('');
    workspaceContinuationStore.read(userId, initial.id).then(
      saved => {
        if (!active || !alive.current) return;
        continuationAttempt.current = saved;
        setContinuationUnknown(Boolean(saved));
        setContinuationStorage('ready');
      },
      issue => {
        if (!active || !alive.current) return;
        setContinuationStorage('failed');
        setContinuationStorageError(
          issue instanceof Error ? issue.message : '无法读取修改提交记录。',
        );
      },
    );
    return () => {
      active = false;
    };
  }, [userId, initial.id, continuationRestoreVersion]);
  const acceptIncomingDraft = useCallback(() => {
    if (
      !initialContinuationDraft ||
      consumedDraft.current === initialContinuationDraft.draftId ||
      !current.current ||
      continuationStorage !== 'ready' ||
      continuationUnknown ||
      !foregroundRef.current ||
      pending.current
    )
      return;
    if (
      !isWorkspaceContextSelector(initialContinuationDraft) ||
      initialContinuationDraft.id !== initial.id ||
      typeof initialContinuationDraft.draftId !== 'string' ||
      !initialContinuationDraft.draftId ||
      typeof initialContinuationDraft.text !== 'string' ||
      !initialContinuationDraft.text.trim() ||
      initialContinuationDraft.text.length > 2000
    ) {
      setDecisionError('带入的修改草稿无效，请返回管家重新编辑。');
      return;
    }
    consumedDraft.current = initialContinuationDraft.draftId;
    setContinuation(initialContinuationDraft.text);
    setContinuationBase(workspaceContextSelector(initialContinuationDraft));
    setContinuationOpen(true);
    onContinuationDraftConsumed?.();
  }, [
    initialContinuationDraft,
    initial.id,
    continuationStorage,
    continuationUnknown,
    onContinuationDraftConsumed,
  ]);
  useEffect(() => {
    if (!continuationOpen && !continuation.trim() && workspace && foreground)
      acceptIncomingDraft();
  }, [
    acceptIncomingDraft,
    continuation,
    continuationOpen,
    workspace,
    foreground,
  ]);
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
  const decide = async (operation: Exclude<WorkspaceOperation, 'continue'>) => {
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
  const finishContinuation = async (attempt: WorkspaceContinuationAttempt) => {
    const receipt = continuationReceipt.current;
    if (!receipt) return;
    await workspaceContinuationStore.clear(
      userId,
      attempt.workspaceId,
      attempt.idempotencyKey,
    );
    if (!alive.current) return;
    continuationAttempt.current = null;
    continuationReceipt.current = null;
    setContinuationUnknown(false);
    setContinuationAccessIssue(false);
    setReviewed('');
    if (receipt.kind === 'accepted') {
      setContinuation('');
      setContinuationBase(null);
      setContinuationOpen(false);
      setContinuationConflictRevision(null);
      if (foregroundRef.current) accept(receipt.workspace);
    } else {
      setContinuation(attempt.text);
      setContinuationBase({
        id: attempt.workspaceId,
        revision: attempt.revision,
        currentRound: attempt.currentRound,
      });
      setContinuationOpen(true);
      setContinuationConflictRevision(receipt.revision);
      setDecisionError(
        `本次修改未执行。${receipt.message} 修改要求已保留。${
          receipt.revision === null
            ? '请检查来源或准备新任务。'
            : '请刷新并核对当前成果后再提交。'
        }`,
      );
    }
  };
  const continueWorkspace = async (recover = false) => {
    if (
      !alive.current ||
      !foregroundRef.current ||
      pending.current ||
      continuationStorage !== 'ready'
    )
      return;
    const shown = current.current;
    if (
      !recover &&
      (!shown ||
        !shown.allowedActions.includes('continue') ||
        continuationUnknown ||
        !continuation.trim() ||
        (continuationBase && !sameWorkspaceContext(continuationBase, shown)) ||
        continuationConflictRevision === shown.revision)
    )
      return;
    if (recover && (!continuationUnknown || !continuationAttempt.current))
      return;
    const attempt: WorkspaceContinuationAttempt = recover
      ? continuationAttempt.current!
      : {
          workspaceId: initial.id,
          revision: shown!.revision,
          currentRound: shown!.currentRound,
          text: continuation.trim(),
          idempotencyKey: createIdempotencyKey(),
        };
    pending.current = true;
    sequence.current += 1;
    setBusy(true);
    setDecisionError('');
    try {
      if (!recover) {
        try {
          await workspaceContinuationStore.save(userId, attempt);
        } catch (issue) {
          if (alive.current) {
            setContinuationStorage('failed');
            setContinuationStorageError(
              issue instanceof Error
                ? issue.message
                : '无法保存修改提交记录，尚未发送请求。',
            );
          }
          return;
        }
        if (!alive.current) return;
        continuationAttempt.current = attempt;
        setContinuationUnknown(true);
      }
      // Saving may finish after leaving the foreground. Keep the request for
      // explicit recovery; do not start execution from a background callback.
      if (!foregroundRef.current) return;
      if (!continuationReceipt.current) {
        const updated = recover
          ? await agentWorkspaceApi.recoverContinuation(token, attempt)
          : await agentWorkspaceApi.decide(
              token,
              shown!,
              'continue',
              attempt.text,
              attempt.idempotencyKey,
            );
        if (!alive.current) return;
        continuationReceipt.current = { kind: 'accepted', workspace: updated };
      }
      await finishContinuation(attempt);
    } catch (issue) {
      if (!alive.current) return;
      if (
        !continuationReceipt.current &&
        issue instanceof MiaoxunApiError &&
        issue.status === 409 &&
        definiteContinuationRejections.has(issue.code || '') &&
        !issue.isNetworkError &&
        !issue.isTimeout
      ) {
        // The server checks the exact stored key before these validations;
        // these codes therefore prove the pending request was not accepted.
        continuationReceipt.current = {
          kind: 'rejected',
          message: issue.message,
          revision:
            issue.code === 'WORKSPACE_REVISION_CONFLICT'
              ? attempt.revision
              : null,
        };
        try {
          await finishContinuation(attempt);
        } catch (storageIssue) {
          if (alive.current)
            setDecisionError(
              storageIssue instanceof Error
                ? storageIssue.message
                : '无法清理已确认的修改记录，请重试核对。',
            );
        }
      } else {
        if (issue instanceof MiaoxunApiError && issue.status === 403)
          setContinuationAccessIssue(true);
        setDecisionError(
          continuationReceipt.current
            ? `${
                issue instanceof Error ? issue.message : '无法清理修改记录。'
              } 请重试核对，清理完成前不会开始新的修改。`
            : `${
                issue instanceof Error ? `${issue.message} ` : ''
              }修改请求的结果尚未确认。请先核对本次提交，不要重复开始修改。`,
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
        title={
          initial.executionMode === 'direct'
            ? textFor(language, 'Agent 任务', 'Agent task')
            : textFor(language, '协作工作空间', 'Agent workspace')
        }
        onBack={onClose}
      />
      <ScrollView
        automaticallyAdjustKeyboardInsets
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
        {continuationStorage === 'loading' ? (
          <WorkspaceState
            palette={colors}
            busy
            title={textFor(
              language,
              '正在读取修改提交记录…',
              'Loading pending revision…',
            )}
          />
        ) : null}
        {continuationStorageError ? (
          <WorkspacePanel palette={colors}>
            <WorkspaceState
              palette={colors}
              tone="error"
              title={continuationStorageError}
            />
            <WorkspaceButton
              testID="workspace-continue-storage-retry"
              palette={colors}
              label={textFor(
                language,
                '重试读取修改记录',
                'Retry revision recovery',
              )}
              disabled={
                busy || !foreground || continuationStorage === 'loading'
              }
              onPress={() => setContinuationRestoreVersion(value => value + 1)}
            />
          </WorkspacePanel>
        ) : null}
        {initialContinuationDraft &&
        consumedDraft.current !== initialContinuationDraft.draftId ? (
          <WorkspacePanel palette={colors}>
            <Text
              style={[workspaceTokens.typography.title, { color: colors.text }]}
            >
              {textFor(
                language,
                '从管家带来的修改草稿',
                'Revision draft from Butler',
              )}
            </Text>
            <Text selectable style={{ color: colors.text }}>
              {initialContinuationDraft.text}
            </Text>
            <Text style={{ color: colors.secondaryText }}>
              {textFor(
                language,
                continuationUnknown
                  ? '请先核对原修改提交。新草稿已保留，不会覆盖原请求。'
                  : '新草稿已保留，不会覆盖本页已有编辑。',
                continuationUnknown
                  ? 'Check the original submission first. This new draft will not replace it.'
                  : 'The new draft is retained without replacing edits on this page.',
              )}
            </Text>
            {continuationOpen && !continuationUnknown ? (
              <WorkspaceButton
                testID="workspace-continue-load-incoming"
                palette={colors}
                variant="secondary"
                label={textFor(
                  language,
                  '用管家草稿替换本页编辑',
                  'Replace these edits with the Butler draft',
                )}
                disabled={
                  busy ||
                  !foreground ||
                  !workspace ||
                  continuationStorage !== 'ready'
                }
                onPress={acceptIncomingDraft}
              />
            ) : null}
          </WorkspacePanel>
        ) : null}
        {continuationUnknown && continuationAttempt.current ? (
          <WorkspacePanel palette={colors}>
            <Text
              accessibilityLiveRegion="polite"
              style={[workspaceTokens.typography.title, { color: colors.text }]}
            >
              {textFor(
                language,
                '修改请求结果待确认',
                'Revision outcome is unconfirmed',
              )}
            </Text>
            <Text
              style={[
                workspaceTokens.typography.body,
                { color: colors.secondaryText },
              ]}
            >
              {textFor(
                language,
                '请先核对本次提交。核对会使用原请求，已接收的修改不会再次执行。',
                'Check this submission before editing again. The original request is reused; an accepted revision will not run twice.',
              )}
            </Text>
            <Text
              style={[workspaceTokens.typography.body, { color: colors.text }]}
            >
              {continuationAttempt.current.text}
            </Text>
            {continuationAccessIssue ? (
              <>
                <Text
                  style={[
                    workspaceTokens.typography.body,
                    { color: colors.secondaryText },
                  ]}
                >
                  {textFor(
                    language,
                    '请检查当前账号及 Agent 授权，再核对原提交。修改记录会保留，核对继续使用原请求。',
                    'Check your account and agent access before checking the original submission. Its request remains saved.',
                  )}
                </Text>
                <WorkspaceButton
                  testID="workspace-continue-manage-access"
                  palette={colors}
                  variant="secondary"
                  label={textFor(
                    language,
                    '前往我的 Agent',
                    'Manage my agents',
                  )}
                  disabled={busy || !foreground}
                  onPress={onManageAgents}
                />
              </>
            ) : null}
            <WorkspaceButton
              testID="workspace-continue-recover"
              palette={colors}
              label={textFor(
                language,
                '核对提交结果',
                'Check submission result',
              )}
              disabled={busy || !foreground || continuationStorage !== 'ready'}
              busy={busy}
              onPress={() => continueWorkspace(true)}
            />
          </WorkspacePanel>
        ) : null}
        {workspace ? (
          <>
            <WorkspacePanel palette={colors}>
              <Text
                style={[
                  workspaceTokens.typography.caption,
                  { color: colors.secondaryText },
                ]}
              >
                {textFor(
                  language,
                  `第 ${workspace.currentRound} 轮`,
                  `Round ${workspace.currentRound}`,
                )}
              </Text>
              <Text
                style={[
                  workspaceTokens.typography.heading,
                  { color: colors.text },
                ]}
              >
                {workspace.goal}
              </Text>
              {workspace.currentRound > 1 ? (
                <Text
                  testID="workspace-current-instruction"
                  style={[
                    workspaceTokens.typography.body,
                    { color: colors.text },
                  ]}
                >
                  {workspace.rounds[workspace.currentRound - 1].instruction}
                </Text>
              ) : null}
              <ContextReference
                references={workspace.contextRefs}
                palette={colors}
                language={language}
              />
              {workspace.origin ? (
                <View style={s.origin}>
                  <Text style={{ color: colors.secondaryText }}>
                    {textFor(
                      language,
                      '来自专业 Agent 会话：',
                      'From Agent conversation: ',
                    )}
                    {agents.find(
                      agent => agent.key === workspace.origin?.agentId,
                    )?.name || workspace.origin.agentId}
                  </Text>
                  {onOpenSource ? (
                    <WorkspaceButton
                      testID="workspace-open-source"
                      palette={colors}
                      variant="secondary"
                      label={textFor(
                        language,
                        '返回原会话',
                        'Open original conversation',
                      )}
                      disabled={busy || !foreground}
                      onPress={() => onOpenSource(workspace)}
                    />
                  ) : null}
                  {workspace.origin.capability === 'media.select' &&
                  !workspace.allowedActions.includes('continue') ? (
                    <Text style={{ color: colors.secondaryText }}>
                      {textFor(
                        language,
                        '继续修改选材尚未接入，可返回原会话提出新的选材需求。',
                        'Revising a media selection is not supported yet; request a new selection in the original conversation.',
                      )}
                    </Text>
                  ) : null}
                </View>
              ) : null}
              <Text
                accessibilityLiveRegion="polite"
                style={[
                  workspaceTokens.typography.title,
                  { color: workspace.error ? colors.rose : colors.text },
                ]}
              >
                {workspace.inputRequest?.kind === 'agent_access'
                  ? textFor(language, '需要处理授权', 'Agent access required')
                  : workspaceStatusLabel(
                      workspace.status,
                      language,
                      workspace.executionMode,
                    )}
              </Text>
              {workspace.readAccess ? (
                <WorkspaceState
                  palette={colors}
                  tone="error"
                  title={textFor(
                    language,
                    '文件内容不可用',
                    'File content unavailable',
                  )}
                />
              ) : null}
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
              {textFor(
                language,
                workspace.executionMode === 'direct' ? '任务进展' : '协作进展',
                'Activity',
              )}
            </Text>
            {workspace.steps
              .filter(
                step =>
                  step.round === workspace.currentRound &&
                  step.capability !== 'workspace.coordinate',
              )
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
                      {workspaceStatusLabel(
                        step.status,
                        language,
                        workspace.executionMode,
                      )}
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
                    !workspaceArtifactsMatch(step.result, workspace.result))
                    ? resultView(step.result, step.id)
                    : null}
                </WorkspacePanel>
              ))}
            {workspace.result ? (
              <WorkspacePanel palette={colors}>
                {resultView(workspace.result, 'final')}
              </WorkspacePanel>
            ) : null}
            {!workspace.readAccess &&
            continuationStorage === 'ready' &&
            !continuationUnknown &&
            (workspace.allowedActions.includes('continue') ||
              continuationBase) ? (
              <WorkspacePanel palette={colors}>
                {continuationOpen ? (
                  <>
                    <Text
                      style={[
                        workspaceTokens.typography.title,
                        { color: colors.text },
                      ]}
                    >
                      {textFor(
                        language,
                        '继续修改当前成果',
                        'Revise the current result',
                      )}
                    </Text>
                    <Text
                      style={[
                        workspaceTokens.typography.caption,
                        { color: colors.secondaryText },
                      ]}
                    >
                      {textFor(
                        language,
                        `修改基准为第 ${
                          continuationBase?.currentRound ||
                          workspace.currentRound
                        } 轮；当前任务为第 ${
                          workspace.currentRound
                        } 轮。历史成果会保留。`,
                        `Revision base: round ${
                          continuationBase?.currentRound ||
                          workspace.currentRound
                        }; current task: round ${
                          workspace.currentRound
                        }. Previous results are retained.`,
                      )}
                    </Text>
                    {continuationBase &&
                    !sameWorkspaceContext(continuationBase, workspace) ? (
                      <>
                        <WorkspaceState
                          palette={colors}
                          tone="error"
                          title={textFor(
                            language,
                            '任务版本已变化，带来的修改原文已保留。请查看当前成果，再明确确认以当前版本修改；现在不会执行。',
                            'The task version changed. Your revision text is retained. Review the current result, then explicitly use its current version. Nothing has run.',
                          )}
                        />
                        <WorkspaceButton
                          testID="workspace-continue-accept-current"
                          palette={colors}
                          variant="secondary"
                          label={textFor(
                            language,
                            '已核对，使用当前成果修改',
                            'Reviewed; revise the current result',
                          )}
                          disabled={
                            busy ||
                            !foreground ||
                            !workspace.allowedActions.includes('continue')
                          }
                          onPress={() => {
                            const latest = current.current;
                            if (
                              !latest ||
                              pending.current ||
                              !foregroundRef.current ||
                              continuationUnknown ||
                              continuationStorage !== 'ready' ||
                              !latest.allowedActions.includes('continue')
                            )
                              return;
                            setContinuationBase(
                              workspaceContextSelector(latest),
                            );
                            setContinuationConflictRevision(null);
                          }}
                        />
                      </>
                    ) : null}
                    {!workspace.allowedActions.includes('continue') ? (
                      <WorkspaceState
                        palette={colors}
                        title={textFor(
                          language,
                          '当前任务状态暂不允许继续修改，原文已保留。请先查看任务进展。',
                          'The task cannot be revised in its current state. Your text is retained. Check its progress first.',
                        )}
                      />
                    ) : null}
                    <TextInput
                      testID="workspace-continue-input"
                      accessibilityLabel={textFor(
                        language,
                        '修改要求',
                        'Revision instructions',
                      )}
                      value={continuation}
                      onChangeText={value => {
                        if (pending.current || continuationUnknown) return;
                        setContinuation(value);
                      }}
                      multiline
                      maxLength={2000}
                      editable={!busy && foreground}
                      style={[
                        s.input,
                        { color: colors.text, borderColor: colors.border },
                      ]}
                    />
                    <WorkspaceButton
                      testID="workspace-continue-submit"
                      palette={colors}
                      label={textFor(
                        language,
                        '提交修改并继续',
                        'Submit revision',
                      )}
                      disabled={
                        !continuation.trim() ||
                        !workspace.allowedActions.includes('continue') ||
                        Boolean(
                          continuationBase &&
                            !sameWorkspaceContext(continuationBase, workspace),
                        ) ||
                        busy ||
                        !foreground ||
                        continuationConflictRevision === workspace.revision
                      }
                      busy={busy}
                      onPress={() => continueWorkspace()}
                    />
                  </>
                ) : (
                  <WorkspaceButton
                    testID="workspace-continue"
                    palette={colors}
                    variant="secondary"
                    label={textFor(language, '继续修改', 'Continue editing')}
                    disabled={busy || !foreground}
                    onPress={() => {
                      setDecisionError('');
                      setContinuationOpen(true);
                    }}
                  />
                )}
              </WorkspacePanel>
            ) : null}
            {workspace.rounds.length > 1 ? (
              <>
                <Text
                  accessibilityRole="header"
                  style={[
                    workspaceTokens.typography.title,
                    { color: colors.text },
                  ]}
                >
                  {textFor(language, '历史轮次', 'Previous rounds')}
                </Text>
                {workspace.rounds
                  .slice(0, -1)
                  .reverse()
                  .map(round => (
                    <WorkspacePanel key={round.number} palette={colors}>
                      <Text
                        style={[
                          workspaceTokens.typography.title,
                          { color: colors.text },
                        ]}
                      >
                        {textFor(
                          language,
                          `第 ${round.number} 轮`,
                          `Round ${round.number}`,
                        )}
                        {' · '}
                        {round.status === 'awaiting_confirmation'
                          ? textFor(language, '未保存方案', 'Unsaved proposal')
                          : workspaceStatusLabel(
                              round.status,
                              language,
                              workspace.executionMode,
                            )}
                      </Text>
                      <Text
                        style={[
                          workspaceTokens.typography.body,
                          { color: colors.text },
                        ]}
                      >
                        {round.instruction}
                      </Text>
                      {round.summary ? (
                        <Text
                          style={[
                            workspaceTokens.typography.body,
                            { color: colors.secondaryText },
                          ]}
                        >
                          {round.summary}
                        </Text>
                      ) : null}
                      {round.result ? (
                        <WorkspaceButton
                          testID={`workspace-history-round-${round.number}`}
                          palette={colors}
                          variant="secondary"
                          label={
                            historyRound === round.number
                              ? textFor(
                                  language,
                                  '收起本轮成果',
                                  'Hide this result',
                                )
                              : textFor(
                                  language,
                                  '查看本轮成果',
                                  'View this result',
                                )
                          }
                          disabled={busy || !foreground}
                          onPress={() =>
                            setHistoryRound(
                              historyRound === round.number
                                ? null
                                : round.number,
                            )
                          }
                        />
                      ) : null}
                      {historyRound === round.number ? (
                        <>
                          <View style={s.participants}>
                            {[
                              ...new Set(
                                workspace.steps
                                  .filter(step => step.round === round.number)
                                  .map(step => step.agentId),
                              ),
                            ].map(agentId => (
                              <MiaoTaskAgent
                                key={agentId}
                                agentId={agentId}
                                agent={agents.find(
                                  agent => agent.key === agentId,
                                )}
                                palette={colors}
                                language={language}
                              />
                            ))}
                          </View>
                          {round.result
                            ? resultView(round.result, `round-${round.number}`)
                            : null}
                        </>
                      ) : null}
                    </WorkspacePanel>
                  ))}
              </>
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
                label={textFor(
                  language,
                  workspace.executionMode === 'direct'
                    ? '取消任务'
                    : '取消协作',
                  'Cancel task',
                )}
                disabled={busy || !foreground}
                busy={busy}
                onPress={() => decide('cancel')}
              />
            ) : null}
            {workspace.executionMode === 'direct' &&
            workspace.origin &&
            ['succeeded', 'failed', 'interrupted', 'cancelled'].includes(
              workspace.status,
            ) &&
            !workspace.allowedActions.includes('continue') ? (
              <WorkspacePanel palette={colors}>
                <WorkspaceButton
                  testID="workspace-new-task"
                  palette={colors}
                  variant="secondary"
                  label={textFor(
                    language,
                    '以此目标准备新任务',
                    'Prepare a new task with this goal',
                  )}
                  disabled={
                    busy ||
                    !foreground ||
                    continuationStorage !== 'ready' ||
                    continuationUnknown
                  }
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
                    '回到原专业 Agent 会话编辑草稿，保留目标、历轮修改要求和引用；确认发送后才会处理。',
                    'Edit a draft in the original Agent conversation, retaining the goal, revision instructions and references. It is processed only after you send it.',
                  )}
                </Text>
              </WorkspacePanel>
            ) : null}
            <WorkspaceButton
              palette={colors}
              variant="ghost"
              label={textFor(
                language,
                workspace.executionMode === 'direct'
                  ? '刷新任务进展'
                  : '刷新协作进展',
                'Refresh task',
              )}
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
          onReviewed={() => {
            const latest = current.current;
            if (
              foregroundRef.current &&
              latest?.approval?.draftId === preview &&
              workspaceReviewKey(latest) === reviewKey
            )
              setReviewed(reviewKey);
          }}
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
  origin: { gap: 8 },
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
  participants: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  input: {
    borderWidth: 1,
    borderRadius: workspaceTokens.radius.control,
    padding: 12,
    minHeight: 90,
    textAlignVertical: 'top',
    ...workspaceTokens.typography.body,
  },
});
