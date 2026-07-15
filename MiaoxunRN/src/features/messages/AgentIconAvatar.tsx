import React from 'react';
import {Image, View} from 'react-native';

import {AgentIdentityDTO} from '../../models/api';
import {styles} from '../../shared/styles';
import {Palette} from '../../shared/theme';
import {resolveAgentThreadIcon} from './threadIconRegistry';

export function AgentIconAvatar({
  agentId,
  category,
  identity,
  palette,
  small,
}: {
  agentId: string;
  category?: string | null;
  identity: AgentIdentityDTO | null;
  palette: Palette;
  small?: boolean;
}) {
  const iconSpec = resolveAgentThreadIcon(agentId, category);
  const Icon = iconSpec.Icon;
  const colors = identity?.colors || {
    background: palette.soft,
    foreground: palette.text,
    accent: palette.rose,
  };
  const avatarBackgroundColor = iconSpec.imageSource
    ? 'transparent'
    : colors.background;

  return (
    <View
      style={[
        styles.threadIconAvatar,
        small && styles.threadIconAvatarSmall,
        {
          backgroundColor: avatarBackgroundColor,
          borderColor: palette.border,
        },
      ]}
    >
      {iconSpec.imageSource ? (
        <Image
          source={iconSpec.imageSource}
          style={[
            styles.threadIconImage,
            small && styles.threadIconImageSmall,
          ]}
          resizeMode="contain"
        />
      ) : Icon ? (
        <Icon
          color={colors.foreground}
          size={small ? 18 : 25}
          strokeWidth={2.35}
        />
      ) : null}
    </View>
  );
}
