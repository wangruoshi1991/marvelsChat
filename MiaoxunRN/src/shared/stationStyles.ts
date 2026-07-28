import { stationAgentStyles } from './stationStyles/stationAgentStyles';
import { stationAvatarStyles } from './stationStyles/stationAvatarStyles';
import { stationContentStyles } from './stationStyles/stationContentStyles';
import { stationLayoutStyles } from './stationStyles/stationLayoutStyles';
import { stationPointStyles } from './stationStyles/stationPointStyles';
import { stationPostStyles } from './stationStyles/stationPostStyles';
import { stationProfileStyles } from './stationStyles/stationProfileStyles';

export const stationStyles = {
  ...stationAgentStyles,
  ...stationAvatarStyles,
  ...stationContentStyles,
  ...stationLayoutStyles,
  ...stationPointStyles,
  ...stationPostStyles,
  ...stationProfileStyles,
} as const;
