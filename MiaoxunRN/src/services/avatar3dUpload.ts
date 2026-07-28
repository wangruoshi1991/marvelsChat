import { Avatar3DPhotoDTO } from '../models/api';
import { apiClient } from './apiClient';
import { PickedStationMedia } from './stationMediaPicker';

const supportedMimeTypes = new Set(['image/jpeg', 'image/png']);

export async function uploadAndValidateAvatar3dPhoto({
  token,
  media,
}: {
  token: string;
  media: PickedStationMedia;
}): Promise<Avatar3DPhotoDTO> {
  if (!supportedMimeTypes.has(media.mimeType)) {
    throw new Error('请选择 JPG 或 PNG 格式的正面照片。');
  }

  const fileResponse = await fetch(media.uri);
  if (!fileResponse.ok) {
    throw new Error('无法读取所选照片，请重新选择。');
  }
  const blob = await fileResponse.blob();
  const byteSize = media.byteSize || blob.size;
  if (!byteSize) {
    throw new Error('无法读取照片大小，请重新选择。');
  }

  const prepared = await apiClient.prepareAvatar3dPhoto(token, {
    originalFilename: media.originalFilename,
    mimeType: media.mimeType as 'image/jpeg' | 'image/png',
    byteSize,
  });

  try {
    const uploadResponse = await fetch(prepared.upload.url, {
      body: blob,
      headers: prepared.upload.headers,
      method: prepared.upload.method,
    });
    if (!uploadResponse.ok) {
      throw new Error(`照片上传失败：${uploadResponse.status}`);
    }
    return await apiClient.completeAvatar3dPhoto(token, prepared.photo.id);
  } catch (error) {
    await apiClient
      .deleteAvatar3dPhoto(token, prepared.photo.id)
      .catch(() => undefined);
    throw error;
  }
}
