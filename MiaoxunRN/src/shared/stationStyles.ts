import { stationAgentStyles } from './stationStyles/stationAgentStyles';
import { stationAvatarStyles } from './stationStyles/stationAvatarStyles';
import { stationContentStyles } from './stationStyles/stationContentStyles';
import { stationLayoutStyles } from './stationStyles/stationLayoutStyles';
import { stationProfileStyles } from './stationStyles/stationProfileStyles';

export const stationStyles = {
  ...stationAgentStyles,
  ...stationAvatarStyles,
  ...stationContentStyles,
  ...stationLayoutStyles,
  ...stationProfileStyles,
} as const;
