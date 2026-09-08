import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  ChevronRight,
  ImagePlus,
  LockKeyhole,
  Users,
  Globe2,
  X,
} from 'lucide-react-native';

import { StationVisibility } from '../../models/api';
import {
  PickedStationMedia,
  pickStationImagesFromLibrary,
} from '../../services/stationMediaPicker';
import { textFor } from '../../shared/i18n';
import {
  SettingGroup,
  SettingsActionButton,
  SettingsSegmentRow,
} from '../../shared/settingsUi';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { SegmentedControl, SheetHeader } from '../../shared/ui';
import { Language } from '../session/useMiaoxunSession';
import { StationContentEditorHeader } from './StationContentEditorUi';
import { StationCreateKind } from './stationTypes';

type StationCreatePayload =
  | {
      kind: 'diary';
      title: string;
      body: string;
      mood: string;
      visibility: StationVisibility;
    }
  | {
      kind: 'album';
      title: string;
      description: string;
      visibility: StationVisibility;
      media: PickedStationMedia[];
    }
  | {
      kind: 'outfit';
      title: string;
      note: string;
      visibility: StationVisibility;
    };

type StationCreateSheetProps = {
  kind: StationCreateKind;
  palette: Palette;
  language: Language;
  isSaving: boolean;
  fullScreen?: boolean;
  progressText?: string;
  onBack: () => void;
  onSubmit: (payload: StationCreatePayload) => void;
  onActionError?: (error: unknown) => void;
};

const visibilityOptions = (language: Language) => [
  { label: textFor(language, '仅自己', 'Private'), value: 'private' as const },
  { label: textFor(language, '好友', 'Friends'), value: 'friends' as const },
  { label: textFor(language, '公开', 'Public'), value: 'public' as const },
];

const initialTitle = (kind: StationCreateKind, language: Language) => {
  if (kind === 'diary') {
    return textFor(language, '今天的漫画日记', "Today's comic diary");
  }
  if (kind === 'album') {
    return '';
  }
  return textFor(language, '今日穿搭', "Today's outfit");
};

const contentTitleFromText = (
  kind: StationCreateKind,
  text: string,
  language: Language,
) => {
  const date = new Date();
  const dateText = `${date.getMonth() + 1}/${date.getDate()}`;
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (kind === 'diary' && trimmed) {
    return trimmed.length > 18 ? `${trimmed.slice(0, 18)}...` : trimmed;
  }
  if (kind === 'diary') {
    return textFor(language, `${dateText} 的日记`, `${dateText} diary`);
  }
  if (kind === 'outfit') {
    return textFor(language, `${dateText} 今日穿搭`, `${dateText} OOTD`);
  }
  return initialTitle(kind, language);
};

const sheetTitle = (kind: StationCreateKind, language: Language) => {
  if (kind === 'diary') {
    return textFor(language, '写日记', 'New Diary');
  }
  if (kind === 'album') {
    return textFor(language, '建相册', 'New Album');
  }
  return textFor(language, '保存穿搭', 'Save Outfit');
};

