import React, { useMemo, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { StationFileAssetDTO } from '../../models/api';
import { textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { Language } from '../session/useMiaoxunSession';
import { StationModule } from './StationHomeModules';

export function StationFileAgentPanel({
  palette,
  language,
  fileAssets,
  onCreateFileAsset,
  onActionMessage,
  onActionError,
}: {
  palette: Palette;
  language: Language;
  fileAssets: StationFileAssetDTO[];
  onCreateFileAsset: (payload: {
    originalFilename: string;
    mimeType?: string;
    content?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<StationFileAssetDTO>;
  onActionMessage: (message: string) => void;
  onActionError: (error: unknown) => void;
}) {
  const [filename, setFilename] = useState('');
  const [content, setContent] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const pending = useRef(false);
  const latestFiles = useMemo(
    () =>
      [...fileAssets]
        .sort((left, right) =>
          String(right.createdAt || '').localeCompare(
            String(left.createdAt || ''),
          ),
        )
        .slice(0, 3),
    [fileAssets],
  );

  const processFile = async () => {
    const safeFilename = filename.trim();
    if (!safeFilename || !content.trim() || pending.current) {
      return;
    }
    pending.current = true;
    setIsProcessing(true);
    try {
      const asset = await onCreateFileAsset({
        originalFilename: safeFilename,
        mimeType: mimeTypeForFilename(safeFilename),
        content,
        metadata: { source: 'station-text-material' },
      });
      setFilename('');
      setContent('');
      onActionMessage(statusText(language, asset.status));
    } catch (error) {
      onActionError(error);
    } finally {
      pending.current = false;
      setIsProcessing(false);
    }
  };

  return (
    <StationModule
      palette={palette}
      title={textFor(language, '文字素材', 'Text material')}
      action={
        isProcessing
          ? textFor(language, '登记中', 'Registering')
          : textFor(language, '登记预览', 'Register preview')
      }
      onAction={processFile}
      actionDisabled={isProcessing || !filename.trim() || !content.trim()}
    >
      <View style={styles.stationAgentLoopStack}>
        <View
          style={[
            styles.stationAgentLoopStatus,
            { backgroundColor: palette.soft, borderColor: palette.border },
          ]}
        >
          <View style={styles.stationAgentLoopStatusCopy}>
            <Text
              style={[
                styles.stationAgentLoopEyebrow,
                { color: palette.secondaryText },
              ]}
            >
              {textFor(language, '文字预览', 'Text preview')}
            </Text>
            <Text
              style={[styles.stationAgentLoopTitle, { color: palette.text }]}
            >
              {textFor(
                language,
                '仅登记文字预览，设备文件上传尚未开放',
                'Register text previews; device file upload is not available',
              )}
            </Text>
          </View>
          <Text
            style={[
              styles.stationAgentLoopBadge,
              { backgroundColor: palette.surface, color: palette.text },
            ]}
          >
            {textFor(language, '文字', 'Text')}
          </Text>
        </View>

        <TextInput
          value={filename}
          onChangeText={setFilename}
          accessibilityLabel={textFor(language, '素材名称', 'Material name')}
          editable={!isProcessing}
          maxLength={180}
          placeholder={textFor(language, '素材名称', 'Material name')}
          placeholderTextColor={palette.secondaryText}
          style={[
            styles.settingsInput,
            {
              backgroundColor: palette.input,
              borderColor: palette.border,
              color: palette.text,
            },
          ]}
        />
        <TextInput
          value={content}
          onChangeText={setContent}
          accessibilityLabel={textFor(language, '素材内容', 'Material text')}
          editable={!isProcessing}
          multiline
          maxLength={1000}
          placeholder={textFor(
            language,
            '输入文字预览，最多1000字符',
            'Enter a text preview, up to 1,000 characters',
          )}
          placeholderTextColor={palette.secondaryText}
          style={[
            styles.settingsInput,
            styles.stationAgentLoopInput,
            {
              backgroundColor: palette.input,
              borderColor: palette.border,
              color: palette.text,
            },
          ]}
        />

        {latestFiles.length ? (
          latestFiles.map(asset => (
            <View
              key={asset.id}
              style={[
                styles.stationAgentLoopCard,
                {
                  borderColor: palette.border,
                  backgroundColor: palette.surface,
                },
              ]}
            >
              <Text
                style={[styles.stationAgentLoopTitle, { color: palette.text }]}
              >
                {asset.originalFilename}
              </Text>
              <Text
                selectable
                style={[
                  styles.stationAgentLoopBody,
                  { color: palette.secondaryText },
                ]}
              >
                {typeof asset.preprocessingResult?.textPreview === 'string'
                  ? asset.preprocessingResult.textPreview
                  : statusText(language, asset.status)}
              </Text>
              <View style={styles.stationAgentLoopChipRow}>
                <Text
                  style={[
                    styles.stationAgentLoopChip,
                    { backgroundColor: palette.soft, color: palette.text },
                  ]}
                >
                  {statusText(language, asset.status)}
                </Text>
                <Text
                  style={[
                    styles.stationAgentLoopChip,
                    { backgroundColor: palette.soft, color: palette.text },
                  ]}
                >
                  {textFor(language, '文字素材', 'Text material')}
                </Text>
              </View>
            </View>
          ))
        ) : (
          <Text
            style={[styles.relationshipEmpty, { color: palette.secondaryText }]}
          >
            {textFor(
              language,
              '暂无文字预览。需要摘要时，请在对话中提供要整理的文字。',
              'No text previews yet. To request a summary, provide the text in a conversation.',
            )}
          </Text>
        )}
      </View>
    </StationModule>
  );
}

function mimeTypeForFilename(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.json')) {
    return 'application/json';
  }
  if (lower.endsWith('.csv')) {
    return 'text/csv';
  }
  if (lower.endsWith('.tsv')) {
    return 'text/tab-separated-values';
  }
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
    return 'text/markdown';
  }
  return 'text/plain';
}

function statusText(language: Language, status: string) {
  if (status === 'processed') {
    return textFor(language, '文字预览已登记', 'Text preview registered');
  }
  if (status === 'unsupported') {
    return textFor(language, '暂不支持', 'Unsupported');
  }
  return textFor(language, '尚无文字预览', 'No text preview');
}
