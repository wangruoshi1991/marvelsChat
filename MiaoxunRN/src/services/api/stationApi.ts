import { homepageApi } from './homepageApi';
import { stationAgentApi } from './stationAgentApi';
import { stationContentApi } from './stationContentApi';

export const stationApi = {
  ...homepageApi,
  ...stationContentApi,
  ...stationAgentApi,
};
