import { StationMediaAssetDTO } from '../models/api';
import { apiClient } from './apiClient';
import { PickedStationMedia } from './stationMediaPicker';

export async function uploadStationMediaAsset({
  token,
  asset,
  media,
}: {
  token: string;
  asset: StationMediaAssetDTO;
  media: PickedStationMedia;
}) {
  try {
    const prepared = await apiClient.createStationMediaUploadUrl(
      token,
      asset.id,
      {
        mimeType: media.mimeType,
        byteSize: media.byteSize,
      },
    );
    const fileResponse = await fetch(media.uri);
    const blob = await fileResponse.blob();
    const uploadResponse = await fetch(prepared.upload.url, {
      method: prepared.upload.method,
      headers: prepared.upload.headers,
      body: blob,
    });

    if (!uploadResponse.ok) {
      throw new Error('upload_failed');
    }

    return apiClient.completeStationMediaUpload(token, asset.id, {
      storageKey: prepared.upload.objectKey,
    });
  } catch {
    throw new Error('照片上传失败，请重试。');
  }
}
