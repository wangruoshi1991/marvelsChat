import React from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import { AlertCircle, X } from 'lucide-react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { contactIconAssets } from '../../assets/icons';
import { textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { Language, useMiaoxunSession } from '../session/useMiaoxunSession';
import { StationPostComposerContent } from './StationPostComposerContent';
import { useStationPostComposer } from './useStationPostComposer';

export function StationPostComposerScreen({
  palette,
  language,
  session,
  onClose,
  onPublished,
  onActionError,
}: {
  palette: Palette;
  language: Language;
  session: ReturnType<typeof useMiaoxunSession>;
  onClose: () => void;
  onPublished: () => void;
  onActionError: (error: unknown) => void;
}) {
  const composer = useStationPostComposer({
    language,
    session,
    onClose,
    onPublished,
    onActionError,
  });
  const {
    attachments,
    isPublishing,
    publish,
    publishError,
    requestClose,
    setPublishError,
    uploadedCount,
  } = composer;
  const isDark = session.appearance === 'dark';
  const screenColor = isDark ? palette.background : '#F8F7FD';
  const backgroundColor = isDark ? palette.surface : '#FFFFFF';
  const headerColor = isDark ? palette.surface : '#F8F7FD';
  const borderColor = isDark ? palette.border : '#F0EBFD';
  const softColor = isDark ? palette.soft : '#F4F6FF';
  const textColor = isDark ? palette.text : '#000000';
  const secondaryTextColor = isDark
    ? palette.secondaryText
    : 'rgba(0,0,0,0.60)';
  const accentColor = isDark ? palette.mint : '#2012D9';

  return (
    <Modal
      animationType="slide"
      presentationStyle="fullScreen"
      visible
      onRequestClose={requestClose}
    >
      <SafeAreaProvider>
        <SafeAreaView
          edges={['top']}
          style={[styles.postComposerScreen, { backgroundColor: headerColor }]}
        >
          <SafeAreaView
            edges={['bottom']}
            style={[
              styles.postComposerScreen,
              { backgroundColor: screenColor },
            ]}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.postComposerKeyboard}
            >
              <View
                style={[
                  styles.postComposerHeader,
                  {
                    backgroundColor: headerColor,
                  },
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={textFor(language, '返回', 'Back')}
                  disabled={isPublishing}
                  onPress={requestClose}
                  style={styles.postComposerBack}
                >
                  <Image
                    source={contactIconAssets.back}
                    resizeMode="contain"
                    style={[
                      styles.postComposerBackIcon,
                      isDark && { tintColor: palette.text },
                    ]}
                  />
                </Pressable>
                <Text style={[styles.postComposerTitle, { color: textColor }]}>
                  {textFor(language, '发布动态', 'New Post')}
                </Text>
                <View style={styles.postComposerPublishSlot}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      isPublishing && attachments.length
                        ? textFor(
                            language,
                            `正在上传 ${uploadedCount}/${attachments.length}`,
                            `Uploading ${uploadedCount}/${attachments.length}`,
                          )
                        : textFor(language, '发布', 'Post')
                    }
                    accessibilityState={{
                      disabled: isPublishing,
                    }}
                    disabled={isPublishing}
                    onPress={publish}
                    testID="post-composer-publish"
                    style={[
                      styles.postComposerPublish,
                      { backgroundColor: accentColor },
                      isPublishing && styles.disabledButton,
                    ]}
                  >
                    {isPublishing ? (
                      <View style={styles.postComposerPublishProgress}>
                        <ActivityIndicator color="#FFFFFF" size="small" />
                        {attachments.length ? (
                          <Text style={styles.postComposerPublishProgressText}>
                            {uploadedCount}/{attachments.length}
                          </Text>
                        ) : null}
                      </View>
                    ) : (
                      <Text
                        style={styles.postComposerPublishText}
                        numberOfLines={1}
                      >
                        {textFor(language, '发布', 'Post')}
                      </Text>
                    )}
                  </Pressable>
                </View>
              </View>

              {publishError ? (
                <View
                  accessibilityRole="alert"
                  style={styles.postComposerError}
                  testID="post-composer-error"
                >
                  <AlertCircle color="#D9364F" size={18} strokeWidth={2} />
                  <Text style={styles.postComposerErrorText}>
                    {publishError}
                  </Text>
                  <Pressable
                    accessibilityLabel={textFor(
                      language,
                      '关闭错误提示',
                      'Dismiss error',
                    )}
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => setPublishError('')}
                    style={styles.postComposerErrorDismiss}
                  >
                    <X color="#D9364F" size={17} strokeWidth={2} />
                  </Pressable>
                </View>
              ) : null}

              <StationPostComposerContent
                accentColor={accentColor}
                backgroundColor={backgroundColor}
                borderColor={borderColor}
                composer={composer}
                isDark={isDark}
                language={language}
                secondaryTextColor={secondaryTextColor}
                softColor={softColor}
                textColor={textColor}
              />
            </KeyboardAvoidingView>
          </SafeAreaView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}
