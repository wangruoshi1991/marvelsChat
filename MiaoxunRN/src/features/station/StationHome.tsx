import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Search } from 'lucide-react-native';

import {
  AgentDTO,
  Avatar3DBootstrapDTO,
  OwnedAgentDTO,
  StationContentDTO,
  StationSiteSectionDTO,
} from '../../models/api';
import { textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { Language, useMiaoxunSession } from '../session/useMiaoxunSession';
import { StationAvatarSpace } from './StationAvatarSpace';
import {
  AlbumGrid,
  AIPartnerGrid,
  DiaryComicGrid,
  StationModule,
} from './StationHomeModules';
import type {
  StationContentListKind,
  StationCreateKind,
  StationTab,
} from './stationTypes';
import { StationPageHeading } from './StationPageHeading';
import { Avatar3DLoadState } from './useAvatar3d';

type StationHomeProps = {
  active: boolean;
  palette: Palette;
  language: Language;
  token: string;
  profile: ReturnType<typeof useMiaoxunSession>['profile'];
  stationContent: StationContentDTO;
  avatar3d: Avatar3DBootstrapDTO | null;
  avatar3dStatus: Avatar3DLoadState;
  avatar3dError: string;
  selectedAvatar3dModelId: string | null;
  agents: AgentDTO[];
  ownedAgents: OwnedAgentDTO[];
  onOpenAvatar3d: () => void;
  onSelectStationTab: (tab: StationTab) => void;
  onOpenCreateSheet: (kind: StationCreateKind) => void;
  onOpenDiaryDetail: (entryId: string) => void;
  onOpenAlbumDetail: (albumId: string) => void;
  onOpenAgentThread: (agentId: string) => void;
  onOpenContentList: (kind: StationContentListKind) => void;
  onOpenMediaRetrieval?: () => void;
  onActionMessage: (message: string) => void;
};

export function StationHome({
  active,
  palette,
  language,
  token,
  profile,
  stationContent,
  avatar3d,
  avatar3dStatus,
  avatar3dError,
  selectedAvatar3dModelId,
  agents,
  ownedAgents,
  onOpenAvatar3d,
  onSelectStationTab,
  onOpenCreateSheet,
  onOpenDiaryDetail,
  onOpenAlbumDetail,
  onOpenAgentThread,
  onOpenContentList,
  onOpenMediaRetrieval,
  onActionMessage,
}: StationHomeProps) {
  const openDiaryFlow = () => onOpenCreateSheet('diary');
  const openAlbumFlow = () => onOpenCreateSheet('album');
  const openAgentFlow = () => onSelectStationTab('agents');
  const hasEnabledAgent = (agentId: string) =>
    ownedAgents.some(agent => agent.id === agentId && agent.enabled);
  const openModuleAgent = (agentId: string) => {
    if (hasEnabledAgent(agentId)) {
      onOpenAgentThread(agentId);
      return;
    }
    openAgentFlow();
  };
  const openCallableFlow = () => {
    onActionMessage(
      textFor(
        language,
        '可被调用需要先添加 Agent；公开调用范围会单独配置权限、频率和记录。',
        'Callable access starts with added agents; public scope needs permissions, limits, and logs.',
      ),
    );
    onSelectStationTab('agents');
  };
  const orderedModuleKeys = orderedStationModuleKeys(
    profile.stationConfig.siteLayout?.sections,
  );
  const moduleViews: Record<string, React.ReactNode> = {
    diary: (
      <StationModule
        key="diary"
        palette={palette}
        title={textFor(language, '个人日记', 'Personal Diary')}
        action={textFor(language, '添加', 'Add')}
        agentAction={textFor(language, '漫画日记 Agent', 'Comic Diary Agent')}
        agentAvailable={hasEnabledAgent('comic-diary')}
        onAgentAction={() => openModuleAgent('comic-diary')}
        onMore={() => onOpenContentList('diary')}
        moreLabel={textFor(language, '更多日记', 'More diaries')}
        onAction={openDiaryFlow}
      >
        <DiaryComicGrid
          palette={palette}
          language={language}
          entries={stationContent.diaryEntries}
          onOpenEntry={onOpenDiaryDetail}
        />
      </StationModule>
    ),
    gallery: (
      <StationModule
        key="gallery"
        palette={palette}
        title={textFor(language, '个人相册', 'Albums')}
        action={textFor(language, '添加', 'Add')}
        agentAction={textFor(language, '相册管理 Agent', 'Album Manager Agent')}
        agentAvailable={hasEnabledAgent('album-manager')}
        onAgentAction={() => openModuleAgent('album-manager')}
        onMore={() => onOpenContentList('album')}
        moreLabel={textFor(language, '更多相册', 'More albums')}
        onAction={openAlbumFlow}
      >
        <View style={styles.stationModuleStack}>
          {onOpenMediaRetrieval ? (
            <Pressable
              accessibilityLabel={textFor(language, '找素材', 'Find media')}
              accessibilityRole="button"
              onPress={onOpenMediaRetrieval}
              style={[
                styles.stationContentFilters,
                mediaRetrievalShortcutStyles.button,
                {
                  backgroundColor: palette.soft,
                },
              ]}
              testID="station-home-find-media"
            >
              <Search color={palette.text} size={18} />
              <Text
                style={[
                  mediaRetrievalShortcutStyles.title,
                  { color: palette.text },
                ]}
              >
                {textFor(language, '找素材', 'Find media')}
              </Text>
              <Text
                numberOfLines={1}
                style={[
                  mediaRetrievalShortcutStyles.hint,
                  { color: palette.secondaryText },
                ]}
              >
                {textFor(
                  language,
                  '描述你想找的图片或视频',
                  'Describe an image or video',
                )}
              </Text>
            </Pressable>
          ) : null}
          <AlbumGrid
            palette={palette}
            language={language}
            albums={stationContent.albums}
            mediaAssets={stationContent.mediaAssets}
            token={token}
            onOpenAlbum={onOpenAlbumDetail}
          />
        </View>
      </StationModule>
    ),
    agents: (
      <StationModule
        key="agents"
        palette={palette}
        title={textFor(language, 'AI伙伴', 'AI Partners')}
        onMore={openAgentFlow}
        moreLabel={textFor(language, '管理AI伙伴', 'Manage AI partners')}
      >
        <AIPartnerGrid
          palette={palette}
          language={language}
          agents={agents}
          ownedAgents={ownedAgents}
          onOpenAgentThread={onOpenAgentThread}
        />
      </StationModule>
    ),
  };

  return (
    <View style={styles.stationPanelStack}>
      <StationPageHeading
        detail={textFor(language, '个人形象记录', 'Personal archive')}
        palette={palette}
        title={textFor(language, '形象档案', 'Visual Archive')}
        watermark="VISUAL ARCHIVE"
      />
      <StationAvatarSpace
        active={active}
        palette={palette}
        language={language}
        token={token}
        avatar3d={avatar3d}
        avatar3dStatus={avatar3dStatus}
        avatar3dError={avatar3dError}
        selectedModelId={selectedAvatar3dModelId}
        onOpenGenerator={onOpenAvatar3d}
        onOpenCoreAgent={() => onOpenAgentThread('model-3d')}
        onOpenOotd={() => onOpenCreateSheet('outfit')}
        onOpenDiary={openDiaryFlow}
        onOpenAgents={openAgentFlow}
        onOpenCallable={openCallableFlow}
      />

      {orderedModuleKeys.map(key => moduleViews[key])}
    </View>
  );
}

function orderedStationModuleKeys(sections?: StationSiteSectionDTO[]) {
  const defaults = ['diary', 'gallery', 'agents'];
  const sectionMap: Record<string, string> = {
    diary: 'diary',
    gallery: 'gallery',
    contact: 'agents',
  };
  const mapped = normalizeSections(sections)
    .map(section => sectionMap[String(section.type || '')])
    .filter(Boolean);
  return Array.from(new Set([...mapped, ...defaults]));
}

function normalizeSections(sections?: StationSiteSectionDTO[]) {
  return Array.isArray(sections) ? sections : [];
}

const mediaRetrievalShortcutStyles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: 4,
    minHeight: 42,
    paddingHorizontal: 12,
  },
  title: { fontWeight: '700' },
  hint: { flex: 1, fontSize: 12 },
});
