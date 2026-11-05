import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { uiPreferencesApi } from '../../services/api/uiPreferencesApi';
import { appErrorText, textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import { Language } from '../session/sessionTypes';
import {
  describeUIPreferenceChanges,
  formatUIPreferenceValue,
} from '../ui/uiPreferenceDiff';
import { UIPreferencePreviewDTO } from '../ui/uiPreferenceTypes';

export function UIPreferenceChatCard({
  token,
  previewId,
  palette,
  language,
  onConfirm,
}: {
  token: string;
  previewId: string;
  palette: Palette;
  language: Language;
  onConfirm: (id: string, baseRevision: number) => Promise<unknown>;
}) {
  const [preview, setPreview] = useState<UIPreferencePreviewDTO | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const confirming = useRef(false);
  useEffect(() => {
    let active = true;
    setPreview(null);
    setError('');
    uiPreferencesApi
      .getUIPreferencePreview(token, previewId)
      .then(result => {
        if (active) setPreview(result);
      })
      .catch(issue => {
        if (active)
          setError(
            appErrorText(
              language,
              issue,
              '无法读取界面调整预览',
              'Unable to load interface preview',
            ),
          );
      });
    return () => {
      active = false;
    };
  }, [token, previewId, language]);

  const changes = preview
    ? describeUIPreferenceChanges(preview.beforePreferences, preview)
    : [];
  return (
    <View
      style={[
        cardStyles.card,
        { borderColor: palette.border, backgroundColor: palette.surface },
      ]}
    >
      <Text style={[cardStyles.title, { color: palette.text }]}>
        {textFor(language, '界面调整预览', 'Interface change preview')}
      </Text>
      {preview ? (
        <>
          <Text style={{ color: palette.text }}>{preview.intent}</Text>
          <Text style={{ color: palette.secondaryText }}>
            {preview.rationale}
          </Text>
          <Text style={{ color: palette.secondaryText }}>
            {textFor(language, '影响页面', 'Affected surfaces')}:{' '}
            {preview.affectedSurfaces.join('、')}
          </Text>
          {changes.map(change => (
            <Text
              key={change.path}
              style={{ color: palette.secondaryText }}
            >{`${change.path}: ${formatUIPreferenceValue(
              change.before,
            )} → ${formatUIPreferenceValue(change.after)}`}</Text>
          ))}
          {preview.status === 'pending' && changes.length === 0 ? (
            <Text style={{ color: palette.secondaryText }}>
              {textFor(
                language,
                '没有检测到可应用的变化。',
                'No applicable changes were detected.',
              )}
            </Text>
          ) : null}
          {preview.status === 'pending' && changes.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={textFor(
                language,
                '应用界面调整',
                'Apply interface change',
              )}
              disabled={busy}
              onPress={async () => {
                if (confirming.current) return;
                confirming.current = true;
                setBusy(true);
                setError('');
                try {
                  await onConfirm(preview.id, preview.baseRevision);
                  setPreview({ ...preview, status: 'confirmed' });
                } catch (issue) {
                  setError(
                    appErrorText(
                      language,
                      issue,
                      '应用失败',
                      'Unable to apply change',
                    ),
                  );
                } finally {
                  confirming.current = false;
                  setBusy(false);
                }
              }}
              style={[cardStyles.button, { backgroundColor: palette.mint }]}
            >
              <Text style={{ color: palette.background }}>
                {busy
                  ? textFor(language, '应用中', 'Applying')
                  : textFor(language, '应用调整', 'Apply')}
              </Text>
            </Pressable>
          ) : preview.status !== 'pending' ? (
            <Text style={{ color: palette.secondaryText }}>
              {preview.status === 'confirmed'
                ? textFor(language, '曾应用', 'Previously applied')
                : preview.status === 'expired'
                ? textFor(language, '已过期', 'Expired')
                : preview.status === 'undone'
                ? textFor(language, '已撤销', 'Undone')
                : textFor(language, '已重置', 'Reset')}
            </Text>
          ) : null}
        </>
      ) : !error ? (
        <Text style={{ color: palette.secondaryText }}>
          {textFor(language, '正在读取预览', 'Loading preview')}
        </Text>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={{ color: palette.rose }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const cardStyles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 8, padding: 12, marginTop: 8, gap: 6 },
  title: { fontWeight: '600' },
  button: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
});
