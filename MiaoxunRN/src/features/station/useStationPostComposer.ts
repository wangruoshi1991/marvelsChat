import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ImageSourcePropType } from 'react-native';
import { StationVisibility } from '../../models/api';
import {
  PickedStationMedia,
  pickStationImagesFromLibrary,
  pickStationVideoFromLibrary,
} from '../../services/stationMediaPicker';
import { buildStationMediaFileUrl } from '../../services/stationMediaUrl';
import {
  hashStationPostPayload,
  StationPostAttempt,
  stationPostAttemptStore,
} from '../../services/stationPostAttemptStore';
import { createIdempotencyKey } from '../../shared/createIdempotencyKey';
import { appErrorText, textFor } from '../../shared/i18n';
import { Language, useMiaoxunSession } from '../session/useMiaoxunSession';

export type StationPostInitialDraft = { body: string; mediaAssetIds: string[] };
export type StationPostAttachment =
  | {
      source: 'existingAsset';
      assetId: string;
      kind: 'image';
      uri: string;
      originalFilename?: string;
    }
  | (PickedStationMedia & { source: 'pickedLocalFile'; assetId?: string });
export const maxStationPostImageCount = 9;
const maxImageBytes = 25 * 1024 * 1024;
const maxVideoBytes = 250 * 1024 * 1024;
const borrowed = (assetId: string): StationPostAttachment => ({
  source: 'existingAsset',
  assetId,
  kind: 'image',
  uri: buildStationMediaFileUrl(assetId),
});

