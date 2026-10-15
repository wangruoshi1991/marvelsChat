import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  AgentReadinessDTO,
  ProfileDTO,
  StationSiteDraftDTO,
} from '../../models/api';
import { AITaskDTO } from '../../models/aiTask';
import { supportsSiteDocuments } from '../../services/aiContract';
import { WorkspaceButton } from '../../shared/workspaceUi';
import { SiteDocumentPreview } from '../site-document/SiteDocumentPreview';
import { createIdempotencyKey } from '../../shared/createIdempotencyKey';
import { textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import {
  siteTaskAttemptStore,
  SiteTaskAttempt,
} from '../../services/siteTaskAttemptStore';
import { AITaskCard, Artifact } from '../ai/AIInteraction';
import { useAITasks } from '../ai/useAITasks';
import { Language } from '../session/sessionTypes';
import { StationModule } from './StationHomeModules';

export function StationSiteBuilderPanel({
  token,
  active,
  palette,
  language,
  profile,
  readiness,
  siteDrafts,
  onCreateDraft,
  onRefreshTaskArtifacts,
  onActionMessage,
}: {
  token: string;
  active: boolean;
  palette: Palette;
  language: Language;
  profile: ProfileDTO;
  readiness?: AgentReadinessDTO;
  siteDrafts: StationSiteDraftDTO[];
  onCreateDraft: (payload: {
    prompt: string;
    idempotencyKey: string;
  }) => Promise<{ task: AITaskDTO }>;
  onRefreshTaskArtifacts: () => Promise<unknown>;
  onActionMessage: (message: string) => void;
  onActionError: (error: unknown) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [restoring, setRestoring] = useState(true);
  const [recoveryNotice, setRecoveryNotice] = useState(false);
  const editRevision = useRef(0);
  const [reviewed, setReviewed] = useState<Record<string, string>>({});
  const [historyPreview, setHistoryPreview] = useState<string | null>(null);
  const [taskPreview, setTaskPreview] = useState<string | null>(null);
  const [currentPreview, setCurrentPreview] = useState(false);
  const pending = useRef(false);
  const attempt = useRef<SiteTaskAttempt | null>(null);
  const scope = `${token}:${profile.userId}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    setPrompt('');
    setError('');
    setSubmitting(false);
    setReviewed({});
    setHistoryPreview(null);
    setTaskPreview(null);
    setCurrentPreview(false);
    attempt.current = null;
    pending.current = false;
    setRecoveryNotice(false);
    setRestoring(true);
    const revision = ++editRevision.current;
    if (!profile.userId || !token) {
      setRestoring(false);
      return;
    }
    siteTaskAttemptStore
      .read(profile.userId)
      .then(saved => {
        if (!alive.current || scopeRef.current !== scope) return;
        attempt.current = saved;
        if (saved) {
          if (editRevision.current === revision) setPrompt(saved.prompt);
          setRecoveryNotice(true);
        }
      })
      .catch(issue => {
        if (alive.current && scopeRef.current === scope)
          setError(issue instanceof Error ? issue.message : '无法恢复提交记录');
      })
      .finally(() => {
        if (alive.current && scopeRef.current === scope) setRestoring(false);
      });
  }, [scope, profile.userId, token]);
  const tasks = useAITasks({
    token,
    active,
    kind: 'site_draft',
    onTaskReady: onRefreshTaskArtifacts,
  });
  const canCreate = Boolean(
    active &&
      token &&
      profile.userId &&
      supportsSiteDocuments(token) &&
      readiness?.configured &&
      prompt.trim() &&
      !submitting &&
      !restoring,
  );
  const createDraft = async () => {
    if (!canCreate || pending.current) return;
    const submittedPrompt = prompt.trim();
    const owner = profile.userId;
    const stillCurrent = () => alive.current && scopeRef.current === scope;
    pending.current = true;
    setSubmitting(true);
    setError('');
    setRecoveryNotice(false);
    try {
      const saved = attempt.current || (await siteTaskAttemptStore.read(owner));
      if (!stillCurrent()) return;
      const submission =
        saved?.prompt === submittedPrompt
          ? saved
          : { prompt: submittedPrompt, idempotencyKey: createIdempotencyKey() };
      attempt.current = submission;
      await siteTaskAttemptStore.save(owner, submission);
      if (!stillCurrent()) return;
      const result = await onCreateDraft(submission);
      if (stillCurrent()) {
        tasks.track(result.task);
        setPrompt('');
        attempt.current = null;
        onActionMessage(
          textFor(language, '建站任务已接收', 'Site task accepted'),
        );
      }
      await siteTaskAttemptStore.clear(owner, submission.idempotencyKey);
    } catch (issue) {
      if (stillCurrent())
        setError(
          issue instanceof Error
            ? issue.message
            : textFor(
                language,
                '无法提交建站任务',
                'Unable to submit the site task',
              ),
        );
    } finally {
      if (stillCurrent()) {
        pending.current = false;
        setSubmitting(false);
      }
    }
  };
  return (
    <StationModule
      palette={palette}
      title={textFor(language, '建站 Agent', 'Station Builder')}
      action={textFor(
        language,
        submitting ? '提交中' : '生成',
        submitting ? 'Submitting' : 'Create',
      )}
      actionDisabled={!canCreate}
      onAction={createDraft}
    >
      <View style={s.stack}>
        <Text style={[s.body, { color: palette.secondaryText }]}>
          {textFor(
            language,
            !supportsSiteDocuments(token)
              ? '结构化页面服务尚未就绪，暂时无法生成或预览。'
              : readiness?.configured
              ? '描述你想要的页面。查看完整草稿并确认后保存，仅自己可见。'
              : '生成服务尚未就绪。已有草稿仍可查看。',
            !supportsSiteDocuments(token)
              ? 'Structured pages are not ready on this server. Generation and preview are unavailable.'
              : readiness?.configured
              ? 'Describe your page. Review the full draft and confirm to save it privately.'
              : 'Generation is not ready. Existing drafts remain available to view.',
          )}
        </Text>
        {profile.stationConfig.siteDraftId ? (
          <View style={s.stack}>
            <WorkspaceButton
              palette={palette}
              variant="secondary"
              label={textFor(language, '查看当前页面', 'View current page')}
              onPress={() => setCurrentPreview(value => !value)}
            />
            <Text style={[s.body, { color: palette.secondaryText }]}>
              {textFor(
                language,
                '当前保存的生成页面，仅自己可见。',
                'Your saved generated page is private.',
              )}
            </Text>
            {currentPreview ? (
              <SiteDocumentPreview
                key={`${scope}:current:${profile.stationConfig.siteDraftId}`}
                draftId={profile.stationConfig.siteDraftId}
                token={token}
                active={active}
                palette={palette}
                language={language}
                onClose={() => setCurrentPreview(false)}
              />
            ) : null}
          </View>
        ) : null}
        <TextInput
          accessibilityLabel={textFor(
            language,
            '小站主页需求',
            'Station page request',
          )}
          value={prompt}
          onChangeText={value => {
            editRevision.current += 1;
            setPrompt(value);
          }}
          editable={!submitting}
          multiline
          maxLength={600}
          placeholder={textFor(
            language,
            '描述你想要的小站主页',
            'Describe the station page you want',
          )}
          placeholderTextColor={palette.secondaryText}
          style={[
            s.input,
            {
              backgroundColor: palette.input,
              borderColor: palette.border,
              color: palette.text,
            },
          ]}
        />
        {recoveryNotice ? (
          <Text style={[s.body, { color: palette.secondaryText }]}>
            {textFor(
              language,
              '上次提交尚未确认。可先查看任务列表，或继续提交原请求以确认是否已接收。',
              'The last submission is unconfirmed. Check the task list, or resubmit the same request to recover its result.',
            )}
          </Text>
        ) : null}
        {error || tasks.error || tasks.decisionError ? (
          <View style={s.stack}>
            <Text
              accessibilityRole="alert"
              style={[s.body, { color: palette.rose }]}
            >
              {error || tasks.decisionError || tasks.error}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                tasks.refresh();
              }}
              style={[s.button, { backgroundColor: palette.soft }]}
            >
              <Text style={{ color: palette.text }}>
                {textFor(language, '刷新任务', 'Refresh tasks')}
              </Text>
            </Pressable>
          </View>
        ) : null}
        {tasks.tasks.map(task => {
          const reviewKey = `${task.revision}:${
            task.approval?.draftHash || ''
          }:${task.approval?.resourcesHash || ''}`;
          const previewKey = `${task.id}:${reviewKey}`;
          return (
            <AITaskCard
              key={task.id}
              task={task}
              palette={palette}
              language={language}
              busy={tasks.pendingTaskId !== null}
              canConfirm={
                active &&
                supportsSiteDocuments(token) &&
                reviewed[task.id] === reviewKey
              }
              onDecision={operation => {
                tasks.decide(task, operation);
              }}
              renderArtifact={artifact => {
                return (
                  <Artifact
                    artifact={artifact}
                    palette={palette}
                    language={language}
                    onPreview={() => {
                      setReviewed(current => ({ ...current, [task.id]: '' }));
                      setTaskPreview(current =>
                        current === previewKey ? null : previewKey,
                      );
                    }}
                  >
                    {taskPreview === previewKey ? (
                      <SiteDocumentPreview
                        key={`${scope}:${previewKey}:${artifact.id}`}
                        draftId={artifact.id}
                        token={token}
                        active={active}
                        palette={palette}
                        language={language}
                        expected={
                          task.approval
                            ? {
                                documentHash: task.approval.draftHash,
                                resourcesHash:
                                  task.approval.resourcesHash || '',
                              }
                            : undefined
                        }
                        onClose={() => setTaskPreview(null)}
                        onInvalidated={() => {
                          if (alive.current && scopeRef.current === scope)
                            setReviewed(current => ({
                              ...current,
                              [task.id]: '',
                            }));
                        }}
                        onReviewed={() => {
                          if (
                            alive.current &&
                            scopeRef.current === scope &&
                            task.approval?.draftId === artifact.id
                          )
                            setReviewed(current => ({
                              ...current,
                              [task.id]: reviewKey,
                            }));
                        }}
                      />
                    ) : null}
                  </Artifact>
                );
              }}
            />
          );
        })}
        <Text
          accessibilityRole="header"
          style={[s.title, { color: palette.text }]}
        >
          {textFor(language, '已保存的草稿', 'Saved drafts')}
        </Text>
        {!siteDrafts.length ? (
          <Text style={[s.body, { color: palette.secondaryText }]}>
            {textFor(language, '暂无草稿', 'No drafts yet')}
          </Text>
        ) : null}
        {[...siteDrafts]
          .sort((a, b) =>
            String(b.createdAt).localeCompare(String(a.createdAt)),
          )
          .map(draft => (
            <Artifact
              key={draft.id}
              artifact={{
                kind: 'site_draft',
                id: draft.id,
                title: draft.title,
              }}
              palette={palette}
              language={language}
              onPreview={() =>
                setHistoryPreview(current =>
                  current === draft.id ? null : draft.id,
                )
              }
            >
              <Text style={[s.body, { color: palette.secondaryText }]}>
                {draft.id === profile.stationConfig.siteDraftId
                  ? textFor(
                      language,
                      '当前保存的页面 · 仅自己可见',
                      'Current saved page · Private',
                    )
                  : textFor(
                      language,
                      '只供查看；保存为当前页面需要任务的有效确认。',
                      'View only. Saving as the current page requires a valid task confirmation.',
                    )}
              </Text>
              {historyPreview === draft.id ? (
                <SiteDocumentPreview
                  key={`${scope}:history:${draft.id}`}
                  draftId={draft.id}
                  token={token}
                  active={active}
                  onClose={() => setHistoryPreview(null)}
                  palette={palette}
                  language={language}
                />
              ) : null}
            </Artifact>
          ))}
      </View>
    </StationModule>
  );
}

const s = StyleSheet.create({
  stack: { gap: 12 },
  body: { fontSize: 14, lineHeight: 22 },
  title: { fontSize: 16, fontWeight: '600' },
  input: {
    minHeight: 100,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    textAlignVertical: 'top',
  },
  button: { minHeight: 44, padding: 12, borderRadius: 10 },
});
