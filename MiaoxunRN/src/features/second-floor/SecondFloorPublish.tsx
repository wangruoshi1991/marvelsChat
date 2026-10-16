import { BookOpen, Send } from 'lucide-react-native';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { appErrorText, textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import { workspacePalette } from '../../shared/workspacePalette';
import { Language, useMiaoxunSession } from '../session/useMiaoxunSession';
import {
  StationCreatePayload,
  StationCreateSheet,
} from '../station/StationCreateSheet';

/**
 * The publish entry lives on the second floor by the user's decision — the
 * prototype's 我 page has no composer row and the floor's tool set is the one
 * place a publish action was wanted. The panel keeps the floor's own
 * `.xun-floor-panel` body padding.
 */
export function SecondFloorPublish({
  palette,
  language,
  session,
  onOpenPostComposer,
  onBusyChange,
}: {
  palette: Palette;
  language: Language;
  session: ReturnType<typeof useMiaoxunSession>;
  /** Opens the post composer owned by the app shell. */
  onOpenPostComposer: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const colors = workspacePalette(palette);
  const [diaryOpen, setDiaryOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const submitDiary = async (payload: StationCreatePayload) => {
    if (payload.kind !== 'diary' || busy) return;
    setBusy(true);
    onBusyChange?.(true);
    setMessage('');
    try {
      await session.createStationDiary({
        title: payload.title,
        body: payload.body,
        mood: payload.mood,
        visibility: payload.visibility,
      });
      setDiaryOpen(false);
    } catch (error) {
      setMessage(
        appErrorText(
          language,
          error,
          '日记保存失败',
          'Saving the diary failed',
        ),
      );
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  };

  if (diaryOpen) {
    return (
      <StationCreateSheet
        kind="diary"
        palette={colors}
        language={language}
        isSaving={busy}
        onBack={() => {
          if (!busy) setDiaryOpen(false);
        }}
        onSubmit={submitDiary}
      />
    );
  }

  return (
    <View style={s.body}>
      <Text style={[s.title, { color: colors.text }]}>
        {textFor(language, '发布', 'Publish')}
      </Text>
      <Text style={[s.hint, { color: colors.secondaryText }]}>
        {textFor(
          language,
          '发布动态或写日记。动态会出现在你的小站里。',
          'Publish a post or write a diary. Posts appear on your station.',
        )}
      </Text>

      <Pressable
        accessibilityLabel={textFor(language, '发布动态', 'New Post')}
        accessibilityRole="button"
        onPress={onOpenPostComposer}
        style={[
          s.action,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <Send color={colors.text} size={20} strokeWidth={2} />
        <View style={s.actionCopy}>
          <Text style={[s.actionTitle, { color: colors.text }]}>
            {textFor(language, '发布动态', 'New Post')}
          </Text>
          <Text style={[s.actionBody, { color: colors.secondaryText }]}>
            {textFor(language, '图片或文字', 'Text or images')}
          </Text>
        </View>
      </Pressable>

      <Pressable
        accessibilityLabel={textFor(language, '写日记', 'Write diary')}
        accessibilityRole="button"
        onPress={() => {
          setMessage('');
          setDiaryOpen(true);
        }}
        style={[
          s.action,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}
      >
        <BookOpen color={colors.text} size={20} strokeWidth={2} />
        <View style={s.actionCopy}>
          <Text style={[s.actionTitle, { color: colors.text }]}>
            {textFor(language, '写日记', 'Write diary')}
          </Text>
          <Text style={[s.actionBody, { color: colors.secondaryText }]}>
            {textFor(language, '记录今天', 'Record today')}
          </Text>
        </View>
      </Pressable>

      {message ? (
        <Text
          accessibilityRole="alert"
          style={[s.hint, { color: palette.rose }]}
        >
          {message}
        </Text>
      ) : null}
    </View>
  );
}

/** Prototype `.xun-floor-panel-body`: 14px 12px 12px. */
const s = StyleSheet.create({
  body: {
    flex: 1,
    gap: 10,
    paddingBottom: 12,
    paddingHorizontal: 12,
    paddingTop: 14,
  },
  title: { fontSize: 15, fontWeight: '800' },
  hint: { fontSize: 12, lineHeight: 18 },
  action: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 11,
    minHeight: 62,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actionCopy: { flex: 1, gap: 3, minWidth: 0 },
  actionTitle: { fontSize: 14, fontWeight: '700' },
  actionBody: { fontSize: 11, lineHeight: 16 },
});
