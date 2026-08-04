import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import {
  AgentReadinessDTO,
  StationAlbumSuggestionDTO,
  StationVisibility,
} from '../../models/api';
import { textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { Language } from '../session/useMiaoxunSession';
import { StationModule } from './StationHomeModules';

export function StationAlbumAgentPanel({
  palette,
  language,
  readiness,
  onLoadSuggestions,
  onApplySuggestion,
  onActionMessage,
  onActionError,
}: {
  palette: Palette;
  language: Language;
  readiness?: AgentReadinessDTO;
  onLoadSuggestions: () => Promise<StationAlbumSuggestionDTO[]>;
  onApplySuggestion: (payload: {
    title: string;
    description?: string;
    visibility?: StationVisibility;
    mediaAssetIds: string[];
  }) => Promise<unknown>;
  onActionMessage: (message: string) => void;
  onActionError: (error: unknown) => void;
}) {
  const [suggestions, setSuggestions] = useState<StationAlbumSuggestionDTO[]>(
    [],
  );
  const [isLoading, setIsLoading] = useState(false);
  const [applyingTitle, setApplyingTitle] = useState<string | null>(null);

  const loadSuggestions = async () => {
    if (isLoading) {
      return;
    }
    setIsLoading(true);
    try {
      const nextSuggestions = await onLoadSuggestions();
      setSuggestions(nextSuggestions);
      onActionMessage(
        nextSuggestions.length
          ? textFor(language, '相册整理建议已更新', 'Album suggestions updated')
          : textFor(language, '暂无可整理素材', 'No media to organize yet'),
      );
    } catch (error) {
      onActionError(error);
    } finally {
      setIsLoading(false);
    }
  };

  const applySuggestion = async (suggestion: StationAlbumSuggestionDTO) => {
    if (applyingTitle || !suggestion.mediaAssetIds.length) {
      return;
    }
    setApplyingTitle(suggestion.title);
    try {
      await onApplySuggestion({
        title: suggestion.title,
        description: suggestion.description,
        visibility: suggestion.visibility || 'private',
        mediaAssetIds: suggestion.mediaAssetIds,
      });
      setSuggestions(current =>
        current.filter(item => item.title !== suggestion.title),
      );
      onActionMessage(textFor(language, '相册已整理', 'Album organized'));
    } catch (error) {
      onActionError(error);
    } finally {
      setApplyingTitle(null);
    }
  };

  return (
    <StationModule
      palette={palette}
      title={textFor(language, '相册管理 Agent', 'Album Management Agent')}
      action={
        isLoading
          ? textFor(language, '整理中', 'Organizing')
          : textFor(language, '整理', 'Organize')
      }
      onAction={loadSuggestions}
    >
      <View style={styles.stationAgentLoopStack}>
        <AgentStatus
          palette={palette}
          language={language}
          title={textFor(language, '相册整理', 'Album Organization')}
          configured={readiness?.configured}
          body={
            readiness?.configured
              ? textFor(
                  language,
                  '可根据照片内容建议相册分类',
                  'Ready to suggest album groups',
                )
              : textFor(language, '暂无素材可整理', 'No media to organize yet')
          }
        />

        {suggestions.length ? (
          suggestions.slice(0, 3).map(suggestion => (
            <View
              key={`${suggestion.title}-${suggestion.mediaAssetIds.join('-')}`}
              style={[
                styles.stationAgentLoopCard,
                {
                  borderColor: palette.border,
                  backgroundColor: palette.surface,
                },
              ]}
            >
              <View style={styles.stationAgentLoopCardHeader}>
                <View style={styles.stationAgentLoopStatusCopy}>
                  <Text
                    style={[
                      styles.stationAgentLoopTitle,
                      { color: palette.text },
                    ]}
                  >
                    {suggestion.title}
                  </Text>
                  <Text
                    style={[
                      styles.stationAgentLoopMeta,
                      { color: palette.secondaryText },
                    ]}
                  >
                    {textFor(
                      language,
                      `${suggestion.mediaAssetIds.length} 张照片`,
                      `${suggestion.mediaAssetIds.length} photos`,
                    )}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  disabled={Boolean(applyingTitle)}
                  onPress={() => applySuggestion(suggestion)}
                  style={[
                    styles.stationAgentLoopButton,
                    {
                      backgroundColor: applyingTitle
                        ? palette.soft
                        : palette.text,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.stationAgentLoopButtonText,
                      {
                        color: applyingTitle
                          ? palette.secondaryText
                          : palette.background,
                      },
                    ]}
                  >
                    {applyingTitle === suggestion.title
                      ? textFor(language, '整理中', 'Applying')
                      : textFor(language, '应用整理', 'Apply')}
                  </Text>
                </Pressable>
              </View>
              <Text
                style={[
                  styles.stationAgentLoopBody,
                  { color: palette.secondaryText },
                ]}
              >
                {suggestion.reason || suggestion.description}
              </Text>
              <View style={styles.stationAgentLoopChipRow}>
                {(suggestion.tags || []).slice(0, 5).map(tag => (
                  <Text
                    key={tag}
                    style={[
                      styles.stationAgentLoopChip,
                      { backgroundColor: palette.soft, color: palette.text },
                    ]}
                    numberOfLines={1}
                  >
                    {tag}
                  </Text>
                ))}
              </View>
            </View>
          ))
        ) : (
          <Text
            style={[styles.relationshipEmpty, { color: palette.secondaryText }]}
          >
            {textFor(
              language,
              '暂无素材。上传照片后，可以一键整理成相册分类。',
              'No media yet. Upload photos to organize them into albums.',
            )}
          </Text>
        )}
      </View>
    </StationModule>
  );
}

function AgentStatus({
  palette,
  language,
  title,
  configured,
  body,
}: {
  palette: Palette;
  language: Language;
  title: string;
  configured?: boolean;
  body: string;
}) {
  return (
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
          {title}
        </Text>
        <Text style={[styles.stationAgentLoopTitle, { color: palette.text }]}>
          {body}
        </Text>
      </View>
      <Text
        style={[
          styles.stationAgentLoopBadge,
          { backgroundColor: palette.surface, color: palette.text },
        ]}
      >
        {configured
          ? textFor(language, '可用', 'Ready')
          : textFor(language, '暂无素材', 'No media')}
      </Text>
    </View>
  );
}
