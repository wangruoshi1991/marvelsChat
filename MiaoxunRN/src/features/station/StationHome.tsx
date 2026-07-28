import React from 'react';
import { View } from 'react-native';

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
  CallableAgentList,
  DiaryComicGrid,
  EmptyModuleState,
  StationModule,
} from './StationHomeModules';
import { StationCreateKind, StationTab } from './stationTypes';
import { Avatar3DLoadState } from './useAvatar3d';

type StationHomeProps = {
  palette: Palette;
  language: Language;
  token: string;
  profile: ReturnType<typeof useMiaoxunSession>['profile'];
  stationContent: StationContentDTO;
  avatar3d: Avatar3DBootstrapDTO | null;
  avatar3dStatus: Avatar3DLoadState;
  avatar3dError: string;
  agents: AgentDTO[];
  ownedAgents: OwnedAgentDTO[];
  moduleStatus: (key: string) => string;
  onOpenAvatar3d: () => void;
  onSelectStationTab: (tab: StationTab) => void;
  onOpenCreateSheet: (kind: StationCreateKind) => void;
  onOpenDiaryDetail: (entryId: string) => void;
  onOpenAlbumDetail: (albumId: string) => void;
  onOpenAgentThread: (agentId: string) => void;
  onActionMessage: (message: string) => void;
};

export function StationHome({
  palette,
  language,
  token,
  profile,
  stationContent,
  avatar3d,
  avatar3dStatus,
  avatar3dError,
  agents,
  ownedAgents,
  moduleStatus,
  onOpenAvatar3d,
  onSelectStationTab,
  onOpenCreateSheet,
  onOpenDiaryDetail,
  onOpenAlbumDetail,
  onOpenAgentThread,
  onActionMessage,
}: StationHomeProps) {
  const openDiaryFlow = () => onOpenCreateSheet('diary');
  const openAlbumFlow = () => onOpenCreateSheet('album');
  const openMusicFlow = () =>
    onActionMessage(
      textFor(
        language,
        '音乐菜单需要先接入音乐来源、版权和播放能力。',
        'Music menu needs sources, rights, and playback first.',
      ),
  );
  const openAgentFlow = () => onSelectStationTab('agents');
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
        onAction={openDiaryFlow}
      >
        <DiaryComicGrid
          palette={palette}
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
        onAction={openAlbumFlow}
      >
        <AlbumGrid
          palette={palette}
          language={language}
          albums={stationContent.albums}
          mediaAssets={stationContent.mediaAssets}
          token={token}
          onOpenAlbum={onOpenAlbumDetail}
        />
      </StationModule>
    ),
    music: (
      <StationModule
        key="music"
        palette={palette}
        title={textFor(language, '喜欢的音乐菜单', 'Music Menu')}
        action={textFor(language, '添加', 'Add')}
        onAction={openMusicFlow}
      >
        <EmptyModuleState
          palette={palette}
          title={textFor(language, '暂无音乐菜单', 'No Music Menu Yet')}
          body={textFor(
            language,
            '接入音乐来源和版权策略后，这里展示真实歌单。',
            'Real playlists appear here after music sources and rights are connected.',
          )}
          meta={moduleStatus('music')}
        />
      </StationModule>
    ),
    agents: (
      <StationModule
        key="agents"
        palette={palette}
        title={textFor(language, '可调用能力 Agent', 'Callable Agents')}
        action={textFor(language, '添加', 'Add')}
        onAction={openAgentFlow}
      >
        <CallableAgentList
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
      <StationAvatarSpace
        palette={palette}
        language={language}
        token={token}
        avatar3d={avatar3d}
        avatar3dStatus={avatar3dStatus}
        avatar3dError={avatar3dError}
        onOpenGenerator={onOpenAvatar3d}
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
  const defaults = [
    'diary',
    'gallery',
    'music',
    'agents',
  ];
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
