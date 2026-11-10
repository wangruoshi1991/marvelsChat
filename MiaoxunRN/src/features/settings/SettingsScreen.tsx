import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  Brain,
  ChevronDown,
  ChevronRight,
  Folder,
  Image as ImageIcon,
  LogOut,
  Trash2,
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
import { isXunPalette } from '../../shared/xunPalette';
import { SecondFloorPageScrollProps } from '../second-floor/secondFloorScroll';
import type {
  UIPreferencePreviewDTO,
  UIPreferences,
} from '../ui/uiPreferenceTypes';
import {
  describeUIPreferenceChanges,
  formatUIPreferenceValue,
} from '../ui/uiPreferenceDiff';

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
  onDeleteAccount,
  embedded = false,
  header,
  footer,
  scrollProps,
  scrollable = true,
  uiPreferences,
  onPreviewUIPreferences,
  onConfirmUIPreferences,
  onResetUIPreferences,
  onUndoUIPreferences,
}: {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  scrollProps?: SecondFloorPageScrollProps;
  scrollable?: boolean;
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
  onDeleteAccount: () => void;
  /**
   * Renders inside the second floor's `.xun-floor-panel` body: no large title,
   * no dismiss button — the floor owns those. The rows and fields are the same
   * component either way.
   */
  embedded?: boolean;
  uiPreferences?: UIPreferences;
  onPreviewUIPreferences?: (
    instruction: string,
  ) => Promise<UIPreferencePreviewDTO>;
  onConfirmUIPreferences?: (
    previewId: string,
    baseRevision: number,
  ) => Promise<unknown>;
  onResetUIPreferences?: (baseRevision: number) => Promise<unknown>;
  onUndoUIPreferences?: (baseRevision: number) => Promise<unknown>;
}) {
  const [uiInstruction, setUIInstruction] = React.useState('');
  const [uiPreview, setUIPreview] =
    React.useState<UIPreferencePreviewDTO | null>(null);
  const [uiBusy, setUIBusy] = React.useState(false);
  const [uiError, setUIError] = React.useState('');
  const uiActionInFlight = React.useRef(false);
  const runUIAction = async (
    action: () => Promise<void>,
    errorZh: string,
    errorEn: string,
  ) => {
    // State disables the controls after rendering; the ref also guards two
    // presses in the same frame and competing preference operations.
    if (uiActionInFlight.current) return;
    uiActionInFlight.current = true;
    setUIBusy(true);
    setUIError('');
    try {
      await action();
    } catch (error) {
      setUIError(
        error instanceof Error
          ? error.message
          : textFor(language, errorZh, errorEn),
      );
    } finally {
      uiActionInFlight.current = false;
      setUIBusy(false);
    }
  };
  const uiPreviewChanges =
    uiPreview && uiPreferences
      ? describeUIPreferenceChanges(uiPreferences, uiPreview)
      : [];
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

  const content = (
    <>
      {header}
      {uiPreferences && onPreviewUIPreferences ? (
        <SettingGroup
          palette={palette}
          title={textFor(language, 'AI 界面偏好', 'AI interface preferences')}
        >
          <Text style={[s.uiHint, { color: palette.secondaryText }]}>
            {textFor(
              language,
              '告诉 UI Agent 你想调整的按钮、布局或手势；先预览，确认后才会保存。',
              'Describe a button, layout, or gesture change. Preview first, then confirm to save.',
            )}
          </Text>
          <TextInput
            value={uiInstruction}
            onChangeText={setUIInstruction}
            editable={!uiBusy}
            placeholder={textFor(
              language,
              '例如：把妙页参与 Agent 按钮放到右上角',
              'For example: move the participating Agents button to the top right',
            )}
            placeholderTextColor={palette.secondaryText}
            multiline
            style={[
              s.uiInput,
              { color: palette.text, borderColor: palette.border },
            ]}
            accessibilityLabel={textFor(
              language,
              '界面调整描述',
              'Interface change description',
            )}
          />
          <Pressable
            disabled={uiBusy || !uiInstruction.trim()}
            accessibilityState={{
              disabled: uiBusy || !uiInstruction.trim(),
              busy: uiBusy,
            }}
            accessibilityRole="button"
            accessibilityLabel={textFor(language, '生成预览', 'Preview change')}
            onPress={() =>
              runUIAction(
                async () => {
                  setUIPreview(null);
                  setUIPreview(
                    await onPreviewUIPreferences(uiInstruction.trim()),
                  );
                },
                '预览失败',
                'Preview failed',
              )
            }
            style={[
              s.uiPrimaryButton,
              { backgroundColor: palette.mint },
              (uiBusy || !uiInstruction.trim()) && s.uiDisabled,
            ]}
          >
            <Text style={[s.uiPrimaryLabel, { color: palette.background }]}>
              {uiBusy
                ? textFor(language, '处理中…', 'Working…')
                : textFor(language, '生成预览', 'Preview change')}
            </Text>
          </Pressable>
          {uiError ? (
            <Text
              accessibilityRole="alert"
              style={[s.uiHint, { color: palette.rose }]}
            >
              {uiError}
            </Text>
          ) : null}
          {uiPreview ? (
            <View
              style={[
                s.uiPreviewCard,
                {
                  borderColor: palette.border,
                  backgroundColor: palette.surface,
                },
              ]}
            >
              <Text style={[styles.settingsRowTitle, { color: palette.text }]}>
                {uiPreview.intent}
              </Text>
              <Text style={[s.uiHint, { color: palette.secondaryText }]}>
                {uiPreview.rationale}
              </Text>
              <Text style={[s.uiHint, { color: palette.secondaryText }]}>
                {textFor(
                  language,
                  `影响页面：${
                    uiPreview.affectedSurfaces.join('、') || '当前页面'
                  }`,
                  `Affected surfaces: ${
                    uiPreview.affectedSurfaces.join(', ') || 'current page'
                  }`,
                )}
              </Text>
              <View
                accessibilityLabel={textFor(
                  language,
                  '界面调整前后对比',
                  'Interface change comparison',
                )}
                style={s.uiPreviewChanges}
              >
                <Text style={[s.uiChangeTitle, { color: palette.text }]}>
                  {textFor(language, '调整前后', 'Before and after')}
                </Text>
                {uiPreviewChanges.length ? (
                  uiPreviewChanges.map(change => (
                    <Text
                      key={`${change.path}:${String(change.after)}`}
                      style={[s.uiHint, { color: palette.secondaryText }]}
                    >
                      {`${change.path}: ${formatUIPreferenceValue(
                        change.before,
                      )} → ${formatUIPreferenceValue(change.after)}`}
                    </Text>
                  ))
                ) : (
                  <Text style={[s.uiHint, { color: palette.secondaryText }]}>
                    {textFor(
                      language,
                      '没有检测到可应用的变化。',
                      'No applicable changes were detected.',
                    )}
                  </Text>
                )}
              </View>
              <View style={s.uiPreviewActions}>
                {onConfirmUIPreferences && uiPreviewChanges.length > 0 ? (
                  <Pressable
                    disabled={uiBusy}
                    accessibilityState={{ disabled: uiBusy, busy: uiBusy }}
                    accessibilityRole="button"
                    accessibilityLabel={textFor(language, '应用调整', 'Apply')}
                    onPress={() =>
                      runUIAction(
                        async () => {
                          await onConfirmUIPreferences(
                            uiPreview.id,
                            uiPreview.baseRevision,
                          );
                          setUIPreview(null);
                          setUIInstruction('');
                        },
                        '应用失败',
                        'Apply failed',
                      )
                    }
                    style={[
                      s.uiPrimaryButton,
                      { backgroundColor: palette.mint },
                      uiBusy && s.uiDisabled,
                    ]}
                  >
                    <Text
                      style={[s.uiPrimaryLabel, { color: palette.background }]}
                    >
                      {textFor(language, '应用调整', 'Apply')}
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  disabled={uiBusy}
                  accessibilityState={{ disabled: uiBusy, busy: uiBusy }}
                  accessibilityRole="button"
                  onPress={() => setUIPreview(null)}
                  style={[
                    s.uiSecondaryButton,
                    { borderColor: palette.border },
                    uiBusy && s.uiDisabled,
                  ]}
                >
                  <Text style={[s.uiSecondaryLabel, { color: palette.text }]}>
                    {textFor(language, '撤销预览', 'Discard preview')}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}
          {onResetUIPreferences ? (
            <Pressable
              disabled={uiBusy}
              accessibilityState={{ disabled: uiBusy, busy: uiBusy }}
              accessibilityRole="button"
              accessibilityLabel={textFor(
                language,
                '恢复界面默认设置',
                'Restore interface defaults',
              )}
              onPress={() =>
                runUIAction(
                  async () => {
                    await onResetUIPreferences(uiPreferences.revision);
                    setUIPreview(null);
                  },
                  '恢复默认失败',
                  'Reset failed',
                )
              }
              style={uiBusy && s.uiDisabled}
            >
              <Text style={[s.uiHint, { color: palette.mint }]}>
                {textFor(
                  language,
                  '恢复界面默认设置',
                  'Restore interface defaults',
                )}
              </Text>
            </Pressable>
          ) : null}
          {onUndoUIPreferences ? (
            <Pressable
              disabled={uiBusy}
              accessibilityState={{ disabled: uiBusy, busy: uiBusy }}
              accessibilityRole="button"
              accessibilityLabel={textFor(
                language,
                '撤销上一次已应用调整',
                'Undo last applied change',
              )}
              onPress={() =>
                runUIAction(
                  async () => {
                    await onUndoUIPreferences(uiPreferences.revision);
                    setUIPreview(null);
                  },
                  '撤销调整失败',
                  'Undo failed',
                )
              }
              style={uiBusy && s.uiDisabled}
            >
              <Text style={[s.uiHint, { color: palette.mint }]}>
                {textFor(
                  language,
                  '撤销上一次已应用调整',
                  'Undo last applied change',
                )}
              </Text>
            </Pressable>
          ) : null}
        </SettingGroup>
      ) : null}
      {embedded ? null : (
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
      )}

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
          title={textFor(
            language,
            '展示职业资料与简介',
            'Show professional profile and bio',
          )}
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
        <Pressable
          accessibilityRole="button"
          onPress={onDeleteAccount}
          style={[styles.logoutRow, { backgroundColor: palette.soft }]}
        >
          <View
            style={[
              styles.logoutIconBox,
              { backgroundColor: `${palette.rose}1f` },
            ]}
          >
            <Trash2 color={palette.rose} size={17} strokeWidth={2.6} />
          </View>
          <View style={styles.logoutCopy}>
            <Text style={[styles.logoutTitle, { color: palette.rose }]}>
              {textFor(language, '注销账号', 'Delete account')}
            </Text>
            <Text style={[styles.logoutHint, { color: palette.secondaryText }]}>
              {textFor(
                language,
                '永久删除账号及相关数据。',
                'Permanently delete the account and related data.',
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
      {footer}
    </>
  );

  const contentStyle = [
    styles.settingsContent,
    embedded && styles.settingsContentEmbedded,
    embedded && isXunPalette(palette) && s.floorContent,
    embedded && scrollable && s.floorContentGrow,
  ];
  if (!scrollable) return <View style={contentStyle}>{content}</View>;
  return (
    <ScrollView
      {...scrollProps}
      scrollEnabled
      style={[
        embedded && s.floorScroll,
        !embedded && { backgroundColor: palette.background },
      ]}
      contentContainerStyle={contentStyle}
    >
      {content}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  // A nested ScrollView must stay constrained by the floor panel's viewport.
  // Without an explicit zero basis, iOS can lay the embedded settings list at
  // its content height, leaving no native scroll range and making the floor
  // return gesture see every swipe as a bottom release.
  floorScroll: { flex: 1, flexBasis: 0, minHeight: 0 },
  floorContentGrow: { flexGrow: 1 },
  floorContent: {
    paddingTop: 8,
    paddingHorizontal: 17,
    paddingBottom: 24,
    gap: 12,
  },
  uiHint: { fontSize: 12, lineHeight: 18 },
  uiInput: {
    minHeight: 68,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    textAlignVertical: 'top',
    marginTop: 8,
  },
  uiPrimaryButton: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  uiPrimaryLabel: { fontSize: 13, fontWeight: '700' },
  uiDisabled: { opacity: 0.5 },
  uiSecondaryButton: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  uiSecondaryLabel: { fontSize: 13, fontWeight: '600' },
  uiPreviewCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
    gap: 6,
  },
  uiPreviewChanges: {
    borderTopWidth: 1,
    borderTopColor: '#0000001a',
    paddingTop: 8,
    gap: 3,
  },
  uiChangeTitle: { fontSize: 12, fontWeight: '700' },
  uiPreviewActions: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
});
