import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import { Language } from '../features/session/useMiaoxunSession';
import { textFor } from '../shared/i18n';
import { styles } from '../shared/styles';
import { Palette } from '../shared/theme';

type LaunchAnimationProps = {
  palette: Palette;
  language: Language;
};

export function LaunchAnimation({ palette, language }: LaunchAnimationProps) {
  const lineAnimations = useRef(
    [0, 1, 2].map(() => new Animated.Value(0)),
  ).current;
  const dotAnimations = useRef(
    [0, 1, 2].map(() => new Animated.Value(0)),
  ).current;
  const lines = [
    textFor(language, 'AI 不只问答', 'AI beyond Q&A'),
    textFor(language, '找人，找东西', 'Find people and things'),
    textFor(language, '就上妙讯小站', 'Meet at Miaoxun Station'),
  ];

  useEffect(() => {
    const lineTimers = lineAnimations.map((animation, index) =>
      setTimeout(
        () => {
          Animated.timing(animation, {
            duration: 380,
            easing: Easing.out(Easing.cubic),
            toValue: 1,
            useNativeDriver: true,
          }).start();
        },
        index === 0 ? 160 : 160 + index * 720,
      ),
    );

    const dotLoops = dotAnimations.map((animation, index) => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.delay(index * 120),
          Animated.timing(animation, {
            duration: 640,
            easing: Easing.inOut(Easing.ease),
            toValue: 1,
            useNativeDriver: true,
          }),
          Animated.timing(animation, {
            duration: 640,
            easing: Easing.inOut(Easing.ease),
            toValue: 0,
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
      return loop;
    });

    return () => {
      lineTimers.forEach(clearTimeout);
      dotLoops.forEach(loop => loop.stop());
    };
  }, [dotAnimations, lineAnimations]);

  return (
    <View style={[styles.launchOverlay, { backgroundColor: palette.surface }]}>
      <View style={styles.launchCopy}>
        {lines.map((line, index) => (
          <Animated.Text
            key={line}
            style={[
              styles.launchLine,
              index === 2 && styles.launchLineEmphasis,
              {
                color: palette.text,
                opacity: lineAnimations[index],
                transform: [
                  {
                    translateY: lineAnimations[index].interpolate({
                      inputRange: [0, 1],
                      outputRange: [10, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            {line}
          </Animated.Text>
        ))}
      </View>
      <Text style={[styles.launchCaption, { color: palette.secondaryText }]}>
        {textFor(
          language,
          '正在同步真实账号空间',
          'Syncing your real account space',
        )}
      </Text>
      <View style={styles.launchDots}>
        {[0, 1, 2].map(index => (
          <Animated.View
            key={index}
            style={[
              styles.launchDot,
              {
                backgroundColor: palette.mint,
                opacity: dotAnimations[index].interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.38, 1],
                }),
                transform: [
                  {
                    scale: dotAnimations[index].interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.62, 1],
                    }),
                  },
                ],
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}
