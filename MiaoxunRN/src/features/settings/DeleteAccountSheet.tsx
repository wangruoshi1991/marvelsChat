import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Check, ChevronDown, Trash2, TriangleAlert } from 'lucide-react-native';

import { textFor } from '../../shared/i18n';
import { Palette, spacing } from '../../shared/theme';
import { Language } from '../session/useMiaoxunSession';

export function DeleteAccountSheet({
  palette,
  language,
  isBusy,
  onBack,
  onDeleteAccount,
}: {
  palette: Palette;
  language: Language;
  isBusy: boolean;
  onBack: () => void;
  onDeleteAccount: (password: string) => Promise<void>;
}) {
  const [password, setPassword] = useState('');
  const [hasConfirmed, setHasConfirmed] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const canDelete = password.length > 0 && hasConfirmed && !isBusy;
  const checkboxColors = hasConfirmed
    ? { backgroundColor: palette.rose, borderColor: palette.rose }
    : { backgroundColor: 'transparent', borderColor: palette.border };

  const submit = async () => {
    if (!canDelete) {
      return;
    }
    setErrorMessage(null);
    try {
      await onDeleteAccount(password);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : textFor(language, '账号注销失败', 'Could not delete account'),
      );
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.screen, { backgroundColor: palette.background }]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Pressable
            accessibilityLabel={textFor(language, '返回', 'Back')}
            disabled={isBusy}
            onPress={onBack}
            style={[
              styles.dismissButton,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <ChevronDown color={palette.mint} size={22} strokeWidth={3} />
          </Pressable>
          <Text style={[styles.title, { color: palette.text }]}>
            {textFor(language, '注销账号', 'Delete account')}
          </Text>
        </View>

        <View
          style={[
            styles.warning,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
        >
          <View
            style={[
              styles.warningIcon,
              { backgroundColor: `${palette.rose}1f` },
            ]}
          >
            <TriangleAlert color={palette.rose} size={22} strokeWidth={2.4} />
          </View>
          <View style={styles.warningCopy}>
            <Text style={[styles.warningTitle, { color: palette.text }]}>
              {textFor(
                language,
                '此操作无法撤销',
                'This action cannot be undone',
              )}
            </Text>
            <Text
              style={[styles.warningBody, { color: palette.secondaryText }]}
            >
              {textFor(
                language,
                '账号、个人资料、小站内容和已上传资源将被永久删除。',
                'Your account, profile, station content, and uploaded assets will be permanently deleted.',
              )}
            </Text>
          </View>
        </View>

        <View style={styles.form}>
          <Text style={[styles.label, { color: palette.text }]}>
            {textFor(language, '验证当前密码', 'Verify current password')}
          </Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="password"
            editable={!isBusy}
            onChangeText={setPassword}
            onSubmitEditing={() => submit().catch(() => undefined)}
            placeholder={textFor(language, '请输入密码', 'Enter your password')}
            placeholderTextColor={palette.secondaryText}
            returnKeyType="done"
            secureTextEntry
            style={[
              styles.input,
              {
                backgroundColor: palette.input,
                borderColor: errorMessage ? palette.rose : palette.border,
                color: palette.text,
              },
            ]}
            textContentType="password"
            value={password}
          />

          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: hasConfirmed }}
            disabled={isBusy}
            onPress={() => setHasConfirmed(current => !current)}
            style={styles.confirmationRow}
          >
            <View style={[styles.checkbox, checkboxColors]}>
              {hasConfirmed ? (
                <Check color="#ffffff" size={14} strokeWidth={3} />
              ) : null}
            </View>
            <Text
              style={[
                styles.confirmationText,
                { color: palette.secondaryText },
              ]}
            >
              {textFor(
                language,
                '我已了解注销后无法恢复账号和数据。',
                'I understand that the account and data cannot be restored.',
              )}
            </Text>
          </Pressable>

          {errorMessage ? (
            <Text
              accessibilityRole="alert"
              style={[styles.error, { color: palette.rose }]}
            >
              {errorMessage}
            </Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            disabled={!canDelete}
            onPress={() => submit().catch(() => undefined)}
            style={[
              styles.deleteButton,
              { backgroundColor: palette.rose },
              !canDelete && styles.disabled,
            ]}
          >
            {isBusy ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <Trash2 color="#ffffff" size={18} strokeWidth={2.5} />
                <Text style={styles.deleteButtonText}>
                  {textFor(
                    language,
                    '永久注销账号',
                    'Permanently delete account',
                  )}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    gap: 20,
    paddingBottom: 32,
    paddingHorizontal: spacing.pageX,
    paddingTop: 12,
  },
  header: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  dismissButton: {
    alignItems: 'center',
    borderRadius: spacing.cardRadius,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  title: { fontSize: 28, fontWeight: '900' },
  warning: {
    alignItems: 'flex-start',
    borderRadius: spacing.cardRadius,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 16,
  },
  warningIcon: {
    alignItems: 'center',
    borderRadius: spacing.cardRadius,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  warningCopy: { flex: 1, gap: 6 },
  warningTitle: { fontSize: 17, fontWeight: '900' },
  warningBody: { fontSize: 14, lineHeight: 21 },
  form: { gap: 14 },
  label: { fontSize: 15, fontWeight: '800' },
  input: {
    borderRadius: spacing.cardRadius,
    borderWidth: 1,
    fontSize: 16,
    minHeight: 50,
    paddingHorizontal: 14,
  },
  confirmationRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 2,
  },
  checkbox: {
    alignItems: 'center',
    borderRadius: 4,
    borderWidth: 1.5,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  confirmationText: { flex: 1, fontSize: 14, lineHeight: 22 },
  error: { fontSize: 13, fontWeight: '700', lineHeight: 19 },
  deleteButton: {
    alignItems: 'center',
    borderRadius: spacing.cardRadius,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 16,
  },
  deleteButtonText: { color: '#ffffff', fontSize: 15, fontWeight: '900' },
  disabled: { opacity: 0.42 },
});
