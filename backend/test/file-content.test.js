import assert from 'node:assert/strict';
import test from 'node:test';
import { parseUploadedText, fileReference } from '../src/file-content.js';
const parse = (content, overrides = {}) => parseUploadedText({ originalFilename: 'notes.md', mimeType: 'text/markdown', bytes: Buffer.from(content), ...overrides });
test('UTF-8 source preserves the complete body and rejects invalid bytes, oversized text and unsupported containers', () => {
  const content = '# 文档\n' + '正文😀'.repeat(3000);
  assert.equal(parse(content).content, content);
  for (const [bytes, code] of [[Buffer.from([0xff]), 'FILE_UTF8_INVALID'], [Buffer.from('a\0b'), 'FILE_TEXT_INVALID'], [Buffer.alloc(262145, 97), 'FILE_TOO_LARGE'], [Buffer.from('字'.repeat(50001)), 'FILE_TEXT_TOO_LARGE']]) {
    assert.throws(() => parse('', { bytes }), error => error.details?.code === code);
  }
  assert.throws(() => parse('fake pdf', { originalFilename: 'a.pdf', mimeType: 'application/pdf' }), error => error.status === 415);
  assert.throws(() => parse('abc', { originalFilename: '../secret.txt' }), error => error.details?.code === 'FILE_NAME_INVALID');
  assert.throws(() => parse('abc', { mimeType: 'application/pdf' }), error => error.status === 415);
});
test('source versions include text beyond preview, parser and owner-resolved identity, legacy records cannot be referenced', () => {
  const row = { id: 'file', status: 'processed', original_filename: 'a.txt', mime_type: 'text/plain', checksum_sha256: 'original', extracted_text: 'a'.repeat(2000), parse_version: 'utf8-text-v1' };
  assert.notEqual(fileReference(row).version, fileReference({ ...row, extracted_text: row.extracted_text + 'changed' }).version);
  assert.equal(fileReference({ ...row, extracted_text: null }), null);
  assert.equal(fileReference({ ...row, deleted_at: new Date() }), null);
});

test('long original filenames keep the upload identity but reference titles fit the public contract', () => {
  const row = { id: 'file', status: 'processed', original_filename: 'a'.repeat(176) + '.txt', mime_type: 'text/plain', checksum_sha256: 'hash', extracted_text: '正文', parse_version: 'utf8-text-v1' };
  assert.equal(fileReference(row).title.length, 160);
  assert.equal(row.original_filename.length, 180);
  const parsed = parse('\ufeff保留BOM');
  assert.equal(parsed.content.charCodeAt(0), 0xfeff);
});

test('UTF-16 title limits never split an emoji surrogate pair and invalid filename Unicode fails explicitly', () => {
  const row = { id: 'file', status: 'processed', original_filename: 'a'.repeat(159) + '😀.md', mime_type: 'text/markdown', checksum_sha256: 'hash', extracted_text: '正文', parse_version: 'utf8-text-v1' };
  assert.equal(fileReference(row).title, 'a'.repeat(159));
  const title = fileReference({ ...row, original_filename: 'a'.repeat(158) + '😀.md' }).title;
  assert.equal(title, 'a'.repeat(158) + '😀');
  assert.equal(Buffer.from(title).toString(), title);
  assert.throws(() => parse('text', { originalFilename: 'invalid\ud800.md' }), error => error.details?.code === 'FILE_NAME_INVALID');
});
