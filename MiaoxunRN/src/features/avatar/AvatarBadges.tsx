import React from 'react';
import { Text, View } from 'react-native';

import { AvatarConfigDTO } from '../../models/api';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { avatarAccentColors, normalizeAvatarConfig } from './avatarConfig';
import { MiaoShowAvatar } from './AvatarViews';

export function UserAvatar({
  text: _text,
  config,
  palette,
  small,
  size,
}: {
  text: string;
  config?: AvatarConfigDTO;
  palette: Palette;
  small?: boolean;
  size?: number;
}) {
  const resolvedConfig = normalizeAvatarConfig(config);
  const colors = avatarAccentColors[resolvedConfig.accent];
  const avatarSize = size || (small ? 36 : 48);
  const characterSize = Math.round(avatarSize * 1.875);
  return (
    <View
      style={[
        styles.avatar,
        small && styles.avatarSmall,
        {
          backgroundColor: colors.primary,
          borderColor: palette.border,
          borderRadius: size ? avatarSize / 2 : undefined,
          height: avatarSize,
          width: avatarSize,
        },
      ]}
    >
      <View
        style={[
          styles.avatarMiniCharacter,
          small && styles.avatarMiniCharacterSmall,
          size
            ? {
                height: Math.round(avatarSize * 1.46),
                marginTop: Math.round(avatarSize * 0.375),
                width: Math.round(avatarSize * 1.46),
              }
            : null,
        ]}
      >
        <MiaoShowAvatar
          config={{ ...resolvedConfig, action: 'stand' }}
          size={size ? characterSize : small ? 72 : 90}
        />
      </View>
      {resolvedConfig.accessory === 'spark' ? (
        <Text style={[styles.avatarAccent, { color: colors.secondary }]}>
          *
        </Text>
      ) : null}
    </View>
  );
}
