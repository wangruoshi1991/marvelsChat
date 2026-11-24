import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Palette } from '../../shared/theme';
import { styles } from '../../shared/styles';
import {
  iosBackEdge,
  useIOSBackGesture,
} from '../../shared/gestures/useIOSBackGesture';

export function PublicProfilePage({
  backLabel,
  voiceCallOverlay,
  children,
  onBack,
  palette,
  reduceMotion,
  title,
}: React.PropsWithChildren<{
  backLabel: string;
  voiceCallOverlay?: React.ReactNode;
  onBack: () => void;
  palette: Palette;
  reduceMotion: boolean;
  title: string;
}>) {
  const [presented, setPresented] = useState(false);
  const { width } = useWindowDimensions();
  const translateX = useRef(
    new Animated.Value(reduceMotion ? 0 : width),
  ).current;
  const closing = useRef(false);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => () => translateX.stopAnimation(), [translateX]);

  const navigation = useMemo(() => {
    function slideTo(offset: number, done?: () => void) {
      Animated.timing(translateX, {
        toValue: offset,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) done?.();
      });
    }
    function close() {
      if (closing.current) return;
      closing.current = true;
      if (reduceMotion) {
        onBackRef.current();
      } else {
        slideTo(width, () => onBackRef.current());
      }
    }
    return {
      close,
      open: () => {
        if (reduceMotion) translateX.setValue(0);
        else slideTo(0);
      },
      reset: () => {
        if (!closing.current && !reduceMotion) slideTo(0);
      },
    };
  }, [reduceMotion, translateX, width]);
  const edgeBack = useIOSBackGesture({
    enabled: !closing.current,
    onBack: navigation.close,
    onCancel: navigation.reset,
    reduceMotion,
    translateX,
    width,
  });

  return (
    <Modal
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      presentationStyle="overFullScreen"
      animationType="none"
      onShow={() => {
        setPresented(true);
        navigation.open();
      }}
      onRequestClose={navigation.close}
    >
      <SafeAreaProvider>
        <Animated.View
          accessibilityViewIsModal
          onAccessibilityEscape={navigation.close}
          style={[
            pageStyles.frame,
            {
              backgroundColor: palette.background,
              transform: [{ translateX }],
            },
          ]}
        >
          <SafeAreaView style={pageStyles.frame}>
            <View
              style={[styles.header, { borderBottomColor: palette.border }]}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={backLabel}
                onPress={navigation.close}
                style={pageStyles.backButton}
              >
                <ChevronLeft color={palette.text} size={26} />
              </Pressable>
              <Text
                accessibilityRole="header"
                style={[styles.headerTitle, { color: palette.text }]}
              >
                {title}
              </Text>
              <View style={pageStyles.headerSpacer} />
            </View>
            <View style={pageStyles.frame}>
              {children}
              {Platform.OS === 'ios' ? (
                <View
                  {...edgeBack}
                  accessible={false}
                  importantForAccessibility="no"
                  style={iosBackEdge}
                />
              ) : null}
            </View>
            {presented ? voiceCallOverlay : null}
          </SafeAreaView>
        </Animated.View>
      </SafeAreaProvider>
    </Modal>
  );
}

const pageStyles = StyleSheet.create({
  frame: { flex: 1 },
  backButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
  },
  headerSpacer: { width: 44 },
});
