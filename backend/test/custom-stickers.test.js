import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { messageSchema } from '../src/schemas.js';
import { messageRequestFingerprint } from '../src/message-request.js';
import { publicMessage } from '../src/public-message.js';
const id = crypto.randomUUID();
test('sticker messages require stable identity and exclude text and execution contexts', () => {
 const valid = { content:'', stickerId:id, clientMessageId:crypto.randomUUID() };
 assert.equal(messageSchema.safeParse(valid).success,true);
 for (const extra of [{content:'hello'}, {clientMessageId:undefined}, {attachmentIds:[id]}, {contextRefs:[{kind:'diary',id}]}, {clientContext:{currentPage:'messages'}}, {replyToMessageId:id}, {agentContextReset:false}, {butlerContextReset:false}, {workspaceContext:{}}, {contentPreviewContext:{id,revision:1}}]) assert.equal(messageSchema.safeParse({...valid,...extra}).success,false,JSON.stringify(extra));
 const parsed=messageSchema.parse(valid);
 assert.notEqual(messageRequestFingerprint(parsed),messageRequestFingerprint({...parsed,stickerId:crypto.randomUUID()}));
});
test('public sticker is a bounded canonical static image reference and is suppressed after recall/delete',()=>{
 const sticker={id,mimeType:'image/png',byteSize:60,width:40,height:30,downloadPath:'https://private.invalid',content:'secret',checksum:'secret'};
 const message={metadata:{sticker}};
 assert.deepEqual(publicMessage(message).metadata.sticker,{id,mimeType:'image/png',byteSize:60,width:40,height:30,downloadPath:`/api/custom-stickers/${id}/content`});
 for(const state of [{recalledAt:'now'},{deletedAt:'now'},{senderType:'agent'}]) assert.equal(publicMessage({...message,...state}).metadata.sticker,undefined);
 assert.equal(publicMessage({metadata:{sticker:{...sticker,mimeType:'image/gif'}}}).metadata.sticker,undefined);
});
test('custom sticker normalization retains PNG alpha, strips source EXIF and rejects GIF/video/corrupt bytes',async()=>{
 const {normalizeCustomStickerUpload}=await import('../src/custom-sticker-service.js');
 const bytes=await sharp({create:{width:30,height:20,channels:4,background:{r:1,g:2,b:3,alpha:0.5}}}).png().withMetadata().toBuffer();
 const normalized=await normalizeCustomStickerUpload({mimeType:'image/png',bytes});
 const metadata=await sharp(normalized.content).metadata();
 assert.equal(metadata.hasAlpha,true);assert.equal(metadata.exif,undefined);assert.equal(normalized.width,30);
 for(const mimeType of ['image/gif','video/mp4','text/plain']) await assert.rejects(normalizeCustomStickerUpload({mimeType,bytes}),error=>error.status===415);
 await assert.rejects(normalizeCustomStickerUpload({mimeType:'image/png',bytes:Buffer.from('bad')}),error=>error.status===415);
 await assert.rejects(normalizeCustomStickerUpload({mimeType:'image/png',bytes:Buffer.alloc(2097153)}),error=>error.status===413);
});
