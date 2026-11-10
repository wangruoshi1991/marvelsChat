export const comicImageRejectionStatuses = Object.freeze({
  COMIC_IMAGE_PROVIDER_REJECTED: 502,
  COMIC_IMAGE_PROVIDER_RATE_LIMITED: 503,
  COMIC_IMAGE_PROVIDER_AUTH_FAILED: 503,
  COMIC_IMAGE_PROVIDER_CONTENT_REJECTED: 422,
});

// Only verified adapters can identify explicit remote rejection. Ordinary
// exceptions do not prove that a dispatched request was not accepted.
export class ComicImageProviderRejection extends Error {
  constructor(code) {
    if (!Object.hasOwn(comicImageRejectionStatuses, code)) throw new TypeError('Unsupported comic Provider rejection code.');
    super('图片供应商明确拒绝了本次请求。');
    this.name = 'ComicImageProviderRejection';
    Object.defineProperty(this, 'code', { value: code, enumerable: true, writable: false, configurable: false });
  }
}
