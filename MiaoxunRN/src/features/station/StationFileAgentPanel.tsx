import React, { useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { AgentReadinessDTO, StationFileAssetDTO } from '../../models/api';
import { textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { Language } from '../session/useMiaoxunSession';
import { StationModule } from './StationHomeModules';

const defaultContent =
  '今天的照片、日记和视频草稿可以围绕同一个生活片段联动。';

export function StationFileAgentPanel({
  palette,
  language,
  readiness,
  fileAssets,
  onCreateFileAsset,
  onPreprocessFileAsset,
  onActionMessage,
  onActionError,
}: {
  palette: Palette;
  language: Language;
  readiness?: AgentReadinessDTO;
  fileAssets: StationFileAssetDTO[];
  onCreateFileAsset: (payload: {
    originalFilename: string;
    mimeType?: string;
    content?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<StationFileAssetDTO>;
  onPreprocessFileAsset: (
    fileAssetId: string,
    payload: {
      originalFilename?: string;
      mimeType?: string;
      content?: string;
      metadata?: Record<string, unknown>;
    },
  ) => Promise<StationFileAssetDTO>;
  onActionMessage: (message: string) => void;
  onActionError: (error: unknown) => void;
}) {
  const [filename, setFilename] = useState('小站素材笔记.md');
  const [content, setContent] = useState(defaultContent);
  const [isProcessing, setIsProcessing] = useState(false);
  const latestFiles = useMemo(
    () =>
      [...fileAssets]
        .sort((left, right) =>
          String(right.createdAt || '').localeCompare(String(left.createdAt || '')),
        )
        .slice(0, 3),
    [fileAssets],
  );

  const processFile = async () => {
    const safeFilename = filename.trim();
    const safeContent = content.trim();
    if (!safeFilename || !safeContent || isProcessing) {
      return;
    }
    setIsProcessing(true);
    try {
      const asset = await onCreateFileAsset({
        originalFilename: safeFilename,
        mimeType: mimeTypeForFilename(safeFilename),
        content: safeContent,
        metadata: { source: 'station-text-material' },
      });
      await onPreprocessFileAsset(asset.id, {
        originalFilename: safeFilename,
        mimeType: mimeTypeForFilename(safeFilename),
        content: safeContent,
        metadata: { source: 'station-text-material' },
      });
      onActionMessage(textFor(language, '素材已整理', 'Material processed'));
    } catch (error) {
      onActionError(error);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <StationModule
      palette={palette}
      title={textFor(language, '素材预处理 Agent', 'Material Preprocessing Agent')}
      action={isProcessing ? textFor(language, '整理中', 'Processing') : textFor(language, '整理', 'Process')}
      onAction={processFile}
    >
      <View style={styles.stationAgentLoopStack}>
        <View
          style={[
            styles.stationAgentLoopStatus,
            { backgroundColor: palette.soft, borderColor: palette.border },
          ]}
        >
          <View style={styles.stationAgentLoopStatusCopy}>
            <Text style={[styles.stationAgentLoopEyebrow, { color: palette.secondaryText }]}>
              {textFor(language, '素材整理', 'Material Processing')}
            </Text>
            <Text style={[styles.stationAgentLoopTitle, { color: palette.text }]}>
              {readiness?.configured
                ? textFor(language, '可整理文字素材并提取摘要', 'Ready to summarize text material')
                : textFor(language, '真实文件上传稍后开放', 'File upload will open later')}
            </Text>
          </View>
          <Text
            style={[
              styles.stationAgentLoopBadge,
              { backgroundColor: palette.surface, color: palette.text },
            ]}
          >
            {readiness?.configured
              ? textFor(language, '可用', 'Ready')
              : textFor(language, '待开放', 'Pending')}
          </Text>
        </View>

        <TextInput
          value={filename}
          onChangeText={setFilename}
          maxLength={180}
          placeholder={textFor(language, '素材名称', 'Material name')}
          placeholderTextColor={palette.secondaryText}
          style={[
            styles.settingsInput,
            { backgroundColor: palette.input, borderColor: palette.border, color: palette.text },
          ]}
        />
        <TextInput
          value={content}
          onChangeText={setContent}
          multiline
          maxLength={2000}
          placeholder={textFor(language, '输入要整理的文字素材', 'Enter text material to process')}
          placeholderTextColor={palette.secondaryText}
          style={[
            styles.settingsInput,
            styles.stationAgentLoopInput,
            { backgroundColor: palette.input, borderColor: palette.border, color: palette.text },
          ]}
        />

        {latestFiles.length ? (
          latestFiles.map(asset => (
            <View
              key={asset.id}
              style={[
                styles.stationAgentLoopCard,
                { borderColor: palette.border, backgroundColor: palette.surface },
              ]}
            >
              <Text style={[styles.stationAgentLoopTitle, { color: palette.text }]}>
                {asset.preprocessingResult?.title
                  ? String(asset.preprocessingResult.title)
                  : asset.originalFilename}
              </Text>
              <Text style={[styles.stationAgentLoopBody, { color: palette.secondaryText }]}>
                {asset.preprocessingResult?.summary
                  ? String(asset.preprocessingResult.summary)
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
          <Text style={[styles.relationshipEmpty, { color: palette.secondaryText }]}>
            {textFor(
              language,
              '暂无素材。整理后的摘要、标签和预览会显示在这里。',
              'No material yet. Processed summaries, tags, and previews will appear here.',
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
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
    return 'text/markdown';
  }
  return 'text/plain';
}

function statusText(language: Language, status: string) {
  if (status === 'processed') {
    return textFor(language, '已整理', 'Processed');
  }
  if (status === 'unsupported') {
    return textFor(language, '暂不支持', 'Unsupported');
  }
  return textFor(language, '等待整理', 'Pending');
}
