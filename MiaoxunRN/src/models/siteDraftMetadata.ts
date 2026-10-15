import type { StationSiteDraftDTO } from './api';

// Lists contain metadata only. The document endpoint separately checks access
// to draft content and its complete provenance before returning a preview.
export function isStationSiteDraftMetadata(
  value: unknown,
): value is StationSiteDraftDTO {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  const keys = ['id', 'title', 'source', 'status', 'createdAt', 'updatedAt'];
  const date = (v: unknown) =>
    v === null || (typeof v === 'string' && Number.isFinite(Date.parse(v)));
  return (
    Object.keys(item).length === keys.length &&
    keys.every(key => key in item) &&
    typeof item.id === 'string' &&
    Boolean(item.id.trim()) &&
    typeof item.title === 'string' &&
    Boolean(item.title.trim()) &&
    item.title.length <= 160 &&
    item.source === 'model' &&
    ['draft', 'applied', 'archived'].includes(String(item.status)) &&
    date(item.createdAt) &&
    date(item.updatedAt)
  );
}

export function assertStationSiteDraftList(
  value: unknown,
): asserts value is StationSiteDraftDTO[] {
  if (
    !Array.isArray(value) ||
    value.length > 50 ||
    !value.every(isStationSiteDraftMetadata) ||
    new Set(value.map(item => item.id)).size !== value.length
  )
    throw new Error('页面草稿列表格式不受支持，请刷新或联系管理员完成升级。');
}
