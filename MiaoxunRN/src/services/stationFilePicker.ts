import { NativeModules } from 'react-native';
import { StationFileAssetDTO } from '../models/api';
import { MiaoxunApiError } from './apiClient';

export type PickedStationFile = {
  uri: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  idempotencyKey: string;
};
const mimeTypes: Record<string, string> = {
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  json: 'application/json',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
};
const picker = () => {
  const module = NativeModules.MiaoxunDocumentPickerModule as
    | {
        pick(): Promise<PickedStationFile | null>;
        release(key: string): Promise<void>;
        upload(
          key: string,
          token: string,
          mimeType: string,
          filename: string,
        ): Promise<{ status: number; body: string }>;
      }
    | undefined;
  if (!module) throw new Error('当前设备暂不支持选择文件。');
  return module;
};
export const releaseStationFile = (file: PickedStationFile) =>
  picker().release(file.idempotencyKey);
export async function pickStationFile() {
  const file = await picker().pick();
  if (!file) return null;
  const mimeType =
    mimeTypes[file.originalFilename.split('.').pop()?.toLowerCase() || ''];
  if (!mimeType || file.byteSize > 256 * 1024 || file.byteSize <= 0) {
    await releaseStationFile(file);
    throw new Error(
      !mimeType
        ? '请选择UTF-8 TXT、MD、JSON、CSV或TSV文件。'
        : '请选择非空且不超过256KiB的文件。',
    );
  }
  return { ...file, mimeType };
}

export async function uploadStationFile(
  token: string,
  file: PickedStationFile,
) {
  const response = await picker().upload(
    file.idempotencyKey,
    token,
    file.mimeType,
    encodeURIComponent(file.originalFilename),
  );
  let envelope: {
    data?: StationFileAssetDTO;
    error?: { message?: string; code?: string; details?: { code?: string } };
  };
  try {
    envelope = JSON.parse(response.body);
  } catch {
    throw new Error('上传结果无法确认，请重试。');
  }
  if (response.status < 200 || response.status >= 300)
    throw new MiaoxunApiError(envelope.error?.message || '文件上传失败。', {
      status: response.status,
      code: envelope.error?.details?.code ?? envelope.error?.code,
      details: envelope.error?.details,
    });
  if (
    !envelope.data?.id ||
    envelope.data.status !== 'processed' ||
    !envelope.data.reference
  )
    throw new Error('文件尚未完成解析，请重试。');
  return envelope.data;
}
