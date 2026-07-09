import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';

import { StationVisibility } from '../../models/api';
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
  onBack: () => void;
  onSubmit: (payload: StationCreatePayload) => void;
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
    return textFor(language, '新的相册', 'New album');
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
  onBack,
  onSubmit,
}: StationCreateSheetProps) {
  const [title, setTitle] = useState(initialTitle(kind, language));
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<StationVisibility>('private');

  useEffect(() => {
    setTitle(initialTitle(kind, language));
    setBody('');
    setVisibility('private');
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
      ? title.trim().length > 0
      : true;

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
