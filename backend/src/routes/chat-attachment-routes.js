import express from 'express';
import { z } from 'zod';
import { HttpError } from '../http-error.js';
import { createRateLimitMiddleware } from '../rate-limit-service.js';
import { createChatAttachment, maxChatAttachmentBytes, readChatAttachment } from '../chat-attachment-service.js';
const structuredSchema = z.discriminatedUnion('kind', [
  z.object({ kind:z.literal('location'), latitude:z.number().min(-90).max(90), longitude:z.number().min(-180).max(180), label:z.string().trim().max(160).optional() }).strict(),
  z.object({ kind:z.literal('contact'), userId:z.string().uuid() }).strict(),
  z.object({ kind:z.literal('task'), taskId:z.string().uuid(), taskKind:z.enum(['workspace','ai']) }).strict(),
]);
const rateLimit = createRateLimitMiddleware({ action:'chat.attachment.upload', limit:60, windowMs:60*60*1000, message:'附件请求过于频繁，请稍后重试。' });
export function registerChatAttachmentRoutes(app, { authenticate, asyncHandler, createAttachment=createChatAttachment, readAttachment=readChatAttachment }) {
  app.post('/api/threads/:threadId/attachments/upload', authenticate, rateLimit,
    express.raw({ type:'application/octet-stream', limit:maxChatAttachmentBytes, inflate:false }), asyncHandler(async(req,res)=>{
      let filename;
      try { filename=decodeURIComponent(req.get('X-Miaoxun-Filename') || ''); }
      catch { throw new HttpError(400,'附件名称无效。'); }
      const attachment=await createAttachment({ userId:req.user.id,threadId:z.string().uuid().parse(req.params.threadId),
        idempotencyKey:z.string().uuid().parse(req.get('Idempotency-Key')),
        upload:{ kind:z.enum(['image','audio','file']).parse(req.get('X-Miaoxun-Attachment-Kind')), filename,
          mimeType:req.get('X-Miaoxun-Attachment-Mime') || '',bytes:req.body } });
      res.status(201).json({data:attachment});
    }));
  app.post('/api/threads/:threadId/attachments',authenticate,rateLimit,asyncHandler(async(req,res)=>{
    const attachment=await createAttachment({userId:req.user.id,threadId:z.string().uuid().parse(req.params.threadId),
      idempotencyKey:z.string().uuid().parse(req.get('Idempotency-Key')),structured:structuredSchema.parse(req.body)});
    res.status(201).json({data:attachment});
  }));
  app.get('/api/chat-attachments/:attachmentId/content',authenticate,asyncHandler(async(req,res)=>{
    const {attachment,content}=await readAttachment({userId:req.user.id,attachmentId:z.string().uuid().parse(req.params.attachmentId)});
    res.set({'Content-Type':attachment.mimeType,'Content-Length':String(content.length),'Cache-Control':'private, no-store',
      'Content-Disposition':`inline; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`,'X-Content-Type-Options':'nosniff'});
    res.send(content);
  }));
}
