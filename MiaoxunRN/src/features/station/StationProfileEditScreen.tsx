import React, { useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import { Language, useMiaoxunSession } from '../session/useMiaoxunSession';
import { normalizeAvatarConfig } from '../avatar/avatarConfig';
import { UserAvatar } from '../avatar/AvatarBadges';
import { resolveStationColors } from './stationTheme';
import { StationProfileField as Field } from './StationProfileField';
import { StationProfileIdentityFields } from './StationProfileIdentityFields';
import { StationProfileLocationFields } from './StationProfileLocationFields';
import { StationProfileSection } from './StationProfileSection';
import { StationProfileEditorHeader } from './StationProfileEditorHeader';
import { profileIdentityTags } from './stationProfileIdentity';
import { profileEditStyles as styles } from './stationProfileEditStyles';

type Session = ReturnType<typeof useMiaoxunSession>;

export function StationProfileEditScreen({
  palette,
  language,
  profile,
  onBack,
  onUpdateProfile,
  onResolveLocation,
  onActionError,
}: {
  palette: Palette;
  language: Language;
  profile: Session['profile'];
  onBack: () => void;
  onUpdateProfile: Session['updateProfile'];
  onResolveLocation: Session['resolveLocation'];
  onActionError: (message: string) => void;
}) {
  const colors = resolveStationColors(palette);
  const [nickname, setNickname] = useState(profile.nickname);
  const [bio, setBio] = useState(profile.bio);
  const [headline, setHeadline] = useState(profile.headline);
  const [publicLocation, setPublicLocation] = useState(profile.publicLocation);
  const [community, setCommunity] = useState(profile.community);
  const [activityArea, setActivityArea] = useState(profile.activityArea);
  const [experienceYears, setExperienceYears] = useState(
    profile.experienceYears === null ? '' : String(profile.experienceYears),
  );
  const [languages, setLanguages] = useState(profile.languages);
  const [saveError, setSaveError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const saving = useRef(false);
  const locating = useRef(false);
  const years = experienceYears.trim();
  const hasChanges =
    nickname.trim() !== profile.nickname ||
    bio.trim() !== profile.bio ||
    headline.trim() !== profile.headline ||
    publicLocation !== profile.publicLocation ||
    community !== profile.community ||
    activityArea !== profile.activityArea ||
    years !==
      (profile.experienceYears === null
        ? ''
        : String(profile.experienceYears)) ||
    languages.join(',') !== profile.languages.join(',');

  const back = () => {
    if (saving.current || locating.current) return;
    if (!hasChanges) {
      onBack();
      return;
    }
    Alert.alert(
      textFor(language, '放弃修改？', 'Discard changes?'),
      textFor(
        language,
        '未保存的资料将不会更新。',
        'Your unsaved changes will be lost.',
      ),
      [
        {
          text: textFor(language, '继续编辑', 'Keep editing'),
          style: 'cancel',
        },
        {
          text: textFor(language, '放弃修改', 'Discard'),
          style: 'destructive',
          onPress: onBack,
        },
      ],
    );
  };

  const save = async () => {
    if (saving.current || locating.current) return;
    setSaveError('');
    if (!nickname.trim()) {
      setSaveError(textFor(language, '请填写昵称', 'Enter your name'));
      return;
    }
    if (years && (!/^\d{1,2}$/.test(years) || Number(years) > 80)) {
      setSaveError(
        textFor(
          language,
          '经验年限请填写 0–80 的整数，或留空。',
          'Enter a whole number from 0 to 80, or leave experience blank.',
        ),
      );
      return;
    }
    saving.current = true;
    setIsSaving(true);
    try {
      await onUpdateProfile({
        nickname: nickname.trim(),
        avatarText: profile.avatarText,
        bio: bio.trim(),
        headline: headline.trim(),
        publicLocation: publicLocation.trim(),
        experienceYears: years === '' ? null : Number(years),
        languages,
        community,
        activityArea,
        avatarConfig: normalizeAvatarConfig(profile.avatarConfig),
      });
      onActionError(
        textFor(language, '小站资料已更新', 'Station profile updated'),
      );
      onBack();
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : textFor(language, '资料保存失败', 'Profile save failed'),
      );
    } finally {
      saving.current = false;
      setIsSaving(false);
    }
  };
  const professionalSummary = [
    headline,
    ...profileIdentityTags(
      {
        publicLocation: '',
        headline,
        experienceYears:
          years && /^\d{1,2}$/.test(years) ? Number(years) : null,
        languages,
      },
      language,
    ),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.screen, { backgroundColor: colors.background }]}
    >
      <StationProfileEditorHeader
        palette={palette}
        language={language}
        isSaving={isSaving}
        isLocating={isLocating}
        error={saveError}
        onBack={back}
        onSave={save}
      />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <View style={styles.intro}>
          <UserAvatar
            text={profile.avatarText}
            config={profile.avatarConfig}
            palette={palette}
            size={60}
          />
          <View style={styles.introCopy}>
            <Text style={[styles.introTitle, { color: colors.text }]}>
              {textFor(language, '让大家认识你', 'Introduce yourself')}
            </Text>
            <Text style={[styles.helper, { color: colors.secondaryText }]}>
              {textFor(
                language,
                '一句签名，也可以是你的第一面',
                'A short bio is a good place to start',
              )}
            </Text>
          </View>
        </View>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Field
            label={textFor(language, '昵称', 'Name')}
            value={nickname}
            maxLength={80}
            palette={palette}
            onChangeText={setNickname}
            disabled={isSaving}
          />
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Field
            label={textFor(language, '签名 / 个人简介', 'Signature / bio')}
            value={bio}
            maxLength={500}
            multiline
            palette={palette}
            onChangeText={setBio}
            disabled={isSaving}
            placeholder={textFor(
              language,
              '写一点你想分享的自己…',
              'Share a little about yourself…',
            )}
          />
          <Text style={[styles.counter, { color: colors.secondaryText }]}>
            {bio.length}/500
          </Text>
        </View>
        <StationProfileLocationFields
          palette={palette}
          language={language}
          disabled={isSaving}
          publicLocation={publicLocation}
          community={community}
          activityArea={activityArea}
          onLocationChange={setPublicLocation}
          onCommunityChange={setCommunity}
          onActivityAreaChange={setActivityArea}
          onResolveLocation={onResolveLocation}
          onResolvingChange={value => {
            locating.current = value;
            setIsLocating(value);
          }}
        />
        <StationProfileSection
          title={textFor(language, '职业资料', 'Professional details')}
          summary={
            professionalSummary ||
            textFor(
              language,
              '选填 · 职业、经验与沟通语言',
              'Optional · Headline, experience and languages',
            )
          }
          palette={palette}
          disabled={isSaving}
        >
          <StationProfileIdentityFields
            palette={palette}
            language={language}
            disabled={isSaving}
            headline={headline}
            experienceYears={experienceYears}
            languages={languages}
            onHeadlineChange={setHeadline}
            onExperienceChange={setExperienceYears}
            onLanguagesChange={setLanguages}
          />
        </StationProfileSection>
        <Text style={[styles.privacy, { color: colors.secondaryText }]}>
          {textFor(
            language,
            '签名、展示地区与职业资料的可见性，可在设置中调整。',
            'Manage visibility for your bio, display region and professional details in Settings.',
          )}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