export function StationCreateSheet({
  kind,
  palette,
  language,
  isSaving,
  fullScreen = false,
  progressText = '',
  onBack,
  onSubmit,
  onActionError,
}: StationCreateSheetProps) {
  const [title, setTitle] = useState(initialTitle(kind, language));
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<StationVisibility>('private');
  const [albumMedia, setAlbumMedia] = useState<PickedStationMedia[]>([]);

  useEffect(() => {
    setTitle(initialTitle(kind, language));
    setBody('');
    setVisibility('private');
    setAlbumMedia([]);
  }, [kind, language]);

  const bodyLabel = useMemo(() => {
    if (kind === 'diary') {
      return textFor(language, '今天想记录什么', 'What happened today');
    }
    if (kind === 'album') {
      return textFor(language, '相册名称', 'Album name');
    }
    return textFor(language, '这一身想表达什么', 'What this outfit says');
  }, [kind, language]);

  const bodyPlaceholder = useMemo(() => {
    if (kind === 'diary') {
      return textFor(
        language,
        '写一段就好。系统会自动生成标题，后续可由 AI 伙伴整理成漫画日记。',
        'Write one paragraph. The app will title it automatically.',
      );
    }
    if (kind === 'album') {
      return textFor(
        language,
        '例如：生活、穿搭、旅行、朋友',
        'Life, outfits, travel, friends',
      );
    }
    return textFor(
      language,
      '可以只写一句，也可以直接保存当前形象。',
      'One sentence is enough, or save the current look as-is.',
    );
  }, [kind, language]);

  const canSubmit =
    kind === 'diary'
      ? body.trim().length > 0
      : kind === 'album'
      ? title.trim().length > 0 && albumMedia.length > 0
      : true;

  const openVisibilityMenu = () => {
    Alert.alert(textFor(language, '谁可以看', 'Visibility'), undefined, [
      {
        text: textFor(language, '仅自己可见', 'Only Me'),
        onPress: () => setVisibility('private'),
      },
      {
        text: textFor(language, '好友可见', 'Friends'),
        onPress: () => setVisibility('friends'),
      },
      {
        text: textFor(language, '公开', 'Public'),
        onPress: () => setVisibility('public'),
      },
      { text: textFor(language, '取消', 'Cancel'), style: 'cancel' },
    ]);
  };

  const addAlbumImages = async () => {
    const remaining = 9 - albumMedia.length;
    if (remaining <= 0) {
      Alert.alert(
        textFor(language, '最多选择 9 张照片', 'Nine photos maximum'),
      );
      return;
    }
    try {
      const picked = await pickStationImagesFromLibrary(remaining);
      const valid = picked.filter(
        item => item.byteSize === null || item.byteSize <= 25 * 1024 * 1024,
      );
      if (valid.length !== picked.length) {
        Alert.alert(
          textFor(language, '图片过大', 'Image Too Large'),
          textFor(
            language,
            '单张图片不能超过 25 MB。',
            'Each image must be 25 MB or smaller.',
          ),
        );
      }
      setAlbumMedia(current => {
        const knownUris = new Set(current.map(item => item.uri));
        return [
          ...current,
          ...valid.filter(item => !knownUris.has(item.uri)),
        ].slice(0, 9);
      });
    } catch (error) {
      onActionError?.(error);
    }
  };

  const submit = () => {
    if (!canSubmit || isSaving) {
      return;
    }

    if (kind === 'diary') {
      onSubmit({
        kind,
        title: contentTitleFromText(kind, body, language),
        body: body.trim(),
        mood: '',
        visibility,
      });
      return;
    }

    if (kind === 'album') {
      onSubmit({
        kind,
        title: title.trim(),
        description: body.trim(),
        visibility,
        media: albumMedia,
      });
      return;
    }

    onSubmit({
      kind,
      title: contentTitleFromText(kind, body, language),
      note: body.trim(),
      visibility,
    });
  };

  const requestClose = () => {
    const hasDraft = isDiaryOrAlbumDraft(kind, title, body, albumMedia);
    if (!hasDraft) {
      onBack();
      return;
    }
    Alert.alert(
      textFor(language, '放弃此次编辑？', 'Discard this draft?'),
      textFor(
        language,
        '已编辑的内容不会保留。',
        'Your changes will not be saved.',
      ),
      [
        {
          text: textFor(language, '继续编辑', 'Keep Editing'),
          style: 'cancel',
        },
        {
          text: textFor(language, '放弃', 'Discard'),
          style: 'destructive',
          onPress: onBack,
        },
      ],
    );
  };

  if (fullScreen && (kind === 'diary' || kind === 'album')) {
    const isDiary = kind === 'diary';
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[
          styles.stationEditorKeyboard,
          { backgroundColor: palette.background },
        ]}
      >
        <StationContentEditorHeader
          action={
            isSaving
              ? progressText || textFor(language, '保存中', 'Saving')
              : textFor(language, '保存', 'Save')
          }
          actionDisabled={!canSubmit || isSaving}
          onAction={submit}
          onBack={requestClose}
          palette={palette}
          title={sheetTitle(kind, language)}
        />
        <ScrollView
          contentContainerStyle={styles.stationEditorBody}
          keyboardShouldPersistTaps="handled"
        >
          <View
            style={[
              styles.stationCreateComposer,
              { backgroundColor: palette.surface },
            ]}
          >
            {isDiary ? (
              <TextInput
                autoFocus
                maxLength={6000}
                multiline
                onChangeText={setBody}
                placeholder={bodyPlaceholder}
                placeholderTextColor={palette.secondaryText}
                style={[
                  styles.stationCreateDiaryInput,
                  { color: palette.text },
                ]}
                textAlignVertical="top"
                value={body}
              />
            ) : (
              <>
                <TextInput
                  maxLength={80}
                  onChangeText={setTitle}
                  placeholder={textFor(
                    language,
                    '给相册起个名字',
                    'Album name',
                  )}
                  placeholderTextColor={palette.secondaryText}
                  style={[
                    styles.stationCreateAlbumTitleInput,
                    { color: palette.text },
                  ]}
                  value={title}
                />
                <TextInput
                  maxLength={1000}
                  multiline
                  onChangeText={setBody}
                  placeholder={textFor(
                    language,
                    '写下相册说明',
                    'Describe this album',
                  )}
                  placeholderTextColor={palette.secondaryText}
                  style={[
                    styles.stationCreateAlbumDescriptionInput,
                    { color: palette.text },
                  ]}
                  value={body}
                />
                <View style={styles.stationCreateMediaGrid}>
                  {albumMedia.map(item => (
                    <View key={item.uri} style={styles.stationCreateMediaItem}>
                      <Image
                        source={{ uri: item.uri }}
                        style={styles.stationCreateMediaImage}
                      />
                      <Pressable
                        accessibilityLabel={textFor(
                          language,
                          '移除照片',
                          'Remove photo',
                        )}
                        disabled={isSaving}
                        onPress={() =>
                          setAlbumMedia(current =>
                            current.filter(media => media.uri !== item.uri),
                          )
                        }
                        style={styles.stationCreateMediaRemove}
                      >
                        <X color="#FFFFFF" size={14} strokeWidth={2.2} />
                      </Pressable>
                    </View>
                  ))}
                  {albumMedia.length < 9 ? (
                    <Pressable
                      accessibilityLabel={textFor(
                        language,
                        '添加照片',
                        'Add photos',
                      )}
                      disabled={isSaving}
                      onPress={addAlbumImages}
                      style={[
                        styles.stationCreateMediaAdd,
                        { borderColor: palette.secondaryText },
                      ]}
                    >
                      <ImagePlus
                        color={palette.secondaryText}
                        size={25}
                        strokeWidth={1.7}
                      />
                      <Text
                        style={[
                          styles.stationCreateMediaAddText,
                          { color: palette.secondaryText },
                        ]}
                      >
                        {albumMedia.length}/9
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </>
            )}
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={isSaving}
            onPress={openVisibilityMenu}
            style={[
              styles.stationCreateVisibilityRow,
              { backgroundColor: palette.surface },
            ]}
          >
            <VisibilityIcon
              color={palette.secondaryText}
              visibility={visibility}
            />
            <Text
              style={[
                styles.stationCreateVisibilityTitle,
                { color: palette.text },
              ]}
            >
              {textFor(language, '谁可以看', 'Visibility')}
            </Text>
            <Text
              style={[
                styles.stationCreateVisibilityValue,
                { color: palette.secondaryText },
              ]}
            >
              {visibilityLabel(visibility, language)}
            </Text>
            <ChevronRight
              color={palette.secondaryText}
              size={17}
              strokeWidth={1.8}
            />
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: palette.background }}
      contentContainerStyle={styles.settingsContent}
    >
      <SheetHeader
        title={sheetTitle(kind, language)}
        palette={palette}
        onBack={onBack}
      />

      <SettingGroup
        title={
          kind === 'album'
            ? textFor(language, '新建相册分类', 'New Album Category')
            : sheetTitle(kind, language)
        }
        palette={palette}
      >
        <View style={styles.settingsInputWrap}>
          <Text
            style={[
              styles.settingsSegmentTitle,
              { color: palette.secondaryText },
            ]}
          >
            {bodyLabel}
          </Text>
          <TextInput
            value={kind === 'album' ? title : body}
            onChangeText={kind === 'album' ? setTitle : setBody}
            multiline={kind !== 'album'}
            maxLength={kind === 'diary' ? 6000 : kind === 'album' ? 80 : 500}
            placeholder={bodyPlaceholder}
            placeholderTextColor={palette.secondaryText}
            style={[
              styles.settingsInput,
              kind !== 'album' && styles.settingsInputMultiline,
              {
                backgroundColor: palette.surface,
                borderColor: palette.border,
                color: palette.text,
              },
            ]}
          />
        </View>
      </SettingGroup>

      <SettingGroup
        title={textFor(language, '可见范围', 'Visibility')}
        palette={palette}
      >
        <SettingsSegmentRow
          title={textFor(language, '谁可以看', 'Audience')}
          palette={palette}
        >
          <SegmentedControl
            fill
            palette={palette}
            value={visibility}
            options={visibilityOptions(language)}
            onChange={setVisibility}
          />
        </SettingsSegmentRow>
      </SettingGroup>

      <View style={styles.settingsActionRow}>
        <SettingsActionButton
          title={textFor(language, '取消', 'Cancel')}
          palette={palette}
          disabled={isSaving}
          onPress={onBack}
        />
        <SettingsActionButton
          title={
            isSaving
              ? textFor(language, '保存中', 'Saving')
              : textFor(language, '保存', 'Save')
          }
          palette={palette}
          primary
          disabled={!canSubmit || isSaving}
          onPress={submit}
        />
      </View>
    </ScrollView>
  );
}

export type { StationCreatePayload };

function VisibilityIcon({
  color,
  visibility,
}: {
  color: string;
  visibility: StationVisibility;
}) {
  if (visibility === 'public')
    return <Globe2 color={color} size={18} strokeWidth={1.9} />;
  if (visibility === 'friends')
    return <Users color={color} size={18} strokeWidth={1.9} />;
  return <LockKeyhole color={color} size={18} strokeWidth={1.9} />;
}

const visibilityLabel = (visibility: StationVisibility, language: Language) =>
  ({
    private: textFor(language, '仅自己', 'Only Me'),
    friends: textFor(language, '好友可见', 'Friends'),
    public: textFor(language, '公开', 'Public'),
  }[visibility]);

const isDiaryOrAlbumDraft = (
  kind: StationCreateKind,
  title: string,
  body: string,
  media: PickedStationMedia[],
) =>
  kind === 'diary'
    ? Boolean(body.trim())
    : kind === 'album'
    ? Boolean(title.trim() || body.trim() || media.length)
    : false;
