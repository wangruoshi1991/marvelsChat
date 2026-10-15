import {
  assertSiteDocument,
  collectSiteDocumentReferences,
  SiteDocument,
} from '../../../shared/site-document';
import { StationDiaryEntryDTO, StationMediaAssetDTO } from './api';

export type SiteDocumentView = {
  document: SiteDocument;
  documentHash: string;
  resourcesHash: string;
  mediaAssets: StationMediaAssetDTO[];
  diaryEntries: StationDiaryEntryDTO[];
};

export function assertSiteDocumentView(
  value: unknown,
  documentId: string,
): asserts value is SiteDocumentView {
  const invalid = () => new Error('页面及素材数据无效，请刷新后重试。');
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw invalid();
  const view = value as SiteDocumentView;
  assertSiteDocument(view.document);
  if (
    view.document.documentId !== documentId ||
    typeof view.documentHash !== 'string' ||
    typeof view.resourcesHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(view.documentHash) ||
    !/^[a-f0-9]{64}$/.test(view.resourcesHash) ||
    !Array.isArray(view.mediaAssets) ||
    !Array.isArray(view.diaryEntries)
  )
    throw invalid();
  const refs = collectSiteDocumentReferences(view.document);
  const exactIds = (items: Array<{ id: string }>, ids: string[]) =>
    items.length === ids.length &&
    new Set(items.map(item => item.id)).size === ids.length &&
    items.every(item => ids.includes(item.id));
  if (
    !view.mediaAssets.every(
      item =>
        item &&
        typeof item.id === 'string' &&
        ['image', 'video'].includes(item.kind) &&
        item.status === 'uploaded' &&
        typeof item.caption === 'string' &&
        typeof item.originalFilename === 'string',
    ) ||
    !view.diaryEntries.every(
      item =>
        item &&
        typeof item.id === 'string' &&
        typeof item.title === 'string' &&
        typeof item.body === 'string' &&
        typeof item.mood === 'string',
    ) ||
    !exactIds(view.mediaAssets, refs.assetIds) ||
    !exactIds(view.diaryEntries, refs.diaryEntryIds)
  )
    throw invalid();
}
