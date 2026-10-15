import React, { useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { FileText, Plus } from 'lucide-react-native';
import { appErrorText, textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import {
  WorkspaceButton,
  WorkspaceState,
  workspaceStyles,
  workspaceTokens,
} from '../../shared/workspaceUi';
import { Language, useMiaoxunSession } from '../session/useMiaoxunSession';
import { workspacePalette } from '../../shared/workspacePalette';

function fileStatusText(status: string, language: Language) {
  const labels: Record<string, [string, string]> = {
    pending_upload: ['等待上传', 'Waiting for upload'],
    uploaded: ['已上传', 'Uploaded'],
    processed: ['文字预览已登记', 'Text preview registered'],
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
  palette,
  language,
  session,
  onBusyChange,
}: {
  palette: Palette;
  language: Language;
  session: ReturnType<typeof useMiaoxunSession>;
  onBusyChange?: (busy: boolean) => void;
}) {
  const colors = workspacePalette(palette);
  const [editing, setEditing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filename, setFilename] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const pending = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const save = async () => {
    if (
      !alive.current ||
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
      if (alive.current) {
        setEditing(false);
        setFilename('');
        setContent('');
        if (file?.id) setSelectedId(file.id);
      }
    } catch (cause) {
      if (alive.current)
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
  const selectedFile = session.stationContent.fileAssets.find(
    file => file.id === selectedId,
  );
  if (selectedId) {
    return (
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.panel}
      >
        <WorkspaceButton
          palette={colors}
          variant="secondary"
          label={textFor(language, '返回文件列表', 'Back to files')}
          onPress={() => setSelectedId(null)}
        />
        <Text
          accessibilityRole="header"
          style={[s.name, { color: colors.text }]}
        >
          {selectedFile?.originalFilename ||
            textFor(language, '文件不存在', 'File unavailable')}
        </Text>
        {selectedFile ? (
          <>
            <Text style={[s.body, { color: colors.secondaryText }]}>
              {selectedFile.mimeType}
              {typeof selectedFile.byteSize === 'number'
                ? ` · ${selectedFile.byteSize} B`
                : ''}
            </Text>
            <Text style={[s.body, { color: colors.secondaryText }]}>
              {textFor(language, '状态：', 'Status: ')}
              {fileStatusText(selectedFile.status, language)}
            </Text>
            <Text selectable style={[s.body, { color: colors.text }]}>
              {typeof selectedFile.preprocessingResult?.textPreview ===
                'string' && selectedFile.preprocessingResult.textPreview
                ? selectedFile.preprocessingResult.textPreview
                : textFor(
                    language,
                    '该素材暂无文字预览',
                    'No text preview is available for this material.',
                  )}
            </Text>
          </>
        ) : (
          <Text style={[s.body, { color: colors.secondaryText }]}>
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
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={s.panel}
    >
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
        icon={<Plus size={17} color={colors.surface} />}
        style={s.add}
      />
      <Text style={[s.body, { color: colors.secondaryText }]}>
        {textFor(
          language,
          '登记最多1000字符的文字预览。设备文件上传尚未开放。',
          'Register text previews up to 1,000 characters. Device file upload is not available.',
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
                backgroundColor: colors.surface,
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
                backgroundColor: colors.surface,
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
          />
        </View>
      ) : null}
      {error ? (
        <WorkspaceState palette={colors} title={error} tone="error" />
      ) : null}
      <Text style={[s.body, { color: colors.secondaryText }]}>
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
              if (!pending.current) setSelectedId(file.id);
            }}
            style={[
              s.file,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <View style={[s.fileIcon, { backgroundColor: colors.text }]}>
              <FileText size={19} color={colors.surface} />
            </View>
            <View style={s.fileCopy}>
              <Text numberOfLines={2} style={[s.name, { color: colors.text }]}>
                {file.originalFilename}
              </Text>
              <Text style={[s.body, { color: colors.secondaryText }]}>
                {fileStatusText(file.status, language)}
                {typeof file.byteSize === 'number'
                  ? ` · ${file.byteSize} B`
                  : ''}
              </Text>
            </View>
          </Pressable>
        ))
      ) : (
        <WorkspaceState
          palette={colors}
          title={textFor(language, '暂无文件素材', 'No file materials yet')}
        />
      )}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  panel: workspaceStyles.content,
  body: workspaceTokens.typography.caption,
  name: workspaceTokens.typography.title,
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
    width: 34,
    height: 34,
    borderRadius: workspaceTokens.radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileCopy: { flex: 1, minWidth: 0, gap: workspaceTokens.space.xs },
});
