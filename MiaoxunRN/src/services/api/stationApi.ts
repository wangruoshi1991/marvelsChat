import { stationAgentApi } from './stationAgentApi';
import { stationContentApi } from './stationContentApi';
import { stationPointsApi } from './stationPointsApi';

export const stationApi = {
  ...stationContentApi,
  ...stationAgentApi,
  ...stationPointsApi,
};
