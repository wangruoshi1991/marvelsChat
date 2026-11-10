import { z } from "zod";
import { requireComicRenderContract } from "../ai-client-contract.js";
import { comicRenderService } from "../comic-render-service.js";
import { HttpError } from "../http-error.js";

const comicParams=z.object({comicDiaryId:z.string().uuid()}).strict();
const taskParams=z.object({taskId:z.string().uuid()}).strict();
const submission=z.object({idempotencyKey:z.string().min(8).max(160)}).strict();
const list=z.object({limit:z.coerce.number().int().min(1).max(50).default(30)}).strict();
const events=z.object({afterSequence:z.coerce.number().int().min(0).default(0),limit:z.coerce.number().int().min(1).max(100).default(50)}).strict();
const cancel=z.object({revision:z.number().int().min(1)}).strict();

export function registerComicRenderRoutes(app,{authenticate,asyncHandler,service=comicRenderService}) {
  app.post("/api/station/comic-diaries/:comicDiaryId/render-tasks",authenticate,requireComicRenderContract,asyncHandler(async(req,res)=>{
    const result=await service.createComicRenderTask({userId:req.user.id,...comicParams.parse(req.params),...submission.parse(req.body)});
    res.status(result.reused?200:201).json({data:result.task,reused:result.reused});
  }));
  app.get("/api/station/comic-diaries/:comicDiaryId/render-tasks",authenticate,requireComicRenderContract,asyncHandler(async(req,res)=>{
    res.json({data:await service.listComicRenderTasks({userId:req.user.id,...comicParams.parse(req.params),...list.parse(req.query)})});
  }));
  app.get("/api/station/comic-render-tasks/:taskId",authenticate,requireComicRenderContract,asyncHandler(async(req,res)=>{
    const task=await service.getComicRenderTask({userId:req.user.id,...taskParams.parse(req.params)});
    if(!task)throw new HttpError(404,"漫画生成任务不存在或不可访问。",{code:"COMIC_RENDER_NOT_FOUND"});
    res.json({data:task});
  }));
  app.get("/api/station/comic-render-tasks/:taskId/events",authenticate,requireComicRenderContract,asyncHandler(async(req,res)=>{
    res.json({data:await service.listComicRenderEvents({userId:req.user.id,...taskParams.parse(req.params),...events.parse(req.query)})});
  }));
  app.post("/api/station/comic-render-tasks/:taskId/cancel",authenticate,requireComicRenderContract,asyncHandler(async(req,res)=>{
    res.json({data:await service.cancelQueuedComicRenderTask({userId:req.user.id,...taskParams.parse(req.params),...cancel.parse(req.body)})});
  }));
}
