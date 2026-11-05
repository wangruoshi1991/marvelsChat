import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ChevronRight, FileText, Plus } from 'lucide-react-native';
import { appErrorText, textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import {
  WorkspaceButton,
  WorkspaceState,
  workspaceStyles,
  workspaceTokens,
} from '../../shared/workspaceUi';
import { Language, useMiaoxunSession } from '../session/useMiaoxunSession';
import {
  secondFloorAccent,
  secondFloorPalette,
  secondFloorXunStyles,
} from './secondFloorTheme';
import { isV6Palette, v6Colors } from '../../shared/v6Palette';
import { isXunPalette } from '../../shared/xunPalette';
import { SecondFloorXunSourceIcon } from './SecondFloorSourceIcon';
import { AIContextReference } from '../../models/aiTask';
import { StationFileAssetDTO } from '../../models/api';
import {
  pickStationFile,
  releaseStationFile,
  PickedStationFile,
} from '../../services/stationFilePicker';
import { SecondFloorPageScrollProps } from './secondFloorScroll';
import type { UIComponentPreference } from '../ui/uiPreferenceTypes';
import { uiFontSize, uiRowGap } from '../ui/uiPreferences';

/**
 * Prototype shows readable sizes (「2.4 MB」), not raw bytes. The API reports
 * bytes, so convert for display only and keep the stored value untouched.
 */
export function formatFileSize(byteSize: number | null | undefined) {
  if (
    typeof byteSize !== 'number' ||
    !Number.isFinite(byteSize) ||
    byteSize < 0
  )
    return '';
  if (byteSize < 1024) return `${byteSize} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = byteSize / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}

/** Prototype marks each row with its file type (PDF / MD) instead of one icon. */
function fileTypeLabel(filename: string) {
  const extension = filename.split('.').pop()?.trim().toUpperCase() || '';
  return /^[A-Z0-9]{2,4}$/.test(extension) ? extension : '';
}

function fileStatusText(status: string, language: Language) {
  const labels: Record<string, [string, string]> = {
    pending_upload: ['等待上传', 'Waiting for upload'],
    uploaded: ['已上传', 'Uploaded'],
    processed: ['文字已登记', 'Text registered'],
    unsupported: ['暂不支持处理', 'Processing unsupported'],
    failed: ['处理失败', 'Processing failed'],
    deleted: ['已删除', 'Deleted'],
  };
  const label = labels[status];
  return label
    ? textFor(language, label[0], label[1])
    : textFor(language, `未知状态：${status}`, `Unknown status: ${status}`);
}

export function SecondFloorFiles({
  header,
  palette,
  language,
  session,
  uploadPreference,
  buttonScale,
  active = true,
  onBusyChange,
  onOpenFileAgent,
  scrollProps,
}: {
  header?: React.ReactNode;
  palette: Palette;
  language: Language;
  session: ReturnType<typeof useMiaoxunSession>;
  uploadPreference?: UIComponentPreference;
  buttonScale?: number;
  active?: boolean;
  onBusyChange?: (busy: boolean) => void;
  onOpenFileAgent?: (reference: AIContextReference) => void;
  scrollProps?: SecondFloorPageScrollProps;
}) {
  const colors = secondFloorPalette(palette);
  const v6 = isV6Palette(colors);
  const xun = isXunPalette(colors);
  const accent = secondFloorAccent(colors);
  const uploadVisible = uploadPreference?.visible !== false;
  const uploadLabel =
    uploadPreference?.label ||
    textFor(
      language,
      xun ? '上传文件' : '选择并上传文件',
      xun ? 'Upload file' : 'Choose and upload file',
    );
  const uiPreferences = session.uiPreferences;
  const tokens = uiPreferences?.surfaces.secondFloor;
  const uploadScale = Math.max(
    0.8,
    Math.min(
      1.3,
      (uploadPreference?.sizeScale ?? 1) *
        (buttonScale ?? tokens?.buttonScale ?? 1),
    ),
  );
  // Resize inside layout instead of transforming the native touch target.
  const uploadStyle = {
    minHeight: Math.max(44, 44 * uploadScale),
    minWidth: 44,
    maxWidth: '100%' as const,
    borderRadius: tokens?.buttonRadius ?? 12,
    paddingHorizontal: 8 * uploadScale,
    paddingVertical: 6 * uploadScale,
  };
  const uploadLabelStyle = {
    fontSize: uiFontSize(uiPreferences, 13) * uploadScale,
    lineHeight: uiFontSize(uiPreferences, 18) * uploadScale,
    flexShrink: 1,
  };
  const titleStyle = {
    fontSize: uiFontSize(uiPreferences, 23),
    lineHeight: uiFontSize(uiPreferences, 29),
  };
  const captionStyle = {
    fontSize: uiFontSize(uiPreferences, 13),
    lineHeight: uiFontSize(uiPreferences, 20),
  };
  const nameStyle = {
    fontSize: uiFontSize(uiPreferences, xun ? 13 : 14),
    lineHeight: uiFontSize(uiPreferences, xun ? 22 : 20),
  };
  const metaStyle = {
    fontSize: uiFontSize(uiPreferences, xun ? 11 : 13),
    lineHeight: uiFontSize(uiPreferences, xun ? 19 : 20),
  };
  const panelStyle = uiPreferences && {
    gap: uiRowGap(uiPreferences, 'secondFloor', xun ? 12 : 16),
  };
  const uploadIcon = uploadPreference?.icon;
  const [detail, setDetail] = useState<
    (StationFileAssetDTO & { content: string | null }) | null
  >(null);
  const [uploadFile, setUploadFile] = useState<PickedStationFile | null>(null);
  const retainedUploadFile = useRef<{
    file: PickedStationFile;
    release?: Promise<void>;
  } | null>(null);
  const releaseUploadFile = useCallback((file: PickedStationFile) => {
    const retained = retainedUploadFile.current;
    if (retained?.file !== file) return Promise.resolve();
    if (retained.release) return retained.release;
    retained.release = releaseStationFile(file)
      .then(() => {
        if (retainedUploadFile.current === retained)
          retainedUploadFile.current = null;
      })
      .catch(cause => {
        retained.release = undefined;
        throw cause;
      });
    return retained.release;
  }, []);
  const latest = useRef({ active, token: session.token, epoch: 0 });
  if (
    latest.current.active !== active ||
    latest.current.token !== session.token
  )
    latest.current = {
      active,
      token: session.token,
      epoch: latest.current.epoch + 1,
    };
  const [editing, setEditing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filename, setFilename] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const foreground = useRef(AppState.currentState === 'active');
  // Invalidate reads/navigation without invalidating the native picker round trip.
  const foregroundEpoch = useRef(0);
  // A detail request can finish after the user has returned to the list. Keep
  // that navigation transition separate from lifecycle/account invalidation.
  const detailReadGeneration = useRef(0);
  const pending = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      foreground.current = state === 'active';
      if (state !== 'active') foregroundEpoch.current += 1;
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    setDetail(null);
    setSelectedId(null);
    detailReadGeneration.current += 1;
    setFilename('');
    setContent('');
    setEditing(false);
    setError('');
    setUploadFile(null);
  }, [session.token]);
  useEffect(() => {
    if (!active) {
      detailReadGeneration.current += 1;
      setDetail(null);
      setSelectedId(null);
    }
  }, [active]);
  const save = async () => {
    const epoch = latest.current.epoch;
    if (
      !alive.current ||
      !foreground.current ||
      !filename.trim() ||
      !content.trim() ||
      pending.current
    )
      return;
    setError('');
    setBusy(true);
    pending.current = true;
    onBusyChange?.(true);
    try {
      const file = await session.createStationFileAsset({
        originalFilename: filename.trim().toLowerCase().endsWith('.txt')
          ? filename.trim()
          : `${filename.trim()}.txt`,
        mimeType: 'text/plain',
        content,
        metadata: { source: 'second-floor-text' },
      });
      if (
        alive.current &&
        latest.current.active &&
        latest.current.epoch === epoch
      ) {
        setEditing(false);
        setFilename('');
        setContent('');
        if (file?.id) setSelectedId(file.id);
      }
    } catch (cause) {
      if (
        alive.current &&
        latest.current.active &&
        latest.current.epoch === epoch
      )
        setError(
          appErrorText(
            language,
            cause,
            '保存失败，请重试',
            'Save failed. Try again.',
          ),
        );
    } finally {
      pending.current = false;
      if (alive.current) {
        setBusy(false);
        onBusyChange?.(false);
      }
    }
  };
  const perform = async (action: () => Promise<void>) => {
    if (pending.current || !foreground.current) return;
    const owner = session.token;
    const epoch = latest.current.epoch;
    pending.current = true;
    setBusy(true);
    setError('');
    onBusyChange?.(true);
    try {
      await action();
    } catch (cause) {
      if (
        alive.current &&
        latest.current.active &&
        latest.current.token === owner &&
        latest.current.epoch === epoch
      )
        setError(
          appErrorText(
            language,
            cause,
            '操作失败，请重试',
            'Operation failed. Try again.',
          ),
        );
    } finally {
      pending.current = false;
      if (alive.current) {
        setBusy(false);
        onBusyChange?.(false);
      }
    }
  };
  const loadDetail = async (id: string) => {
    const epoch = latest.current.epoch;
    const appEpoch = foregroundEpoch.current;
    const owner = session.token;
    const generation = detailReadGeneration.current;
    let result;
    try {
      result = await session.stationFileAsset(id);
    } catch (cause) {
      if (
        alive.current &&
        latest.current.token === owner &&
        latest.current.epoch === epoch &&
        foregroundEpoch.current === appEpoch &&
        detailReadGeneration.current === generation
      ) {
        setDetail(null);
        setSelectedId(null);
        throw cause;
      }
      return null;
    }
    if (
      alive.current &&
      latest.current.active &&
      latest.current.token === owner &&
      latest.current.epoch === epoch &&
      foregroundEpoch.current === appEpoch &&
      detailReadGeneration.current === generation
    ) {
      setDetail(result);
      setSelectedId(id);
    }
    if (
      !alive.current ||
      !foreground.current ||
      !latest.current.active ||
      latest.current.epoch !== epoch ||
      foregroundEpoch.current !== appEpoch ||
      detailReadGeneration.current !== generation
    )
      return null;
    return result;
  };
  const upload = () =>
    perform(async () => {
      const owner = session.token;
      const epoch = latest.current.epoch;
      const file = uploadFile || (await pickStationFile());
      if (!file) return;
      if (
        !alive.current ||
        !latest.current.active ||
        latest.current.token !== owner ||
        latest.current.epoch !== epoch
      ) {
        await releaseStationFile(file);
        return;
      }
      if (retainedUploadFile.current?.file !== file)
        retainedUploadFile.current = { file };
      setUploadFile(file);
      await session.uploadStationFileAsset(file);
      await releaseUploadFile(file);
      if (
        alive.current &&
        latest.current.active &&
        latest.current.token === owner &&
        latest.current.epoch === epoch
      ) {
        setUploadFile(null);
      } else {
        return;
      }
      await session.refreshStationContent();
    });
  useEffect(
    () => () => {
      const retained = retainedUploadFile.current;
      if (retained)
        releaseUploadFile(retained.file).catch(() => {
          console.warn('Temporary file cleanup failed');
        });
    },
    [session.token, releaseUploadFile],
  );
  const selectedFile =
    detail?.id === selectedId
      ? detail
      : session.stationContent.fileAssets.find(file => file.id === selectedId);
  if (selectedId) {
    // File reading is a nested detail route. Its upward scroll must stay
    // inside the document instead of being interpreted as floor exit.
    return (
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.panel, xun && s.panelXun, panelStyle]}
      >
        {header}
        {error ? (
          <WorkspaceState palette={colors} tone="error" title={error} />
        ) : null}
        <WorkspaceButton
          palette={colors}
          variant="secondary"
          label={textFor(language, '返回文件列表', 'Back to files')}
          onPress={() => {
            detailReadGeneration.current += 1;
            setDetail(null);
            setSelectedId(null);
          }}
          labelStyle={xun ? secondFloorXunStyles.secondaryLabel : undefined}
          style={xun ? secondFloorXunStyles.secondaryButton : undefined}
        />
        <Text
          accessibilityRole="header"
          style={[s.name, xun && s.nameXun, nameStyle, { color: colors.text }]}
        >
          {selectedFile?.originalFilename ||
            textFor(language, '文件不存在', 'File unavailable')}
        </Text>
        {selectedFile ? (
          <>
            <Text
              style={[
                s.body,
                xun && s.metaXun,
                metaStyle,
                { color: colors.secondaryText },
              ]}
            >
              {selectedFile.mimeType}
              {formatFileSize(selectedFile.byteSize)
                ? ` · ${formatFileSize(selectedFile.byteSize)}`
                : ''}
            </Text>
            <Text
              style={[
                s.body,
                xun && s.metaXun,
                metaStyle,
                { color: colors.secondaryText },
              ]}
            >
              {textFor(language, '状态：', 'Status: ')}
              {selectedFile.reference
                ? textFor(language, '可用于摘要', 'Ready for summary')
                : fileStatusText(selectedFile.status, language)}
            </Text>
            {detail && !detail.reference ? (
              <Text
                style={[s.body, captionStyle, { color: colors.secondaryText }]}
              >
                {textFor(
                  language,
                  '旧记录没有完整正文，请重新上传后用于摘要。',
                  'This older record has no full content. Upload it again to request a summary.',
                )}
              </Text>
            ) : null}
            <WorkspaceButton
              palette={colors}
              variant="secondary"
              label={textFor(language, '重新读取正文', 'Reload content')}
              busy={busy}
              onPress={() =>
                perform(async () => {
                  await loadDetail(selectedFile.id);
                })
              }
              labelStyle={xun ? secondFloorXunStyles.secondaryLabel : undefined}
              style={xun ? secondFloorXunStyles.secondaryButton : undefined}
            />
            {detail?.reference && detail.content !== null && onOpenFileAgent ? (
              <WorkspaceButton
                palette={colors}
                label={textFor(language, '交给文件Agent', 'Ask File Agent')}
                disabled={busy}
                onPress={() =>
                  perform(async () => {
                    const epoch = latest.current.epoch;
                    const appEpoch = foregroundEpoch.current;
                    const file = await loadDetail(selectedFile.id);
                    if (
                      !file ||
                      !alive.current ||
                      !foreground.current ||
                      !latest.current.active ||
                      latest.current.token !== session.token ||
                      latest.current.epoch !== epoch ||
                      foregroundEpoch.current !== appEpoch
                    )
                      return;
                    if (!file.reference || file.content === null)
                      throw new Error('文件暂无完整正文，不能引用。');
                    onOpenFileAgent(file.reference);
                  })
                }
                labelStyle={xun ? secondFloorXunStyles.primaryLabel : undefined}
                style={xun ? secondFloorXunStyles.primaryButton : undefined}
              />
            ) : null}
            <WorkspaceButton
              palette={colors}
              variant="ghost"
              label={textFor(language, '删除文件', 'Delete file')}
              disabled={busy}
              onPress={() =>
                Alert.alert(
                  textFor(language, '删除文件？', 'Delete file?'),
                  textFor(
                    language,
                    '删除后正文及原有引用将失效。',
                    'Content and existing references will become unavailable.',
                  ),
                  [
                    {
                      text: textFor(language, '取消', 'Cancel'),
                      style: 'cancel',
                    },
                    {
                      text: textFor(language, '删除', 'Delete'),
                      style: 'destructive',
                      onPress: () =>
                        perform(async () => {
                          await session.deleteStationFileAsset(selectedFile.id);
                          if (
                            alive.current &&
                            latest.current.token === session.token
                          ) {
                            setSelectedId(null);
                            setDetail(null);
                          }
                        }),
                    },
                  ],
                )
              }
            />
            <Text
              selectable
              style={[s.body, captionStyle, { color: colors.text }]}
            >
              {detail?.content ??
                (typeof selectedFile.preprocessingResult?.textPreview ===
                  'string' && selectedFile.preprocessingResult.textPreview
                  ? selectedFile.preprocessingResult.textPreview
                  : textFor(
                      language,
                      '该素材暂无文字预览',
                      'No text preview is available for this material.',
                    ))}
            </Text>
          </>
        ) : (
          <Text style={[s.body, captionStyle, { color: colors.secondaryText }]}>
            {textFor(
              language,
              '该素材已被移除，请返回文件列表。',
              'This material was removed. Return to the file list.',
            )}
          </Text>
        )}
      </ScrollView>
    );
  }
  return (
    <ScrollView
      {...scrollProps}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[s.panel, xun && s.panelXun, panelStyle]}
    >
      {header}
      <View style={s.pageHeader}>
        <View style={s.headingRow}>
          <Text
            accessibilityRole="header"
            style={[s.pageTitle, titleStyle, { color: colors.text }]}
          >
            {textFor(language, '文件', 'Files')}
          </Text>
          {xun && uploadVisible ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                uploadFile
                  ? textFor(language, '重试上传同一文件', 'Retry same file')
                  : uploadLabel
              }
              accessibilityState={{ disabled: busy, busy }}
              disabled={busy}
              onPress={upload}
              style={({ pressed }) => [
                s.headerLink,
                uploadStyle,
                pressed && !busy && workspaceStyles.pressed,
              ]}
            >
              {busy ? (
                <ActivityIndicator size="small" color={accent} />
              ) : uploadIcon ? (
                <Text
                  style={[
                    s.headerLinkIcon,
                    uploadLabelStyle,
                    { color: accent },
                  ]}
                >
                  {uploadIcon}
                </Text>
              ) : (
                <Plus size={16 * uploadScale} color={accent} />
              )}
              <Text
                style={[s.headerLinkLabel, uploadLabelStyle, { color: accent }]}
              >
                {uploadFile
                  ? textFor(language, '重试上传', 'Retry upload')
                  : uploadLabel}
              </Text>
            </Pressable>
          ) : !xun && uploadVisible ? (
            <WorkspaceButton
              palette={colors}
              accessibilityLabel={
                uploadFile
                  ? textFor(language, '重试上传同一文件', 'Retry same file')
                  : uploadLabel
              }
              label={
                uploadFile
                  ? textFor(language, '重试上传同一文件', 'Retry same file')
                  : uploadLabel
              }
              busy={busy}
              onPress={upload}
              labelStyle={uploadLabelStyle}
              icon={
                uploadIcon ? (
                  <Text
                    style={{ color: v6 ? v6Colors.onAccent : colors.surface }}
                  >
                    {uploadIcon}
                  </Text>
                ) : undefined
              }
              style={[s.headerAction, uploadStyle]}
            />
          ) : null}
        </View>
        <Text
          style={[s.pageHint, captionStyle, { color: colors.secondaryText }]}
        >
          {textFor(
            language,
            '你的资料，都在这里。',
            'Your materials live here.',
          )}
        </Text>
      </View>
      {uploadFile && !busy ? (
        <WorkspaceButton
          palette={colors}
          variant="ghost"
          label={textFor(language, '放弃本次上传', 'Discard upload')}
          onPress={() => {
            perform(async () => {
              await releaseUploadFile(uploadFile);
              if (alive.current && latest.current.token === session.token)
                setUploadFile(null);
            });
          }}
        />
      ) : null}
      <Text
        style={[
          s.sectionTitle,
          {
            color: colors.text,
            fontSize: uiFontSize(uiPreferences, 14),
            lineHeight: uiFontSize(uiPreferences, 20),
          },
        ]}
      >
        {textFor(language, '最近文件', 'Recent files')}
      </Text>
      {session.stationContent.fileAssets.length ? (
        session.stationContent.fileAssets.map(file => (
          <Pressable
            key={file.id}
            accessibilityRole="button"
            accessibilityLabel={textFor(
              language,
              `查看${file.originalFilename}`,
              `View ${file.originalFilename}`,
            )}
            disabled={busy}
            accessibilityState={{ disabled: busy }}
            onPress={() => {
              if (!pending.current) {
                detailReadGeneration.current += 1;
                setDetail(null);
                setSelectedId(file.id);
                perform(async () => {
                  await loadDetail(file.id);
                });
              }
            }}
            style={({ pressed }) => [
              s.file,
              xun && s.fileXun,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                ...(tokens && { borderRadius: tokens.cardRadius }),
              },
              pressed && !busy && workspaceStyles.pressed,
            ]}
          >
            {xun ? (
              <SecondFloorXunSourceIcon>
                <FileText
                  accessible={false}
                  size={19}
                  color="#f6f7fa"
                  strokeWidth={1.8}
                />
              </SecondFloorXunSourceIcon>
            ) : (
              <View
                style={[
                  s.fileIcon,
                  { backgroundColor: v6 ? colors.soft : colors.text },
                ]}
              >
                {fileTypeLabel(file.originalFilename) ? (
                  <Text
                    style={[
                      s.fileIconText,
                      { color: v6 ? accent : colors.surface },
                    ]}
                    numberOfLines={1}
                  >
                    {fileTypeLabel(file.originalFilename)}
                  </Text>
                ) : (
                  <FileText size={19} color={v6 ? accent : colors.surface} />
                )}
              </View>
            )}
            <View style={s.fileCopy}>
              <Text
                numberOfLines={2}
                style={[
                  s.name,
                  xun && s.nameXun,
                  nameStyle,
                  { color: colors.text },
                ]}
              >
                {file.originalFilename}
              </Text>
              <Text
                style={[
                  s.body,
                  xun && s.metaXun,
                  metaStyle,
                  { color: colors.secondaryText },
                ]}
              >
                {[
                  fileStatusText(file.status, language),
                  formatFileSize(file.byteSize),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            <ChevronRight
              accessible={false}
              size={18}
              strokeWidth={1.7}
              color={colors.secondaryText}
            />
          </Pressable>
        ))
      ) : (
        <WorkspaceState
          palette={colors}
          title={textFor(language, '暂无文件素材', 'No file materials yet')}
        />
      )}
      <WorkspaceButton
        palette={colors}
        label={textFor(
          language,
          editing ? '收起编辑' : '添加文字素材',
          editing ? 'Hide editor' : 'Add text material',
        )}
        onPress={() => {
          if (!pending.current) setEditing(value => !value);
        }}
        disabled={busy}
        accessibilityState={{ expanded: editing }}
        icon={
          <Plus
            size={17}
            color={xun ? '#073b3d' : v6 ? v6Colors.onAccent : colors.surface}
          />
        }
        labelStyle={xun ? secondFloorXunStyles.primaryLabel : undefined}
        style={[s.add, xun && secondFloorXunStyles.primaryButton]}
      />
      <Text style={[s.body, captionStyle, { color: colors.secondaryText }]}>
        {textFor(
          language,
          '也可以直接添加一段文字，交给文件 Agent 阅读和整理。',
          'You can also add text for File Agent to read and organize.',
        )}
      </Text>
      {editing ? (
        <View style={s.editor}>
          <TextInput
            accessibilityLabel={textFor(language, '素材名称', 'Material name')}
            placeholder={textFor(language, '素材名称', 'Material name')}
            placeholderTextColor={colors.secondaryText}
            maxLength={170}
            editable={!busy}
            value={filename}
            onChangeText={setFilename}
            style={[
              s.input,
              {
                color: colors.text,
                borderColor: colors.border,
                backgroundColor: v6 || xun ? colors.input : colors.surface,
              },
            ]}
          />
          <TextInput
            accessibilityLabel={textFor(language, '素材内容', 'Material text')}
            placeholder={textFor(
              language,
              '粘贴或输入你的文字',
              'Paste or write your text',
            )}
            placeholderTextColor={colors.secondaryText}
            multiline
            maxLength={1000}
            editable={!busy}
            value={content}
            onChangeText={setContent}
            style={[
              s.input,
              s.textarea,
              {
                color: colors.text,
                borderColor: colors.border,
                backgroundColor: v6 || xun ? colors.input : colors.surface,
              },
            ]}
          />
          <WorkspaceButton
            palette={colors}
            label={textFor(
              language,
              busy ? '保存中' : '保存素材',
              busy ? 'Saving' : 'Save material',
            )}
            disabled={!filename.trim() || !content.trim()}
            busy={busy}
            onPress={save}
            labelStyle={xun ? secondFloorXunStyles.primaryLabel : undefined}
            style={xun ? secondFloorXunStyles.primaryButton : undefined}
          />
        </View>
      ) : null}
      {error ? (
        <WorkspaceState palette={colors} title={error} tone="error" />
      ) : null}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  panel: workspaceStyles.content,
  panelXun: {
    paddingHorizontal: 17,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 12,
  },
  pageHeader: { gap: workspaceTokens.space.xs },
  pageTitle: { fontSize: 23, lineHeight: 29, fontWeight: '700' },
  headingRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: workspaceTokens.space.sm,
  },
  headerAction: { minHeight: 40, paddingHorizontal: 11 },
  headerLink: {
    minHeight: workspaceTokens.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 2,
  },
  headerLinkIcon: { fontSize: 16, lineHeight: 18, fontWeight: '600' },
  headerLinkLabel: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  pageHint: { fontSize: 13, lineHeight: 22 },
  body: workspaceTokens.typography.caption,
  metaXun: { fontSize: 11, lineHeight: 19 },
  sectionTitle: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  name: workspaceTokens.typography.title,
  nameXun: { fontSize: 13, lineHeight: 22 },
  editor: { gap: workspaceTokens.space.md },
  add: { alignSelf: 'flex-start' },
  input: workspaceStyles.input,
  textarea: { minHeight: 150, textAlignVertical: 'top' },
  file: {
    ...workspaceStyles.panel,
    minHeight: workspaceTokens.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
  },
  fileIcon: {
    width: 45,
    height: 45,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileXun: {
    borderRadius: 23,
    paddingHorizontal: 17,
    paddingVertical: 20,
    shadowColor: '#263a50',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
    elevation: 1,
  },
  fileIconText: { fontSize: 11, fontWeight: '800' },
  fileCopy: { flex: 1, minWidth: 0, gap: workspaceTokens.space.xs },
});