export function useStationPostComposer({
  language,
  session,
  initialDraft,
  onClose,
  onPublished,
  onActionError,
}: {
  language: Language;
  session: ReturnType<typeof useMiaoxunSession>;
  initialDraft?: StationPostInitialDraft;
  onClose: () => void;
  onPublished: () => void;
  onActionError: (error: unknown) => void;
}) {
  const userId = session.user?.id || session.profile.userId;
  const [body, updateBody] = useState(initialDraft?.body || '');
  const [attachments, setAttachments] = useState<StationPostAttachment[]>(() =>
    (initialDraft?.mediaAssetIds || []).map(borrowed),
  );
  const [visibility, setVisibility] = useState<StationVisibility>(
    initialDraft ? 'private' : 'public',
  );
  const [locationLabel, setLocationLabel] = useState('');
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const [pendingAttempt, setPendingAttempt] =
    useState<StationPostAttempt | null>(null);
  const [uploadedCount, setUploadedCount] = useState(0);
  const [publishError, setPublishError] = useState('');
  const busy = useRef(false);
  const picking = useRef(false);
  const pending = useRef<StationPostAttempt | null>(null);
  const temporaryIds = useRef(new Set<string>());
  const identity = `${userId}:${session.token}`;
  const context = useRef({ identity, epoch: 0, mounted: true });
  if (context.current.identity !== identity) {
    context.current = {
      identity,
      epoch: context.current.epoch + 1,
      mounted: true,
    };
    pending.current = null;
    temporaryIds.current = new Set();
    busy.current = false;
    picking.current = false;
  }
  const capture = () => ({ ...context.current });
  const current = (scope: ReturnType<typeof capture>) =>
    context.current.mounted &&
    scope.identity === context.current.identity &&
    scope.epoch === context.current.epoch;
  const locked = () => busy.current || !!pending.current || isRestoring;
  const isEditingLocked = isPublishing || isRestoring || !!pendingAttempt;
  const report = (error: unknown) => {
    setPublishError(
      appErrorText(
        language,
        error,
        '操作失败，请重试',
        'Action failed. Try again.',
      ),
    );
    onActionError(error);
  };
  const restore = (attempt: StationPostAttempt) => {
    pending.current = attempt;
    setPendingAttempt(attempt);
    updateBody(attempt.payload.body);
    setLocationLabel(attempt.payload.locationLabel);
    setVisibility(attempt.payload.visibility);
    setSelectedAgentIds(attempt.payload.agentCapabilities);
    temporaryIds.current = new Set(
      attempt.attachments
        .filter(item => item.source === 'pickedLocalFile')
        .map(item => item.assetId),
    );
    setAttachments(
      attempt.attachments.map(item =>
        item.source === 'existingAsset'
          ? borrowed(item.assetId)
          : {
              source: 'pickedLocalFile',
              assetId: item.assetId,
              kind: item.kind,
              uri: buildStationMediaFileUrl(item.assetId),
              originalFilename: '',
              mimeType: '',
              byteSize: null,
              width: null,
              height: null,
            },
      ),
    );
  };
  const verify = async (
    attempt: StationPostAttempt,
    scope: ReturnType<typeof capture>,
  ) => {
    const result = await session.resolveStationPostSubmission(
      attempt.clientRequestId,
    );
    if (!current(scope)) return;
    if (result.status !== 'submitted' && result.status !== 'not_submitted')
      throw new Error('发布回执格式不受支持，请保留原记录并重试核验。');
    await stationPostAttemptStore.clear(userId, attempt.clientRequestId);
    if (!current(scope)) return;
    pending.current = null;
    setPendingAttempt(null);
    if (result.status === 'submitted') {
      temporaryIds.current.clear();
      onPublished();
    } else {
      setPublishError(
        textFor(
          language,
          '已核实原请求未发布，可继续编辑；再次发布需由你点击。',
          'The original request was not submitted. You can edit and explicitly post again.',
        ),
      );
    }
  };
  useEffect(() => {
    const scope = capture();
    context.current.mounted = true;
    setIsRestoring(true);
    setIsPublishing(false);
    setPendingAttempt(null);
    (async () => {
      try {
        const attempt = await stationPostAttemptStore.read(userId);
        if (!current(scope)) return;
        if (attempt) {
          restore(attempt);
          await verify(attempt, scope);
        } else if (scope.epoch > 0) {
          updateBody('');
          setAttachments([]);
          setVisibility('private');
          setLocationLabel('');
          setSelectedAgentIds([]);
        }
        if (current(scope)) setIsRestoring(false);
      } catch (error) {
        if (current(scope)) {
          setIsRestoring(true);
          report(error);
        }
      }
    })();
    return () => {
      context.current.mounted = false;
      context.current.epoch += 1;
    };
    // Session actions are token-scoped; changing their identity must invalidate late work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity]);

  const enabledAgents = useMemo(
    () => session.ownedAgents.filter(agent => agent.enabled).slice(0, 6),
    [session.ownedAgents],
  );
  const canPublish = !!body.trim() || !!attachments.length;
  const hasDraft = canPublish || !!locationLabel || !!selectedAgentIds.length;
  const postKind = attachments[0]?.kind || 'text';
  const deleteTemporary = async (ids: string[], scope = capture()) => {
    const outcomes = await Promise.allSettled(
      ids.map(id => session.deleteStationMediaAsset(id)),
    );
    if (!current(scope)) return false;
    outcomes.forEach((outcome, index) => {
      if (outcome.status === 'fulfilled')
        temporaryIds.current.delete(ids[index]);
    });
    const failure = outcomes.find(
      (outcome): outcome is PromiseRejectedResult =>
        outcome.status === 'rejected',
    );
    if (failure) {
      report(failure.reason);
      return false;
    }
    return true;
  };
  const close = async (scope: ReturnType<typeof capture>) => {
    if (!current(scope) || busy.current) return;
    context.current.epoch += 1;
    if (
      !pending.current &&
      !isRestoring &&
      !(await deleteTemporary([...temporaryIds.current]))
    )
      return;
    onClose();
  };
  const requestClose = () => {
    if (busy.current) return;
    const scope = capture();
    if (pending.current || isRestoring || !hasDraft) {
      close(scope).catch(onActionError);
      return;
    }
    Alert.alert(
      textFor(language, '放弃此次编辑？', 'Discard this draft?'),
      textFor(
        language,
        '已编辑的内容不会保留。',
        'Your changes will not be saved.',
      ),
      [
        {
          text: textFor(language, '继续编辑', 'Keep Editing'),
          style: 'cancel',
        },
        {
          text: textFor(language, '放弃', 'Discard'),
          style: 'destructive',
          onPress: () => {
            close(scope).catch(onActionError);
          },
        },
      ],
    );
  };
  const addImages = async () => {
    if (locked() || picking.current) return;
    const scope = capture();
    const remaining = attachments.some(item => item.kind === 'video')
      ? maxStationPostImageCount
      : maxStationPostImageCount - attachments.length;
    if (remaining <= 0) {
      Alert.alert(textFor(language, '已达到 9 张图片', 'Nine Images Added'));
      return;
    }
    picking.current = true;
    try {
      const picked = await pickStationImagesFromLibrary(remaining);
      if (!current(scope) || locked()) return;
      if (picked.length > remaining)
        throw new Error(
          textFor(
            language,
            '选择的图片超过剩余数量，请重新选择。',
            'Too many images selected. Select within the remaining limit.',
          ),
        );
      const valid = picked.filter(
        item => item.byteSize === null || item.byteSize <= maxImageBytes,
      );
      if (valid.length !== picked.length)
        Alert.alert(
          textFor(
            language,
            '图片过大，单张不能超过 25 MB。',
            'Each image must be 25 MB or smaller.',
          ),
        );
      if (!valid.length) return;
      if (attachments.some(item => item.kind === 'video')) {
        if (
          !(await deleteTemporary([...temporaryIds.current], scope)) ||
          !current(scope)
        )
          return;
        setAttachments(
          valid.map(item => ({ ...item, source: 'pickedLocalFile' })),
        );
      } else
        setAttachments(items => [
          ...items,
          ...valid
            .filter(item => !items.some(existing => existing.uri === item.uri))
            .map(item => ({ ...item, source: 'pickedLocalFile' as const })),
        ]);
    } catch (error) {
      if (current(scope)) report(error);
    } finally {
      if (current(scope)) picking.current = false;
    }
  };
  const addVideo = async () => {
    if (
      locked() ||
      picking.current ||
      attachments.some(item => item.kind === 'video')
    )
      return;
    const scope = capture();
    picking.current = true;
    try {
      const picked = await pickStationVideoFromLibrary();
      if (!current(scope) || locked() || !picked) return;
      if (picked.byteSize !== null && picked.byteSize > maxVideoBytes) {
        Alert.alert(
          textFor(
            language,
            '视频不能超过 250 MB。',
            'The video must be 250 MB or smaller.',
          ),
        );
        return;
      }
      if (
        !(await deleteTemporary([...temporaryIds.current], scope)) ||
        !current(scope)
      )
        return;
      setAttachments([{ ...picked, source: 'pickedLocalFile' }]);
    } catch (error) {
      if (current(scope)) report(error);
    } finally {
      if (current(scope)) picking.current = false;
    }
  };
  const removeAttachment = async (uri: string) => {
    if (locked()) return;
    const item = attachments.find(entry => entry.uri === uri),
      scope = capture();
    if (
      item?.source === 'pickedLocalFile' &&
      item.assetId &&
      !(await deleteTemporary([item.assetId], scope))
    )
      return;
    if (current(scope))
      setAttachments(items => items.filter(entry => entry.uri !== uri));
  };
  const setBody = (value: string) => {
    if (!locked()) updateBody(value);
  };
  const toggleAgent = (agentId: string) => {
    if (!locked())
      setSelectedAgentIds(ids =>
        ids.includes(agentId)
          ? ids.filter(id => id !== agentId)
          : [...ids, agentId],
      );
  };
  const openVisibilityMenu = () => {
    if (locked()) return;
    const scope = capture();
    Alert.alert(textFor(language, '谁可以看', 'Post Visibility'), undefined, [
      ...(['public', 'friends', 'private'] as const).map((value, index) => ({
        text: [
          textFor(language, '公开', 'Public'),
          textFor(language, '好友可见', 'Friends'),
          textFor(language, '仅自己可见', 'Only Me'),
        ][index],
        onPress: () => {
          if (current(scope) && !locked()) setVisibility(value);
        },
      })),
      { text: textFor(language, '取消', 'Cancel'), style: 'cancel' },
    ]);
  };
  const openLocationMenu = () => {
    if (locked()) return;
    const scope = capture();
    const value = String(
      session.profile.activityArea || session.profile.community || '',
    )
      .trim()
      .slice(0, 120);
    if (!locationLabel && !value) {
      report(
        new Error(
          textFor(
            language,
            '请先在小站资料中设置活动区域。',
            'Set your activity area in Station first.',
          ),
        ),
      );
      return;
    }
    Alert.alert(
      textFor(language, '动态位置', 'Post Location'),
      locationLabel || value,
      [
        {
          text: locationLabel
            ? textFor(language, '移除位置', 'Remove Location')
            : textFor(language, '添加', 'Add'),
          onPress: () => {
            if (current(scope) && !locked())
              setLocationLabel(locationLabel ? '' : value);
          },
        },
        { text: textFor(language, '取消', 'Cancel'), style: 'cancel' },
      ],
    );
  };
  const verifyPublication = async () => {
    if (busy.current) return;
    const scope = capture();
    busy.current = true;
    setIsPublishing(true);
    try {
      const attempt =
        (await stationPostAttemptStore.read(userId)) || pending.current;
      if (!current(scope)) return;
      if (attempt) {
        restore(attempt);
        await verify(attempt, scope);
      }
      if (current(scope)) setIsRestoring(false);
    } catch (error) {
      if (current(scope)) report(error);
    } finally {
      if (current(scope)) {
        busy.current = false;
        setIsPublishing(false);
      }
    }
  };
  const publish = async () => {
    if (locked()) return;
    if (!canPublish) {
      Alert.alert(
        textFor(
          language,
          '请输入文字，或添加图片、视频。',
          'Enter some text or add photos or a video.',
        ),
      );
      return;
    }
    const scope = capture();
    busy.current = true;
    setIsPublishing(true);
    setPublishError('');
    setUploadedCount(0);
    let sent = false;
    try {
      const prepared: StationPostAttachment[] = [];
      for (const media of attachments) {
        if (!current(scope)) return;
        if (media.assetId) {
          prepared.push(media);
          setUploadedCount(prepared.length);
          continue;
        }
        if (media.source !== 'pickedLocalFile')
          throw new Error('附件缺少已有图片身份。');
        const asset = await session.createStationMediaAsset({
          kind: media.kind,
          originalFilename: media.originalFilename,
          mimeType: media.mimeType,
          byteSize: media.byteSize,
          width: media.width,
          height: media.height,
          localMedia: media,
        });
        if (!current(scope)) {
          await session.deleteStationMediaAsset(asset.id);
          return;
        }
        temporaryIds.current.add(asset.id);
        prepared.push({ ...media, assetId: asset.id });
        setUploadedCount(prepared.length);
        setAttachments(items =>
          items.map(item =>
            item.uri === media.uri ? { ...item, assetId: asset.id } : item,
          ),
        );
      }
      const payload = {
        body: body.trim(),
        locationLabel: locationLabel.trim(),
        visibility,
        agentCapabilities: [...selectedAgentIds],
        mediaAssetIds: prepared.map(item => item.assetId!),
      };
      const attempt: StationPostAttempt = {
        version: 1,
        clientRequestId: createIdempotencyKey(),
        requestHash: hashStationPostPayload(payload),
        payload,
        attachments: prepared.map(item => ({
          assetId: item.assetId!,
          kind: item.kind,
          source: item.source,
        })),
      };
      pending.current = attempt;
      setPendingAttempt(attempt);
      await stationPostAttemptStore.save(userId, attempt);
      if (!current(scope)) return;
      sent = true;
      await session.createStationPost({
        ...payload,
        clientRequestId: attempt.clientRequestId,
      });
      if (!current(scope)) return;
      await stationPostAttemptStore.clear(userId, attempt.clientRequestId);
      if (!current(scope)) return;
      pending.current = null;
      setPendingAttempt(null);
      temporaryIds.current.clear();
      onPublished();
    } catch (error) {
      if (!current(scope)) return;
      if (!sent && pending.current) {
        try {
          const saved = await stationPostAttemptStore.read(userId);
          if (!current(scope)) return;
          if (saved) restore(saved);
        } catch (storageError) {
          if (current(scope)) report(storageError);
        }
      }
      if (pending.current)
        setPublishError(
          textFor(
            language,
            sent
              ? '发布结果尚未确认。内容已冻结，请核验原发布；不会自动再次发布或删除图片。'
              : '本机发布记录尚未确认，尚未发送。请先核验原记录；内容和图片会保留。',
            sent
              ? 'Publication is unconfirmed. Verify the original request before editing; images are retained.'
              : 'The local publication record is unconfirmed; nothing was sent. Verify the record before editing; images are retained.',
          ),
        );
      else report(error);
    } finally {
      if (current(scope)) {
        busy.current = false;
        setIsPublishing(false);
      }
    }
  };
  const attachmentSource = (item: StationPostAttachment): ImageSourcePropType =>
    item.assetId && item.uri === buildStationMediaFileUrl(item.assetId)
      ? { uri: item.uri, headers: { Authorization: `Bearer ${session.token}` } }
      : { uri: item.uri };
  return {
    addImages,
    addVideo,
    attachments,
    attachmentSource,
    body,
    enabledAgents,
    isPublishing,
    isEditingLocked,
    isRestoring,
    pendingAttempt,
    locationLabel,
    openLocationMenu,
    openVisibilityMenu,
    postKind,
    publish,
    publishError,
    removeAttachment,
    requestClose,
    selectedAgentIds,
    setBody,
    setPublishError,
    toggleAgent,
    uploadedCount,
    visibility,
    verifyPublication,
  };
}
