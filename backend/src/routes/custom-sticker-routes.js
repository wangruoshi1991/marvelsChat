import express from 'express';
import { z } from 'zod';
import { createRateLimitMiddleware } from '../rate-limit-service.js';
import { createCustomSticker,deleteCustomSticker,listCustomStickers,maxCustomStickerBytes,readCustomSticker } from '../custom-sticker-service.js';
const uploadLimit=createRateLimitMiddleware({action:'custom_sticker.collect',limit:60,windowMs:3600000,message:'收藏请求过于频繁，请稍后重试。'});
const id=z.string().uuid();
export function registerCustomStickerRoutes(app,{authenticate,asyncHandler,createSticker=createCustomSticker,listStickers=listCustomStickers,deleteSticker=deleteCustomSticker,readSticker=readCustomSticker}) {
  app.get('/api/custom-stickers',authenticate,asyncHandler(async(req,res)=>{
    const {limit,before}=z.object({limit:z.coerce.number().int().min(1).max(100).default(100),before:id.optional()}).strict().parse(req.query);
    res.set('Cache-Control','private, no-store').json({data:await listStickers({userId:req.user.id,limit,before})});
  }));
  app.post('/api/custom-stickers/upload',authenticate,uploadLimit,express.raw({type:'application/octet-stream',limit:maxCustomStickerBytes,inflate:false}),asyncHandler(async(req,res)=>{
    const sticker=await createSticker({userId:req.user.id,idempotencyKey:id.parse(req.get('Idempotency-Key')),upload:{mimeType:req.get('X-Miaoxun-Sticker-Mime')||'',bytes:req.body}});
    res.set('Cache-Control','private, no-store').status(201).json({data:sticker});
  }));
  app.delete('/api/custom-stickers/:stickerId',authenticate,asyncHandler(async(req,res)=>{
    res.json({data:await deleteSticker({userId:req.user.id,stickerId:id.parse(req.params.stickerId)})});
  }));
  app.get('/api/custom-stickers/:stickerId/content',authenticate,asyncHandler(async(req,res)=>{
    const {sticker,content}=await readSticker({userId:req.user.id,stickerId:id.parse(req.params.stickerId)});
    res.set({'Content-Type':sticker.mimeType,'Content-Length':String(content.length),'Cache-Control':'private, no-store','Content-Disposition':'inline','X-Content-Type-Options':'nosniff'}).send(content);
  }));
}
