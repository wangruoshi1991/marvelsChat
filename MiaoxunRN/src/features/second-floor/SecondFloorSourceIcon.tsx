import React, { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

let nextAvatarId = 0;

/** The V15 Xun source tile: a compact 45px avatar with a cool slate gradient. */
export function SecondFloorXunSourceIcon({
  children,
}: {
  children: React.ReactNode;
}) {
  const gradientIdRef = useRef<string | null>(null);
  if (!gradientIdRef.current) {
    gradientIdRef.current = `second-floor-xun-avatar-${nextAvatarId++}`;
  }
  const gradientId = gradientIdRef.current;
  return (
    <View accessible={false} style={styles.avatar}>
      <Svg
        accessible={false}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        width={45}
        height={45}
        viewBox="0 0 45 45"
      >
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0.9" y2="1">
            <Stop offset="0" stopColor="#557488" />
            <Stop offset="1" stopColor="#222d42" />
          </LinearGradient>
        </Defs>
        <Rect width="45" height="45" rx="16" fill={`url(#${gradientId})`} />
      </Svg>
      <View pointerEvents="none" style={styles.content}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 45,
    height: 45,
    borderRadius: 16,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
