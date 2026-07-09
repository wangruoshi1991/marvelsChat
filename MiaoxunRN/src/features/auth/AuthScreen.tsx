import React, {useEffect, useState} from 'react';
import {ActivityIndicator, Pressable, Text, TextInput, View} from 'react-native';
import {ArrowRightCircle} from 'lucide-react-native';

import {Language} from '../session/useMiaoxunSession';
import {authErrorText, textFor} from '../../shared/i18n';
import {styles} from '../../shared/styles';
import {Palette} from '../../shared/theme';

type AuthMode = 'login' | 'register';
export type RegisterContactType = 'phone' | 'email';

export function AuthScreen({
  palette,
  language,
  isBusy,
  errorMessage,
  onSignIn,
  onSignUp,
}: {
  palette: Palette;
  language: Language;
  isBusy: boolean;
  errorMessage: string | null;
  onSignIn: (identifier: string, password: string) => void;
  onSignUp: (
    contactType: RegisterContactType,
    contact: string,
    password: string,
    displayName: string,
  ) => Promise<unknown> | void;
}) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [identifier, setIdentifier] = useState('');
  const [registerContact, setRegisterContact] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [topNotice, setTopNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const contactValue = mode === 'login' ? identifier.trim() : registerContact.trim();
  const contactDigits = registerContact.trim().replace(/\D/g, '');
  const registerContactKind = registerContact.trim().length === 0
    ? null
    : /^[\d\s-]+$/.test(registerContact.trim())
      ? 'phone'
      : 'email';
  const registerContactType: RegisterContactType = registerContactKind === 'email' ? 'email' : 'phone';
  const isRegisterEmail = registerContactType === 'email';
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const phonePattern = /^1[3-9]\d{9}$/;
  const passwordHasUppercase = /[A-Z]/.test(password);
  const passwordHasLowercase = /[a-z]/.test(password);
  const passwordMeetsRegisterRule =
    password.length >= 8 && passwordHasUppercase && passwordHasLowercase;
  const registerContactValid = isRegisterEmail
    ? emailPattern.test(contactValue)
    : phonePattern.test(contactDigits);
  const registerContactWarning =
    mode === 'register' && registerContact.trim().length > 0 && !registerContactValid
      ? isRegisterEmail
        ? textFor(language, '邮箱格式不正确', 'Email format is incorrect')
        : textFor(language, '请输入 11 位中国大陆手机号', 'Enter an 11 digit mainland China mobile number')
      : null;
  const passwordWarning =
    mode === 'register' && password.length > 0 && !passwordMeetsRegisterRule
      ? textFor(
          language,
          '密码至少 8 位，并且需要包含一个大写字母和一个小写字母',
          'Password must be at least 8 characters and include one uppercase and one lowercase letter',
        )
      : null;
  const registerValidationMessage = registerContactWarning || passwordWarning;
  const canSubmit =
    mode === 'login'
      ? identifier.trim().length > 0 && password.length > 0
      : displayName.trim().length > 0 && registerContactValid && passwordMeetsRegisterRule;

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setPassword('');
    setTopNotice(null);
  };

  useEffect(() => {
    if (!errorMessage) {
      return undefined;
    }
    const message = authErrorText(language, errorMessage);
    setTopNotice(message);
    const timer = setTimeout(() => {
      setTopNotice(current => (current === message ? null : current));
    }, 2200);
    return () => clearTimeout(timer);
  }, [errorMessage, language]);

  const submit = async () => {
    setTopNotice(null);
    if (!canSubmit || isBusy || isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    if (mode === 'login') {
      try {
        await onSignIn(identifier.trim(), password);
      } finally {
        setIsSubmitting(false);
      }
    } else {
      try {
        await onSignUp(
        registerContactType,
        isRegisterEmail ? contactValue : contactDigits,
        password,
        displayName.trim(),
      );
      } catch {
        // Session hook owns the translated error notice.
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <View style={[styles.authScreen, {backgroundColor: palette.background}]}>
      {topNotice ? (
        <View style={[styles.authTopNoticeWrap, styles.pointerEventsNone]}>
          <View style={[styles.authTopNotice, {backgroundColor: palette.rose}]}>
            <Text style={styles.authTopNoticeText}>{topNotice}</Text>
          </View>
        </View>
      ) : null}
      <View style={styles.authContent}>
        <View style={styles.authHero}>
          <Text style={[styles.authTitle, {color: palette.text}]}>
            {textFor(language, '妙讯', 'Miaoxun')}
          </Text>
          <Text style={[styles.authSubtitle, {color: palette.secondaryText}]}>
            {textFor(language, 'AI 不只问答，找人，找东西，就上妙讯小站。', 'Miaoxun is for people and things, not just answers.')}
          </Text>
        </View>

        <View style={styles.authFields}>
          {mode === 'register' ? (
            <>
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                placeholder={textFor(language, '昵称', 'Name')}
                placeholderTextColor={palette.secondaryText}
                returnKeyType="next"
                style={[styles.authLargeInput, {backgroundColor: palette.surface, borderColor: palette.border, color: palette.text}]}
              />
              <TextInput
                value={registerContact}
                onChangeText={setRegisterContact}
                placeholder={textFor(language, '手机号或邮箱', 'Phone number or email')}
                placeholderTextColor={palette.secondaryText}
                autoCapitalize="none"
                keyboardType={registerContactKind === 'phone' ? 'phone-pad' : 'email-address'}
                style={[
                  styles.authLargeInput,
                  {
                    backgroundColor: palette.surface,
                    borderColor: registerContactWarning ? palette.rose : palette.border,
                    color: palette.text,
                  },
                ]}
              />
            </>
          ) : (
            <TextInput
              value={identifier}
              onChangeText={setIdentifier}
              placeholder={textFor(language, '手机号 / 邮箱 / 昵称', 'Phone / email / name')}
              placeholderTextColor={palette.secondaryText}
              autoCapitalize="none"
              keyboardType="email-address"
              style={[styles.authLargeInput, {backgroundColor: palette.surface, borderColor: palette.border, color: palette.text}]}
            />
          )}
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder={textFor(language, '密码', 'Password')}
            placeholderTextColor={palette.secondaryText}
            secureTextEntry
            style={[
              styles.authLargeInput,
              {
                backgroundColor: palette.surface,
                borderColor: passwordWarning ? palette.rose : palette.border,
                color: palette.text,
              },
            ]}
          />
          {mode === 'register' ? (
            <View style={styles.authValidationSlot}>
              <Text style={[styles.authValidationText, registerValidationMessage ? {color: palette.rose} : styles.authFieldErrorHidden]}>
                {registerValidationMessage || ' '}
              </Text>
            </View>
          ) : null}
          <Pressable
            disabled={!canSubmit || isBusy || isSubmitting}
            onPress={submit}
            style={[
              styles.authSubmit,
              {backgroundColor: palette.mint},
              (!canSubmit || isBusy || isSubmitting) && styles.disabledButton,
            ]}>
            {isBusy || isSubmitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <View style={styles.authSubmitContent}>
                <ArrowRightCircle color="#ffffff" size={19} fill="rgba(255,255,255,0.16)" />
                <Text style={styles.authSubmitText}>
                  {mode === 'login' ? textFor(language, '登录', 'Login') : textFor(language, '创建账号', 'Create account')}
                </Text>
              </View>
            )}
          </Pressable>
          <View style={styles.authModeRow}>
            <Text style={[styles.authModeText, {color: palette.secondaryText}]}>
              {mode === 'login'
                ? textFor(language, '还没有账号？', 'No account yet?')
                : textFor(language, '已有账号？', 'Already have an account?')}
            </Text>
            <Pressable onPress={() => switchMode(mode === 'login' ? 'register' : 'login')}>
              <Text style={[styles.authModeAction, {color: palette.mint}]}>
                {mode === 'login'
                  ? textFor(language, '注册一个', 'Create one')
                  : textFor(language, '返回登录', 'Back to login')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}
