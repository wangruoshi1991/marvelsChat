import { MiaoPointLedgerEntryDTO } from '../../models/api';
import { request } from './http';

export const stationPointsApi = {
  listMiaoPointLedger(token: string, limit = 80) {
    return request<MiaoPointLedgerEntryDTO[]>(
      `/api/me/miao-points?limit=${limit}`,
      { token },
    );
  },
};
