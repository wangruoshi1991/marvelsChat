import { AgentWorkspace } from '../../models/agentWorkspace';
import { AvatarConfigDTO, StationContentDTO } from '../../models/api';
import { textFor } from '../../shared/i18n';
import { Language } from '../session/sessionTypes';

type OutcomeTarget =
  | { kind: 'workspace'; workspace: AgentWorkspace }
  | { kind: 'site'; id: string }
  | {
      kind: 'outfit';
      avatarConfig: AvatarConfigDTO;
      mediaAssetId: string | null;
    }
  | { kind: 'text'; sections: { title: string; body: string[] }[] };
export type StationOutcome = {
  key: string;
  title: string;
  label: string;
  summary: string;
  updatedAt: string | null;
  target: OutcomeTarget;
  sourceWorkspace?: AgentWorkspace;
};
const textParts = (...values: unknown[]) =>
  values.filter(
    (value): value is string => typeof value === 'string' && !!value.trim(),
  );

export function stationOutcomes(
  content: StationContentDTO,
  workspaces: AgentWorkspace[],
  language: Language,
): StationOutcome[] {
  const t = (zh: string, en: string) => textFor(language, zh, en);
  const results = new Map<string, StationOutcome>();
  for (const item of content.siteDrafts) {
    results.set(`site:${item.id}`, {
      key: `site:${item.id}`,
      title: item.title,
      summary: '',
      label:
        item.status === 'applied'
          ? t('已保存页面', 'Saved page')
          : item.status === 'archived'
          ? t('已归档页面', 'Archived page')
          : t('页面草稿', 'Page draft'),
      updatedAt: item.updatedAt || item.createdAt,
      target: { kind: 'site', id: item.id },
    });
  }
  for (const workspace of workspaces) {
    for (const step of workspace.steps) {
      const result = step.result;
      if (step.status !== 'succeeded' || !result) continue;
      const key =
        result.kind === 'site_draft'
          ? `site:${result.id}`
          : result.kind === 'media_selection'
          ? `media:${workspace.id}:${step.id}`
          : `text:${result.id}`;
      const pendingReview =
        result.kind === 'site_draft' &&
        workspace.status === 'awaiting_confirmation' &&
        workspace.approval?.draftId === result.id;
      // The document entry and its task are different destinations: opening a
      // saved page must not lose the real task's history and revision controls.
      const existingPage = results.get(key);
      if (result.kind === 'site_draft' && existingPage && !pendingReview) {
        results.set(key, { ...existingPage, sourceWorkspace: workspace });
        continue;
      }
      results.set(key, {
        key,
        title: result.title,
        summary: step.summary,
        label:
          result.kind === 'site_draft'
            ? pendingReview
              ? t('待确认页面', 'Page to review')
              : t('页面成果', 'Page result')
            : result.kind === 'media_selection'
            ? t('选材结果', 'Selected media')
            : t('文字成果', 'Text result'),
        updatedAt: step.updatedAt,
        target:
          result.kind === 'site_draft' && !pendingReview
            ? { kind: 'site', id: result.id }
            : { kind: 'workspace', workspace },
        ...(result.kind === 'site_draft' && !pendingReview
          ? { sourceWorkspace: workspace }
          : {}),
      });
    }
  }
  for (const item of content.comicDiaries) {
    results.set(`comic:${item.id}`, {
      key: `comic:${item.id}`,
      title: item.title,
      label: t('漫画分镜', 'Storyboard'),
      summary: item.summary,
      updatedAt: item.updatedAt || item.createdAt || null,
      target: {
        kind: 'text',
        sections: item.frames.map(frame => ({
          title: typeof frame.title === 'string' ? frame.title : '',
          body: textParts(frame.scene, frame.caption, frame.dialogue),
        })),
      },
    });
  }
  for (const item of content.videoDrafts) {
    results.set(`video:${item.id}`, {
      key: `video:${item.id}`,
      title: item.title,
      label: t('视频草稿', 'Video draft'),
      summary: item.summary,
      updatedAt: item.updatedAt || item.createdAt || null,
      target: {
        kind: 'text',
        sections: item.shots.map(shot => ({
          title: typeof shot.title === 'string' ? shot.title : '',
          body: textParts(shot.scene, shot.narration, shot.caption),
        })),
      },
    });
  }
  for (const item of content.outfits) {
    results.set(`outfit:${item.id}`, {
      key: `outfit:${item.id}`,
      title: item.title,
      label: t('穿搭记录', 'Outfit'),
      summary: item.note,
      updatedAt: item.updatedAt || item.createdAt || null,
      target: {
        kind: 'outfit',
        avatarConfig: item.avatarConfig,
        mediaAssetId: item.mediaAssetId || null,
      },
    });
  }
  return [...results.values()].sort((a, b) =>
    (b.updatedAt || '').localeCompare(a.updatedAt || ''),
  );
}
