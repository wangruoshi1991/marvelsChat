import { z } from 'zod';
import { requireChatContentContract } from '../ai-client-contract.js';
import { chatContentPreviewService,chatContentConfirmationSchema,chatContentRejectionSchema } from '../chat-content-preview-service.js';

export function registerChatContentPreviewRoutes(app,{authenticate,asyncHandler,service=chatContentPreviewService}) {
  const guard=[authenticate,requireChatContentContract];
  const id=req=>z.string().uuid().parse(req.params.id);
  app.get('/api/chat-content-previews/:id',...guard,asyncHandler(async(req,res)=>{
    res.json({data:await service.getPreview({userId:req.user.id,previewId:id(req)})});
  }));
  app.post('/api/chat-content-previews/:id/confirm',...guard,asyncHandler(async(req,res)=>{
    res.json({data:await service.confirm({userId:req.user.id,previewId:id(req),...chatContentConfirmationSchema.parse(req.body)})});
  }));
  app.post('/api/chat-content-previews/:id/reject',...guard,asyncHandler(async(req,res)=>{
    res.json({data:await service.reject({userId:req.user.id,previewId:id(req),...chatContentRejectionSchema.parse(req.body)})});
  }));
}
