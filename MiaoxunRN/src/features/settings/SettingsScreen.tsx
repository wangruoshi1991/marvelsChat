import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import {
  Brain,
  ChevronDown,
  ChevronRight,
  Folder,
  Image as ImageIcon,
  LogOut,
} from 'lucide-react-native';

import { Language } from '../session/useMiaoxunSession';
import { ProfileVisibilityDTO } from '../../models/api';
import { textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Appearance, Palette } from '../../shared/theme';
import {
  SettingGroup,
  SettingsRow,
  SettingsSegmentRow,
  SettingsSwitchRow,
} from '../../shared/settingsUi';
import { SegmentedControl } from '../../shared/ui';

export function SettingsScreen({
  palette,
  userName,
  userRole,
  language,
  appearance,
  profileVisibility,
  onBack,
  onSetLanguage,
  onSetAppearance,
  onUpdateProfileVisibility,
  onActionError,
  onSignOut,
}: {
  palette: Palette;
  userName: string;
  userRole: string;
  language: Language;
  appearance: Appearance;
  profileVisibility: ProfileVisibilityDTO;
  onBack: () => void;
  onSetLanguage: (language: Language) => void;
  onSetAppearance: (appearance: Appearance) => void;
  onUpdateProfileVisibility: (
    visibility: Partial<ProfileVisibilityDTO>,
  ) => Promise<ProfileVisibilityDTO>;
  onActionError: (message: string) => void;
  onSignOut: () => Promise<void>;
}) {
  const updateVisibility = (
    key: keyof ProfileVisibilityDTO,
    value: boolean,
  ) => {
    onUpdateProfileVisibility({ [key]: value }).catch(error => {
      onActionError(
        error instanceof Error
          ? error.message
          : textFor(language, '设置同步失败', 'Setting sync failed'),
      );
    });
  };

  return (
    <ScrollView
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={styles.settingsContent}
    >
      <View style={styles.settingsHeader}>
        <Pressable
          accessibilityLabel="返回"
          onPress={onBack}
          style={[
            styles.settingsDismissButton,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
        >
          <ChevronDown color={palette.mint} size={22} strokeWidth={3} />
        </Pressable>
        <Text style={[styles.settingsLargeTitle, { color: palette.text }]}>
          {textFor(language, '设置', 'Settings')}
        </Text>
      </View>

      <View
        style={[
          styles.settingsAccountCard,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ]}
      >
        <View style={styles.settingsAccountCopy}>
          <Text style={[styles.settingsAccountName, { color: palette.text }]}>
            {userName}
          </Text>
          <Text
            style={[
              styles.settingsAccountRole,
              { color: palette.secondaryText },
            ]}
          >
            {userRole === 'admin'
              ? textFor(language, '管理员', 'Admin')
              : textFor(language, '普通用户', 'User')}
          </Text>
        </View>
      </View>

      <SettingGroup
        title={textFor(language, '显示', 'Display')}
        palette={palette}
      >
        <SettingsSegmentRow
          title={textFor(language, '小站视觉', 'Station style')}
          palette={palette}
        >
          <SegmentedControl
            palette={palette}
            value={appearance}
            options={[
              { label: textFor(language, '浅色', 'Light'), value: 'light' },
              { label: textFor(language, '深色', 'Dark'), value: 'dark' },
            ]}
            onChange={onSetAppearance}
          />
        </SettingsSegmentRow>
        <SettingsSegmentRow
          title={textFor(language, '语言', 'Language')}
          palette={palette}
        >
          <SegmentedControl
            palette={palette}
            value={language}
            options={[
              { label: '中文', value: 'zh' },
              { label: 'English', value: 'en' },
            ]}
            onChange={onSetLanguage}
          />
        </SettingsSegmentRow>
      </SettingGroup>

      <SettingGroup
        title={textFor(language, '主页展示', 'Profile Visibility')}
        palette={palette}
      >
        <SettingsSwitchRow
          title={textFor(language, '展示简介', 'Show bio')}
          value={profileVisibility.showBio}
          palette={palette}
          onChange={value => updateVisibility('showBio', value)}
        />
        <SettingsSwitchRow
          title={textFor(language, '展示 AI ID', 'Show AI ID')}
          value={profileVisibility.showAiId}
          palette={palette}
          onChange={value => updateVisibility('showAiId', value)}
        />
        <SettingsSwitchRow
          title={textFor(language, '展示关注/粉丝/收藏数', 'Show counts')}
          value={profileVisibility.showCounts}
          palette={palette}
          onChange={value => updateVisibility('showCounts', value)}
        />
        <SettingsSwitchRow
          title={textFor(
            language,
            '允许别人查看我的关注',
            'Show following list',
          )}
          value={profileVisibility.showFollowingList}
          palette={palette}
          onChange={value => updateVisibility('showFollowingList', value)}
        />
        <SettingsSwitchRow
          title={textFor(
            language,
            '允许别人查看我的粉丝',
            'Show followers list',
          )}
          value={profileVisibility.showFollowersList}
          palette={palette}
          onChange={value => updateVisibility('showFollowersList', value)}
        />
        <SettingsSwitchRow
          title={textFor(language, '展示社区', 'Show community')}
          value={profileVisibility.showCommunity}
          palette={palette}
          onChange={value => updateVisibility('showCommunity', value)}
        />
        <SettingsSwitchRow
          title={textFor(language, '展示活动区域', 'Show activity area')}
          value={profileVisibility.showActivityArea}
          palette={palette}
          onChange={value => updateVisibility('showActivityArea', value)}
        />
      </SettingGroup>

      <SettingGroup
        title={textFor(language, '通知', 'Notifications')}
        palette={palette}
      >
        <SettingsRow
          title={textFor(
            language,
            '允许妙讯通知',
            'Allow Miaoxun notifications',
          )}
          value={textFor(language, '开启', 'On')}
          palette={palette}
        />
        <Text style={[styles.settingHint, { color: palette.secondaryText }]}>
          {textFor(
            language,
            'iOS 推送后续通过 APNs 和 UserNotifications 接入。',
            'iOS push will be connected through APNs and UserNotifications.',
          )}
        </Text>
      </SettingGroup>

      <SettingGroup
        title={textFor(language, '空间与权限', 'Space & Permissions')}
        palette={palette}
      >
        <SettingsRow
          title={textFor(language, '相册素材', 'Album assets')}
          value={textFor(language, '待授权', 'Pending')}
          palette={palette}
          icon={ImageIcon}
        />
        <SettingsRow
          title={textFor(language, '文件访问', 'File access')}
          value={textFor(language, '待接入', 'Pending')}
          palette={palette}
          icon={Folder}
        />
        <SettingsRow
          title={textFor(language, '长期记忆', 'Long-term memory')}
          value={textFor(language, '需确认', 'Confirm')}
          palette={palette}
          icon={Brain}
        />
      </SettingGroup>

      <SettingGroup
        title={textFor(language, '账户', 'Account')}
        palette={palette}
      >
        <Pressable
          onPress={onSignOut}
          style={[styles.logoutRow, { backgroundColor: palette.soft }]}
        >
          <View
            style={[
              styles.logoutIconBox,
              { backgroundColor: `${palette.rose}1f` },
            ]}
          >
            <LogOut color={palette.rose} size={17} strokeWidth={2.6} />
          </View>
          <View style={styles.logoutCopy}>
            <Text style={[styles.logoutTitle, { color: palette.rose }]}>
              {textFor(language, '退出登录', 'Log out')}
            </Text>
            <Text style={[styles.logoutHint, { color: palette.secondaryText }]}>
              {textFor(
                language,
                '退出会撤销服务端会话并清除本机登录态。',
                'This revokes the server session and clears this device.',
              )}
            </Text>
          </View>
          <ChevronRight
            color={palette.secondaryText}
            size={17}
            strokeWidth={2.6}
          />
        </Pressable>
      </SettingGroup>
    </ScrollView>
  );
}
