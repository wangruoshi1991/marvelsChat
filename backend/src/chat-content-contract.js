import { z } from 'zod';

const plain = max => z.string().trim().min(0).max(max).refine(value =>
  // eslint-disable-next-line no-control-regex -- Reject hidden data instead of silently changing a proposal.
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) && !/<\/?[a-z][^>]*>/i.test(value));
export const comicFrameSchema = z.object({
  index:z.number().int().min(1).max(8),title:plain(80).min(1),scene:plain(220),caption:plain(220),
  dialogue:plain(160),mood:plain(40),camera:plain(40),mediaAssetIds:z.array(z.string().uuid()).max(4)
    .refine(ids=>new Set(ids).size===ids.length),
}).strict().refine(frame=>Boolean(frame.scene||frame.caption||frame.dialogue));
export const comicSnapshotSchema = z.object({title:plain(120).min(1),summary:plain(280).min(1),
  style:z.enum(['slice-of-life','cute','manga','storyboard']),frameCount:z.number().int().min(2).max(8),
  frames:z.array(comicFrameSchema).min(2).max(8),
}).strict().refine(s=>s.frames.length===s.frameCount && s.frames.every((f,i)=>f.index===i+1));
export const diarySnapshotSchema = z.object({title:plain(120).min(1),body:plain(20000).min(1),mood:plain(40)}).strict();
export const contentPreviewDecisionSchema = z.object({type:z.literal('content_preview'),kind:z.enum(['comic','diary']),
  reply:plain(2000).min(1),snapshot:z.union([comicSnapshotSchema,diarySnapshotSchema]),
}).strict().superRefine((v,c)=>{
  if(!(v.kind==='comic'?comicSnapshotSchema:diarySnapshotSchema).safeParse(v.snapshot).success)
    c.addIssue({code:z.ZodIssueCode.custom,path:['snapshot'],message:'Content branch mismatch'});
});
