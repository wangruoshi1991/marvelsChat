export {
  MiaoxunApiError,
  buildApiUrl,
  buildRealtimeUrl,
  isAuthSessionError,
  setAuthSessionExpiredHandler,
} from './api/http';

import { appApi } from './api/appApi';
import { authApi } from './api/authApi';
import { avatar3dApi } from './api/avatar3dApi';
import { messageApi } from './api/messageApi';
import { notificationApi } from './api/notificationApi';
import { profileApi } from './api/profileApi';
import { socialApi } from './api/socialApi';
import { stationApi } from './api/stationApi';

export const apiClient = {
  ...authApi,
  ...avatar3dApi,
  ...appApi,
  ...socialApi,
  ...notificationApi,
  ...messageApi,
  ...profileApi,
  ...stationApi,
};
