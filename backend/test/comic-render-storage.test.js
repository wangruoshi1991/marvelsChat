import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { normalizeComicImage, createComicRenderStorage } from '../src/comic-render-storage.js';

test('image validation rejects HTML, wrong MIME and oversized data before persistence', async () => {
  for (const value of [
    { bytes: Buffer.from('<html>'), mimeType: 'image/png' },
    { bytes: Buffer.alloc(16 * 1024 * 1024 + 1), mimeType: 'image/png' },
    { bytes: await sharp({ create: { width: 2, height: 2, channels: 3, background: '#fff' } }).png().toBuffer(), mimeType: 'image/jpeg' },
  ]) await assert.rejects(() => normalizeComicImage(value), e => e.details.code === 'COMIC_IMAGE_BYTES_INVALID');
});

test('image normalization strips metadata and bounds the private output size', async () => {
  const bytes = await sharp({ create: { width: 2400, height: 100, channels: 3, background: '#ff0000' } }).withMetadata().png().toBuffer();
  const result = await normalizeComicImage({ bytes, mimeType: 'image/png' });
  assert.equal(result.mimeType, 'image/webp');
  assert.equal(result.width, 2048);
  const metadata = await sharp(result.bytes).metadata();
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.icc, undefined);
});

function fixture({ failCommit = false, failDelete = false } = {}) {
  const events = [];
  let journalState = 'pending';
  const query = async (sql) => {
    if (sql.includes('SELECT state')) return [{ state: journalState }];
    if (sql.includes("SET state = 'cleanup_required'")) { journalState = 'cleanup_required'; return [{ id: 'journal' }]; }
    events.push(sql.startsWith('DELETE') ? 'journal-deleted' : 'query');
    return [];
  };
  let transactions = 0;
  const storage = createComicRenderStorage({
    bucket: 'test-bucket', query,
    transaction: async work => {
      transactions++;
      if (failCommit && transactions === 2) throw new Error('private-database-error');
      return work({ query: async sql => {
        if (sql.includes('SELECT id FROM ai_tasks')) return [{ id: 'task' }];
        if (sql.includes("SET status = 'uploaded'")) return [{ id: 'asset' }];
        if (sql.includes("SET state = 'stored'")) journalState = 'stored';
        events.push('transaction'); return [];
      } });
    },
    putObject: async () => events.push('put'),
    inspectObject: async ({ expectedBytes }) => ({ contentType: 'image/webp', contentLength: expectedBytes }),
    deleteObject: async () => { events.push('delete'); if (failDelete) throw new Error('secret-storage-error'); },
    bindAsset: async () => events.push('bind'),
  });
  return { storage, events, getState: () => journalState };
}
const image = async () => ({ bytes: await sharp({create:{width:2,height:2,channels:3,background:'#fff'}}).png().toBuffer(), mimeType:'image/png' });
const identity = { userId: 'owner', taskId: 'task', claimToken: 'claim', frameIndex: 1 };

test('private storage verifies upload then binds asset, with no indexing side effect', async () => {
  const { storage, events, getState } = fixture();
  const result = await storage.storeComicFrame({ ...identity, ...await image() });
  assert.ok(result.mediaAssetId);
  assert.equal(getState(), 'stored');
  assert.ok(events.indexOf('put') < events.indexOf('bind'));
  assert.equal(events.includes('delete'), false);
});

test('failed final transaction persists cleanup intent and attempts safe deletion', async () => {
  const { storage, events, getState } = fixture({ failCommit: true, failDelete: true });
  const input = { ...identity, ...await image() };
  await assert.rejects(() => storage.storeComicFrame(input));
  assert.equal(getState(), 'cleanup_required');
  assert.ok(events.includes('delete'));
});

test('unreadable finalization journal is an unknown outcome and never deletes a potentially committed image',async()=>{
  let transactions=0,deletes=0;
  const storage=createComicRenderStorage({bucket:'test',
    transaction:async work=>{
      if(++transactions===2)throw new Error('COMMIT response lost');
      return work({query:async sql=>sql.includes('SELECT id FROM ai_tasks')?[{id:'task'}]:[]});
    },query:async()=>{throw new Error('database disconnected');},
    putObject:async()=>{},inspectObject:async({expectedBytes})=>({contentType:'image/webp',contentLength:expectedBytes}),
    deleteObject:async()=>{deletes++;},
  });
  const input={...identity,...await image()};
  await assert.rejects(()=>storage.storeComicFrame(input),error=>error.outcomeUnknown===true&&error.details.code==='COMIC_STORAGE_OUTCOME_UNKNOWN');
  assert.equal(deletes,0);
});

test('selected private images preserve the frame reference order',async()=>{
  const bytes=(await image()).bytes;
  const storage=createComicRenderStorage({
    query:async()=>[{id:'second',mime_type:'image/png',storage_key:'second'},{id:'first',mime_type:'image/png',storage_key:'first'}],
    fetchObject:async()=>new Response(bytes),
  });
  const images=await storage.readSelectedImages({userId:'owner',mediaAssetIds:['first','second']});
  assert.deepEqual(images.map(item=>item.id),['first','second']);
});
