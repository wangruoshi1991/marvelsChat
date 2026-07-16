export {
  API_BASE_URL,
  MiaoxunApiError,
  buildApiUrl,
  buildRealtimeUrl,
  isAuthSessionError,
  resolvePublicUrl,
  setAuthSessionExpiredHandler,
} from './api/http';

import { appApi } from './api/appApi';
import { authApi } from './api/authApi';
import { messageApi } from './api/messageApi';
import { notificationApi } from './api/notificationApi';
import { profileApi } from './api/profileApi';
import { socialApi } from './api/socialApi';
import { stationApi } from './api/stationApi';

export const apiClient = {
  ...authApi,
  ...appApi,
  ...socialApi,
  ...notificationApi,
  ...messageApi,
  ...profileApi,
  ...stationApi,
};
