import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Trash2 } from 'lucide-react-native';

import { textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import { SheetHeader } from '../../shared/ui';
import { Language } from '../session/useMiaoxunSession';

const confirmationText = (language: Language) =>
  textFor(language, '删除账号', 'DELETE ACCOUNT');

const passwordError = (language: Language, error: unknown) => {
  if (
    error &&
    typeof error === 'object' &&
    'status' in error &&
    error.status === 401
  ) {
    return textFor(language, '密码不正确。', 'Password is incorrect.');
  }
  return textFor(
    language,
    '账号暂时无法删除，请稍后重试。',
    'Account could not be deleted. Try again later.',
  );
};

export function DeleteAccountSheet({
  palette,
  language,
  onBack,
  onDeleteAccount,
}: {
  palette: Palette;
  language: Language;
  onBack: () => void;
  onDeleteAccount: (password: string) => Promise<unknown>;
}) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const phrase = confirmationText(language);
  const canDelete =
    password.length > 0 && confirmation === phrase && !isDeleting;

  const deleteAccount = async () => {
    if (!canDelete) {
      return;
    }
    setIsDeleting(true);
    setErrorMessage('');
    try {
      await onDeleteAccount(password);
    } catch (error) {
      setErrorMessage(passwordError(language, error));
    } finally {
      setIsDeleting(false);
    }
  };

  const confirmDelete = () => {
    if (!canDelete) {
      return;
    }
    Alert.alert(
      textFor(language, '永久删除账号', 'Permanently delete account'),
      textFor(
        language,
        '此操作无法撤销。主页、照片和账号数据会被永久删除。',
        'This cannot be undone. Your homepage, photos, and account data will be permanently deleted.',
      ),
      [
        { text: textFor(language, '取消', 'Cancel'), style: 'cancel' },
        {
          text: textFor(language, '永久删除', 'Delete permanently'),
          style: 'destructive',
          onPress: () => deleteAccount(),
        },
      ],
    );
  };

  return (
    <View style={[localStyles.screen, { backgroundColor: palette.background }]}>
      <SheetHeader
        title={textFor(language, '删除账号', 'Delete account')}
        palette={palette}
        onBack={onBack}
      />
      <ScrollView
        contentContainerStyle={localStyles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={[
            localStyles.iconBox,
            { backgroundColor: `${palette.rose}18` },
          ]}
        >
          <Trash2 color={palette.rose} size={27} strokeWidth={2.2} />
        </View>
        <Text style={[localStyles.title, { color: palette.text }]}>
          {textFor(language, '确认永久删除', 'Confirm permanent deletion')}
        </Text>
        <Text style={[localStyles.body, { color: palette.secondaryText }]}>
          {textFor(
            language,
            '删除后无法恢复。请先输入当前密码，再输入下方确认文字。',
            'Deletion cannot be reversed. Enter your current password and the confirmation text below.',
          )}
        </Text>
        <TextInput
          testID="delete-account-password"
          accessibilityLabel={textFor(language, '当前密码', 'Current password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder={textFor(language, '当前密码', 'Current password')}
          placeholderTextColor={palette.secondaryText}
          style={[
            localStyles.input,
            {
              color: palette.text,
              backgroundColor: palette.input,
              borderColor: palette.border,
            },
          ]}
        />
        <Text
          style={[localStyles.confirmHint, { color: palette.secondaryText }]}
        >
          {textFor(language, `请输入“${phrase}”`, `Type “${phrase}”`)}
        </Text>
        <TextInput
          testID="delete-account-confirmation"
          accessibilityLabel={textFor(
            language,
            '删除账号确认文字',
            'Account deletion confirmation text',
          )}
          value={confirmation}
          onChangeText={setConfirmation}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder={phrase}
          placeholderTextColor={palette.secondaryText}
          style={[
            localStyles.input,
            {
              color: palette.text,
              backgroundColor: palette.input,
              borderColor: palette.border,
            },
          ]}
        />
        {errorMessage ? (
          <Text style={[localStyles.error, { color: palette.rose }]}>
            {errorMessage}
          </Text>
        ) : null}
        <Pressable
          testID="delete-account-submit"
          accessibilityRole="button"
          accessibilityState={{ disabled: !canDelete }}
          disabled={!canDelete}
          onPress={confirmDelete}
          style={[
            localStyles.deleteButton,
            { backgroundColor: palette.rose },
            !canDelete && localStyles.disabled,
          ]}
        >
          {isDeleting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <>
              <Trash2 color="#ffffff" size={18} strokeWidth={2.4} />
              <Text style={localStyles.deleteText}>
                {textFor(
                  language,
                  '永久删除账号',
                  'Delete account permanently',
                )}
              </Text>
            </>
          )}
        </Pressable>
      </ScrollView>
    </View>
  );
}

const localStyles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, paddingBottom: 48 },
  iconBox: {
    width: 54,
    height: 54,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  title: { fontSize: 24, fontWeight: '700', lineHeight: 31 },
  body: { fontSize: 15, lineHeight: 23, marginTop: 8, marginBottom: 20 },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 13,
    fontSize: 16,
  },
  confirmHint: { fontSize: 13, lineHeight: 19, marginTop: 18, marginBottom: 7 },
  error: { fontSize: 13, lineHeight: 19, marginTop: 10 },
  deleteButton: {
    minHeight: 50,
    borderRadius: 8,
    marginTop: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  deleteText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
