import React from 'react';

import {AgentIdentityDTO, AvatarConfigDTO} from '../../models/api';

export type MessageTab = 'chat' | 'notice';

export type UserAvatarRenderer = (props: {
  text: string;
  config?: AvatarConfigDTO;
  small?: boolean;
}) => React.ReactNode;

export type AgentAvatarRenderer = (props: {
  identity: AgentIdentityDTO | null;
  small?: boolean;
}) => React.ReactNode;
