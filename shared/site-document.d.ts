export type SiteDocumentResourceAction = {
  kind: 'view-media' | 'view-diary';
  label: string;
  targetId: string;
};
export type SiteDocumentInteractionIntent = {
  kind: 'interaction-intent';
  intent: 'open-link' | 'compose-message' | 'follow-user';
  label: string;
  target: { kind: 'unresolved'; text: string };
};
export type SiteDocumentAction = SiteDocumentResourceAction | SiteDocumentInteractionIntent;
export type SiteDocumentSectionContent = {
  type: 'hero' | 'about' | 'gallery' | 'diary' | 'contact';
  title: string;
  subtitle: string;
  body: string;
  assetIds: string[];
  diaryEntryIds: string[];
  actions: SiteDocumentAction[];
};
export type SiteDocumentSection = SiteDocumentSectionContent & { id: string };
export type SiteDocumentContent = {
  language: 'zh' | 'en';
  theme: 'clean' | 'warm' | 'gallery' | 'portfolio';
  title: string;
  summary: string;
  sections: SiteDocumentSectionContent[];
};
export type SiteDocument = Omit<SiteDocumentContent, 'sections'> & {
  schemaVersion: 2;
  documentId: string;
  revision: 1;
  visibility: 'private';
  sections: SiteDocumentSection[];
};
export class SiteDocumentValidationError extends Error {
  code: 'SITE_DOCUMENT_INVALID' | 'SITE_DOCUMENT_UNSUPPORTED';
  path: string;
  constructor(code: 'SITE_DOCUMENT_INVALID' | 'SITE_DOCUMENT_UNSUPPORTED', path: string, message: string);
}
export function assertSiteDocumentContent(value: unknown): asserts value is SiteDocumentContent;
export function assertSiteDocument(value: unknown): asserts value is SiteDocument;
export function collectSiteDocumentReferences(document: SiteDocumentContent): {
  assetIds: string[];
  diaryEntryIds: string[];
};
