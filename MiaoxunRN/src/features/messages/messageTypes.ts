import React from 'react';

import { AvatarConfigDTO } from '../../models/api';

export type MessageTab = 'chat' | 'notice';

export type UserAvatarRenderer = (props: {
  text: string;
  config?: AvatarConfigDTO;
  small?: boolean;
  size?: number;
}) => React.ReactNode;
