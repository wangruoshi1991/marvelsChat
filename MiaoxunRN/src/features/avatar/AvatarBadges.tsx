import React from 'react';
import { Image, Text, View } from 'react-native';

import { AvatarConfigDTO } from '../../models/api';
import { styles } from '../../shared/styles';
import { avatarPlateColor, Palette } from '../../shared/theme';

/**
 * The prototype renders identity avatars as a letter on a tinted disc —
 * `.xun-avatar` is `44px`, white text at `.72rem`/`800`, and `.me-agent-avatar`
 * is the same shape. It never draws a character: the previous implementation
 * generated one procedurally from `avatarConfig` and dropped `text` entirely.
 *
 * So this renders the initial of the account's `avatarText` (the server already
 * stores `left(display_name, 1)`), on one default plate, and prefers a real
 * uploaded image whenever the server supplies one. `config` is still accepted so
 * existing call sites keep compiling, but it no longer decides anything here.
 */
export function UserAvatar({
  text,
  imageUrl,
  small,
  size,
}: {
  text: string;
  /** An uploaded avatar beats the generated default whenever it exists. */
  imageUrl?: string | null;
  config?: AvatarConfigDTO;
  palette: Palette;
  small?: boolean;
  size?: number;
}) {
  const avatarSize = size || (small ? 36 : 48);
  const initial = firstGlyph(text);

  return (
    <View
      style={[
        styles.avatar,
        small && styles.avatarSmall,
        styles.avatarRing,
        {
          backgroundColor: avatarPlateColor(text || '妙'),
          borderRadius: avatarSize / 2,
          height: avatarSize,
          width: avatarSize,
        },
      ]}
    >
      {imageUrl ? (
        <Image
          accessibilityIgnoresInvertColors
          resizeMode="cover"
          source={{ uri: imageUrl }}
          style={{
            borderRadius: avatarSize / 2,
            height: avatarSize,
            width: avatarSize,
          }}
        />
      ) : (
        <Text
          numberOfLines={1}
          style={[
            styles.avatarInitial,
            { fontSize: Math.round(avatarSize * 0.4) },
          ]}
        >
          {initial}
        </Text>
      )}
    </View>
  );
}

/**
 * `avatarText` may be blank on an account that never set one, and a nickname
 * with a surrogate pair or a leading space would otherwise yield a broken or
 * invisible glyph, so the first real character is taken by code point.
 */
export function firstGlyph(value: string) {
  const trimmed = (value || '').trim();
  if (!trimmed) return '';
  return Array.from(trimmed)[0];
}
