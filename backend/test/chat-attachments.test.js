import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import sharp from 'sharp';
import {normalizeChatUpload,chatAudioDuration,resolveChatAttachmentsForMessage} from '../src/chat-attachment-service.js';
import {publicMessage} from '../src/public-message.js';
const box=(type,...payload)=>{const body=Buffer.concat(payload),head=Buffer.alloc(8);head.writeUInt32BE(body.length+8);head.write(type,4,'ascii');return Buffer.concat([head,body]);};
const m4a=(duration=24000,handler='soun')=>{const mdhd=Buffer.alloc(24);mdhd.writeUInt32BE(24000,12);mdhd.writeUInt32BE(duration,16);const hdlr=Buffer.alloc(20);hdlr.write(handler,8);return Buffer.concat([box('ftyp',Buffer.from('M4A \0\0\0\0isom')),box('moov',box('trak',box('mdia',box('mdhd',mdhd),box('hdlr',hdlr)))),box('mdat',Buffer.from('test-only-aac-bytes'))]);};
test('chat image upload decodes and strips source metadata into bounded JPEG',async()=>{
 const source=await sharp({create:{width:80,height:60,channels:3,background:'#88aaaa'}}).png().withMetadata({exif:{IFD0:{Artist:'private-source'}}}).toBuffer();
 const result=await normalizeChatUpload({kind:'image',filename:'photo.png',mimeType:'image/png',bytes:source});
 assert.equal(result.mimeType,'image/jpeg');assert.equal(result.filename,'photo.jpg');
 const metadata=await sharp(result.content).metadata();assert.equal(metadata.width,80);assert.equal(metadata.exif,undefined);
 await assert.rejects(normalizeChatUpload({kind:'image',filename:'bad.png',mimeType:'image/png',bytes:Buffer.from('not-an-image')}),error=>error.status===415);
});
test('chat uploads reject path names, binary masquerading as text and oversized bytes',async()=>{
 await assert.rejects(normalizeChatUpload({kind:'file',filename:'../secret.txt',mimeType:'text/plain',bytes:Buffer.from('text')}),error=>error.status===400);
 await assert.rejects(normalizeChatUpload({kind:'file',filename:'file.txt',mimeType:'text/plain',bytes:Buffer.from([255,0])}),error=>error.status===400);
 await assert.rejects(normalizeChatUpload({kind:'audio',filename:'clip.m4a',mimeType:'audio/mp4',bytes:Buffer.alloc(8388609)}),error=>error.status===413);
});
test('audio duration is measured from the M4A track, not a client-provided display value',async()=>{
 assert.equal(chatAudioDuration(m4a()),1000);
 assert.equal((await normalizeChatUpload({kind:'audio',filename:'voice.m4a',mimeType:'audio/mp4',bytes:m4a(24000*59)})).durationMs,59000);
 assert.throws(()=>chatAudioDuration(m4a(24000*62)),error=>error.status===415);
 assert.throws(()=>chatAudioDuration(m4a(24000,'vide')),error=>error.status===415);
 assert.throws(()=>chatAudioDuration(Buffer.from('wrong')),error=>error.status===415);
});
test('attachment resolution refuses cross-owner/thread ids and duplicate ids',async()=>{
 const id=crypto.randomUUID();
 await assert.rejects(resolveChatAttachmentsForMessage({userId:'owner',threadId:'thread',attachmentIds:[id,id]}),error=>error.status===400);
 let queries=0;
 await assert.rejects(resolveChatAttachmentsForMessage({userId:'owner',threadId:'thread',attachmentIds:[id],queryFn:async(sql,args)=>{queries++;if(queries===1)return [{id:'thread',agent_id:null}];assert.deepEqual(args,[24,id,'owner','thread']);return [];}}),error=>error.status===404);
 await assert.rejects(resolveChatAttachmentsForMessage({userId:'owner',threadId:'thread',attachmentIds:[id],queryFn:async()=>[{agent_id:'miaoxun-butler'}]}),error=>error.details.code==='AGENT_ATTACHMENT_REFERENCE_REQUIRED');
});
test('public message projects only canonical attachment fields and removes them on recall/deletion',()=>{
 const id=crypto.randomUUID();const attachment={id,kind:'contact',filename:'friend',title:'friend',byteSize:0,mimeType:null,durationMs:null,downloadPath:'https://evil.invalid',content:'private-bytes',data:{userId:'friend-id',name:'friend',aiId:'9001',email:'private'}};
 const value={id:'message',threadId:'thread',content:'card',metadata:{attachments:[attachment],privateToken:'secret'}};
 assert.deepEqual(publicMessage(value).metadata.attachments,[{id,kind:'contact',filename:'friend',title:'friend',byteSize:0,mimeType:null,durationMs:null,downloadPath:null,data:{userId:'friend-id',name:'friend',aiId:'9001'}}]);
 assert.equal(publicMessage({...value,recalledAt:new Date().toISOString()}).metadata.attachments,undefined);
 assert.equal(publicMessage({...value,deletedAt:new Date().toISOString()}).metadata.attachments,undefined);
});
