import React, { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import type { Language } from '../features/session/sessionTypes';
import { textFor } from '../shared/i18n';
import type { Palette } from '../shared/theme';
import { useSystemReduceMotion } from '../shared/useReduceMotion';

type LaunchAnimationProps = {
  palette: Palette;
  language: Language;
  showIntro: boolean;
  isRestoring: boolean;
  onDismiss: () => void;
};

export function LaunchAnimation({
  palette,
  language,
  showIntro,
  isRestoring,
  onDismiss,
}: LaunchAnimationProps) {
  const reduceMotion = useSystemReduceMotion();
  const animate = showIntro && reduceMotion === false;
  const [overlayOpacity] = useState(() => new Animated.Value(1));
  const [lineProgress] = useState(() =>
    [0, 0, 0].map(value => new Animated.Value(value)),
  );
  const lines =
    language === 'en'
      ? ['Miaoxun,', 'your digital identity', 'growing with you']
      : ['妙讯，', '与你一起成长的', '数字身份'];

  useEffect(() => {
    if (!animate) return;
    const running = lineProgress.map((progress, index) => {
      progress.setValue(0);
      const transition = Animated.timing(progress, {
        delay: 100 + index * 310,
        duration: 440,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      });
      transition.start();
      return transition;
    });
    return () => running.forEach(transition => transition.stop());
  }, [animate, lineProgress]);

  useEffect(() => {
    if (showIntro || isRestoring) return;
    if (reduceMotion !== false) {
      onDismiss();
      return;
    }
    const fade = Animated.timing(overlayOpacity, {
      duration: 240,
      easing: Easing.out(Easing.cubic),
      toValue: 0,
      useNativeDriver: true,
    });
    fade.start(({ finished }) => {
      if (finished) onDismiss();
    });
    return () => fade.stop();
  }, [isRestoring, onDismiss, overlayOpacity, reduceMotion, showIntro]);

  return (
    <Animated.View
      accessibilityViewIsModal
      style={[
        s.overlay,
        { backgroundColor: palette.surface, opacity: overlayOpacity },
      ]}
    >
      <View style={s.content}>
        <View
          accessible
          accessibilityRole="header"
          accessibilityLabel={textFor(
            language,
            '妙讯，与你一起成长的数字身份',
            'Miaoxun, your digital identity growing with you',
          )}
          style={s.copy}
        >
          {lines.map((line, index) => (
            <Animated.Text
              key={index}
              accessibilityElementsHidden
              importantForAccessibility="no"
              style={[
                s.line,
                index === 0 && s.name,
                index === lines.length - 1 && s.emphasis,
                { color: palette.text },
                animate && {
                  opacity: lineProgress[index],
                  transform: [
                    {
                      translateY: lineProgress[index].interpolate({
                        inputRange: [0, 1],
                        outputRange: [6, 0],
                      }),
                    },
                  ],
                },
                showIntro && reduceMotion === null && s.waitingForPreference,
              ]}
            >
              {line}
            </Animated.Text>
          ))}
        </View>
        {isRestoring && (
          <View style={s.sync}>
            <Text
              accessibilityLiveRegion="polite"
              style={[s.status, { color: palette.secondaryText }]}
            >
              {textFor(
                language,
                '正在同步真实账号空间',
                'Syncing your real account space',
              )}
            </Text>
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={s.dots}
            >
              {[1, 0.68, 0.38].map(opacity => (
                <View
                  key={opacity}
                  style={[s.dot, { backgroundColor: palette.mint, opacity }]}
                />
              ))}
            </View>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    zIndex: 100,
  },
  content: { alignSelf: 'stretch' },
  copy: { gap: 8 },
  line: {
    fontSize: 22,
    fontWeight: '500',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  name: { fontSize: 28, fontWeight: '700' },
  emphasis: { fontSize: 30, fontWeight: '700', letterSpacing: 0.8 },
  waitingForPreference: { opacity: 0 },
  sync: {
    position: 'absolute',
    top: '100%',
    alignSelf: 'center',
    alignItems: 'center',
    marginTop: 24,
    gap: 14,
  },
  status: { fontSize: 13, textAlign: 'center' },
  dots: { flexDirection: 'row', gap: 7 },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
