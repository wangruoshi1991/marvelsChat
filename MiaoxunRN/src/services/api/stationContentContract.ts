import type { StationContentDTO } from '../../models/api';
import { MiaoxunApiError } from './http';

const stationContentArrayFields = [
  'posts',
  'diaryEntries',
  'albums',
  'mediaAssets',
  'outfits',
  'siteDrafts',
  'fileAssets',
  'comicDiaries',
  'videoDrafts',
] as const satisfies readonly (keyof StationContentDTO)[];

export function assertStationContentContract(
  value: unknown,
  source: string,
): asserts value is StationContentDTO {
  const record =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  const invalidFields = record
    ? stationContentArrayFields.filter(field => !Array.isArray(record[field]))
    : [...stationContentArrayFields];

  if (invalidFields.length === 0) {
    return;
  }

  throw new MiaoxunApiError(
    '服务端小站数据与当前 App 版本不匹配，请联系管理员更新服务端。',
    {
      code: 'STATION_CONTENT_CONTRACT_MISMATCH',
      details: { invalidFields, source },
    },
  );
}
