import { stationAgentApi } from './stationAgentApi';
import { stationContentApi } from './stationContentApi';

export const stationApi = {
  ...stationContentApi,
  ...stationAgentApi,
};
