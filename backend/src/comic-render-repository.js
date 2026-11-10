import crypto from "node:crypto";
import { z } from "zod";
import { getAgent } from "../../agents/registry.js";
import { assertCurrentAgentAccess } from "./ai-agent-access.js";
import { withTransaction } from "./db.js";
import { HttpError } from "./http-error.js";

const uuid = z.string().uuid();
const code = z.string().regex(/^[A-Za-z][A-Za-z0-9._-]{0,99}$/);
const frameSchema = z.object({
  index: z.number().int().min(1).max(8), title: z.string().max(80), scene: z.string().max(220),
  caption: z.string().max(220), dialogue: z.string().max(160), mood: z.string().max(40), camera: z.string().max(40),
  mediaAssetIds: z.array(uuid).max(4),
}).strict();
const framesSchema = z.array(frameSchema).min(2).max(8).refine(frames => frames.every((frame,index) => frame.index === index + 1));
const progressSchema=z.object({total:z.number().int().min(2).max(8),succeeded:z.number().int().min(0).max(8),failed:z.number().int().min(0).max(8),unknown:z.number().int().min(0).max(8)}).strict()
  .refine(value=>value.succeeded+value.failed+value.unknown<=value.total);
const iso = value => value instanceof Date ? value.toISOString() : value;
const json = JSON.stringify;
const error = (status, message, errorCode) => new HttpError(status, message, { code: errorCode });
const notFound = () => error(404, "漫画生成任务不存在或不可访问。", "COMIC_RENDER_NOT_FOUND");
const conflict = (message, errorCode = "COMIC_RENDER_STATE_CHANGED") => error(409, message, errorCode);
const taskFields = "*, clock_timestamp() AS database_now";
const predicate = "kind = 'comic_render' AND contract_version = 2";
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key,canonical(value[key])])) : value;
const hash = value => crypto.createHash("sha256").update(json(canonical(value))).digest("hex");
const progress = outputs => ({ total: outputs.length, succeeded: outputs.filter(o => o.status === "succeeded").length,
  failed: outputs.filter(o => o.status === "failed").length, unknown: outputs.filter(o => o.status === "unknown").length });

export function createComicRenderRepository({ withTransaction: transaction = withTransaction,
  loadAgent = getAgent, assertAccess = assertCurrentAgentAccess } = {}) {
  async function authorize(connection,userId,expectedVersion) {
    const agent = await loadAgent("comic-diary");
    if (!agent || !agent.permissions.includes("media:image:generate")) {
      throw error(403,"漫画 Agent 尚未声明图片生成权限。","COMIC_RENDER_SCOPE_REQUIRED");
    }
    if (expectedVersion && agent.version !== expectedVersion) throw error(403,"漫画 Agent 版本已变化，请重新确认权限。","COMIC_RENDER_AGENT_CHANGED");
    await assertAccess({userId,agent,grantedScopes:agent.permissions,contextRefs:[],queryFn:connection.query.bind(connection),lock:true});
    return agent;
  }
  async function readSnapshot(connection,userId,comicDiaryId,expectedVersion) {
    const agent = await authorize(connection,userId,expectedVersion);
    const [comic] = await connection.query(`SELECT *, updated_at::text AS source_revision FROM station_comic_diaries
      WHERE id = ? AND user_id = ? AND deleted_at IS NULL AND status <> 'deleted' FOR SHARE`,[comicDiaryId,userId]);
    if (!comic) throw notFound();
    const frames = framesSchema.parse(comic.frames);
    const selectedIds = [...new Set(z.array(uuid).max(20).parse(comic.source_media_asset_ids))].sort();
    if (comic.source_file_asset_ids?.length || frames.some(frame => frame.mediaAssetIds.some(id => !selectedIds.includes(id)))) {
      throw error(409,"漫画分镜含有无效素材引用，请重新生成分镜。","COMIC_RENDER_SOURCE_INVALID");
    }
    if (selectedIds.length && !agent.permissions.includes("album:read")) throw error(403,"漫画 Agent 未获得素材读取权限。","COMIC_RENDER_SCOPE_REQUIRED");
    const media = selectedIds.length ? await connection.query(`SELECT id, content_revision_at::text AS content_revision
      FROM station_media_assets WHERE user_id = ? AND id = ANY(?::text[]) AND kind = 'image'
      AND status = 'uploaded' AND deleted_at IS NULL ORDER BY id FOR SHARE`,[userId,selectedIds]) : [];
    if (media.length !== selectedIds.length) throw error(409,"所选图片已删除或不可访问。","COMIC_RENDER_SOURCE_CHANGED");
    const snapshot = { comicDiaryId, comicRevision:comic.source_revision, agentVersion:agent.version,
      agentPermissions:[...agent.permissions].sort(), style:comic.style, frames,
      selectedMedia:media.map(row=>({id:row.id,contentRevision:row.content_revision})), outputOptions:{width:1024,height:1024} };
    return {...snapshot,snapshotHash:hash(snapshot)};
  }
  async function outputs(connection,taskId,publicRead=false) {
    return connection.query(publicRead ? `SELECT o.frame_index,o.status,o.safe_error_code,
      CASE WHEN a.status = 'uploaded' AND a.deleted_at IS NULL THEN o.media_asset_id ELSE NULL END AS media_asset_id
      FROM comic_task_outputs o LEFT JOIN station_media_assets a ON a.id=o.media_asset_id AND a.user_id=o.user_id
      WHERE o.task_id=? ORDER BY o.frame_index`
      : "SELECT * FROM comic_task_outputs WHERE task_id=? ORDER BY frame_index",[taskId]);
  }
  function dto(row,rows) {
    return {id:row.id,contractVersion:1,comicDiaryId:row.comic_diary_id,status:row.status,phase:row.phase,revision:row.revision,
      progress:progress(rows),frames:rows.map(frame=>({frameIndex:frame.frame_index,status:frame.status,mediaAssetId:frame.media_asset_id ?? null,errorCode:frame.safe_error_code ?? null})),
      error:row.error ? z.object({code,message:z.string().min(1).max(500)}).strict().parse(row.error):null,
      allowedActions:row.status==="queued"?["cancel"]:[],createdAt:iso(row.created_at),updatedAt:iso(row.updated_at)};
  }
  async function readPublic(connection,userId,taskId,{allowMissing=false,exclusive=false}={}) {
    const [row]=await connection.query(`SELECT ${taskFields} FROM ai_tasks WHERE id=? AND user_id=? AND ${predicate} FOR ${exclusive?"UPDATE":"SHARE"}`,[taskId,userId]);
    if (!row) { if(allowMissing)return null; throw notFound(); }
    const [comic]=await connection.query("SELECT id FROM station_comic_diaries WHERE id=? AND user_id=? AND deleted_at IS NULL AND status <> 'deleted' FOR SHARE",[row.comic_diary_id,userId]);
    if(!comic){if(allowMissing)return null;throw notFound();}
    await authorize(connection,userId);
    return row;
  }
  async function appendEvent(connection,row) {
    const counts=progress(await outputs(connection,row.id));
    await connection.query("INSERT INTO ai_task_events(task_id,user_id,sequence,payload) VALUES (?,?,?,?::jsonb)",
      [row.id,row.user_id,row.revision,json({status:row.status,phase:row.phase,...counts,...(row.error?{errorCode:row.error.code}:{})})]);
  }
  async function lease(connection,{taskId,claimToken}) {
    uuid.parse(taskId);uuid.parse(claimToken);
    const [row]=await connection.query(`SELECT ${taskFields} FROM ai_tasks WHERE id=? AND ${predicate} FOR UPDATE`,[taskId]);
    if(!row||row.status!=="running"||row.claim_token!==claimToken||new Date(row.lease_until)<=new Date(row.database_now)) {
      throw conflict("漫画生成任务租约已失效。","AI_TASK_LEASE_LOST");
    }
    return row;
  }
  async function record(connection,row) {
    return {id:row.id,userId:row.user_id,kind:row.kind,contractVersion:row.contract_version,comicDiaryId:row.comic_diary_id,
      agentId:row.agent_id,agentVersion:row.agent_version,status:row.status,phase:row.phase,revision:row.revision,
      input:row.input,claimToken:row.claim_token,leaseUntil:iso(row.lease_until),
      frames:(await outputs(connection,row.id)).map(frame=>({frameIndex:frame.frame_index,status:frame.status,mediaAssetId:frame.media_asset_id,errorCode:frame.safe_error_code,providerRequestId:frame.provider_request_id,providerMetadata:frame.provider_metadata}))};
  }
  async function revalidate(connection,args) {
    const row=await lease(connection,args);
    const snapshot=await readSnapshot(connection,row.user_id,row.comic_diary_id,row.agent_version);
    if(snapshot.snapshotHash!==row.request_hash||snapshot.snapshotHash!==row.input.snapshotHash) {
      throw conflict("漫画分镜或所选图片已变化，请重新生成。","COMIC_RENDER_SOURCE_CHANGED");
    }
    return row;
  }
  async function bump(connection,row) {
    const [updated]=await connection.query(`UPDATE ai_tasks SET phase='rendering',revision=revision+1,updated_at=clock_timestamp()
      WHERE id=? AND claim_token=? AND status='running' AND lease_until>clock_timestamp() RETURNING ${taskFields}`,[row.id,row.claim_token]);
    if(!updated)throw conflict("漫画生成任务租约已失效。","AI_TASK_LEASE_LOST");
    await appendEvent(connection,updated);
    return updated;
  }
  async function createComicRenderTask({userId,comicDiaryId,idempotencyKey,assertReady}) {
    uuid.parse(userId);uuid.parse(comicDiaryId);z.string().min(8).max(160).parse(idempotencyKey);
    if(typeof assertReady!=="function")throw error(503,"漫画图片生成服务尚未就绪。","COMIC_RENDER_NOT_READY");
    await assertReady();
    return transaction(async connection=>{
      const snapshot=await readSnapshot(connection,userId,comicDiaryId);
      const [created]=await connection.query(`INSERT INTO ai_tasks(id,user_id,kind,contract_version,agent_id,agent_version,comic_diary_id,input,idempotency_key,request_hash)
        VALUES (?,?,'comic_render',2,'comic-diary',?,?,?::jsonb,?,?) ON CONFLICT(user_id,kind,agent_id,idempotency_key) DO NOTHING RETURNING ${taskFields}`,
        [crypto.randomUUID(),userId,snapshot.agentVersion,comicDiaryId,json(snapshot),idempotencyKey,snapshot.snapshotHash]);
      if(!created){
        const [existing]=await connection.query(`SELECT ${taskFields} FROM ai_tasks WHERE user_id=? AND ${predicate} AND agent_id='comic-diary' AND idempotency_key=? FOR UPDATE`,[userId,idempotencyKey]);
        if(!existing||existing.request_hash!==snapshot.snapshotHash)throw conflict("幂等键已用于不同的漫画生成请求。","COMIC_RENDER_IDEMPOTENCY_CONFLICT");
        return {task:dto(existing,await outputs(connection,existing.id,true)),reused:true};
      }
      for(const frame of snapshot.frames)await connection.query("INSERT INTO comic_task_outputs(task_id,user_id,frame_index,status) VALUES (?,?,?,'queued')",[created.id,userId,frame.index]);
      await appendEvent(connection,created);
      return {task:dto(created,await outputs(connection,created.id,true)),reused:false};
    });
  }
  const getComicRenderTask=({userId,taskId})=>transaction(async connection=>{
    uuid.parse(userId);uuid.parse(taskId);
    const row=await readPublic(connection,userId,taskId,{allowMissing:true});
    return row?dto(row,await outputs(connection,row.id,true)):null;
  });
  const listComicRenderTasks=({userId,comicDiaryId,limit=30})=>transaction(async connection=>{
    uuid.parse(userId);uuid.parse(comicDiaryId);z.number().int().min(1).max(50).parse(limit);
    const [comic]=await connection.query("SELECT id FROM station_comic_diaries WHERE id=? AND user_id=? AND deleted_at IS NULL AND status <> 'deleted' FOR SHARE",[comicDiaryId,userId]);
    if(!comic)throw notFound();await authorize(connection,userId);
    const rows=await connection.query(`SELECT ${taskFields} FROM ai_tasks WHERE user_id=? AND comic_diary_id=? AND ${predicate} ORDER BY created_at DESC,id DESC LIMIT ?`,[userId,comicDiaryId,limit]);
    const result=[];for(const row of rows)result.push(dto(row,await outputs(connection,row.id,true)));return result;
  });
  const listComicRenderEvents=({userId,taskId,afterSequence=0,limit=50})=>transaction(async connection=>{
    z.number().int().min(0).parse(afterSequence);z.number().int().min(1).max(100).parse(limit);
    const row=await readPublic(connection,userId,taskId);
    const events=await connection.query("SELECT sequence,payload,created_at FROM ai_task_events WHERE task_id=? AND user_id=? AND sequence>? ORDER BY sequence LIMIT ?",[taskId,userId,afterSequence,limit+1]);
    const page=events.slice(0,limit).map(event=>({sequence:event.sequence,status:event.payload.status,phase:event.payload.phase,
      progress:progressSchema.parse({total:event.payload.total,succeeded:event.payload.succeeded,failed:event.payload.failed,unknown:event.payload.unknown}),
      ...(event.payload.errorCode?{errorCode:event.payload.errorCode}:{}),createdAt:iso(event.created_at)}));
    return {task:dto(row,await outputs(connection,row.id,true)),events:page,hasMore:events.length>limit,nextSequence:page.at(-1)?.sequence??afterSequence};
  });
  const cancelQueuedComicRenderTask=({userId,taskId,revision})=>transaction(async connection=>{
    z.number().int().min(1).parse(revision);
    await readPublic(connection,userId,taskId,{exclusive:true});
    const [row]=await connection.query(`UPDATE ai_tasks SET status='cancelled',phase='cancelled',revision=revision+1,updated_at=clock_timestamp()
      WHERE id=? AND user_id=? AND ${predicate} AND status='queued' AND revision=? RETURNING ${taskFields}`,[taskId,userId,revision]);
    if(!row)throw conflict("任务已经变化，仅排队中的任务可以取消。","COMIC_RENDER_REVISION_CONFLICT");
    await connection.query("UPDATE comic_task_outputs SET status='skipped',updated_at=clock_timestamp() WHERE task_id=? AND status='queued'",[taskId]);
    await appendEvent(connection,row);return dto(row,await outputs(connection,row.id,true));
  });
  const getComicRenderTaskRecord=args=>transaction(async connection=>record(connection,await lease(connection,args)));
  const revalidateComicRenderTask=args=>transaction(async connection=>record(connection,await revalidate(connection,args)));
  const markComicFrameRunning=args=>transaction(async connection=>{
    z.number().int().min(1).max(8).parse(args.frameIndex);
    const row=await revalidate(connection,args);
    const [frame]=await connection.query("UPDATE comic_task_outputs SET status='running',updated_at=clock_timestamp() WHERE task_id=? AND frame_index=? AND status='queued' RETURNING frame_index",[args.taskId,args.frameIndex]);
    if(!frame)throw conflict("该画格已开始或已经结束，不能重复派发。");
    return record(connection,await bump(connection,row));
  });
  const markComicFrameResult=args=>transaction(async connection=>{
    z.enum(["failed","unknown"]).parse(args.status);z.number().int().min(1).max(8).parse(args.frameIndex);
    if(args.errorCode!=null)code.parse(args.errorCode);
    const row=await lease(connection,args);
    const [frame]=await connection.query(`UPDATE comic_task_outputs SET status=?,safe_error_code=?,provider_request_id=?,updated_at=clock_timestamp()
      WHERE task_id=? AND frame_index=? AND status='running' RETURNING frame_index`,[args.status,args.errorCode??null,args.providerRequestId??null,args.taskId,args.frameIndex]);
    if(!frame)throw conflict("画格状态已变化。");return record(connection,await bump(connection,row));
  });
  async function bindComicFrameAssetInTransaction(connection,args) {
    uuid.parse(args.mediaAssetId);z.number().int().min(1).max(8).parse(args.frameIndex);
    const row=await revalidate(connection,args);
    const [asset]=await connection.query("SELECT id FROM station_media_assets WHERE id=? AND user_id=? AND status='uploaded' AND deleted_at IS NULL FOR SHARE",[args.mediaAssetId,row.user_id]);
    if(!asset)throw notFound();
    const metadata=args.metadata??{};
    const [frame]=await connection.query(`UPDATE comic_task_outputs SET status='succeeded',media_asset_id=?,safe_error_code=NULL,provider_request_id=?,provider_metadata=?::jsonb,updated_at=clock_timestamp()
      WHERE task_id=? AND frame_index=? AND status='running' RETURNING frame_index`,[args.mediaAssetId,args.providerRequestId??metadata.providerRequestId??null,json({model:metadata.model??null,usage:metadata.usage??null}),args.taskId,args.frameIndex]);
    if(!frame)throw conflict("画格状态已变化，不能绑定输出。");
    return dto(await bump(connection,row),await outputs(connection,row.id,true));
  }
  const finishComicRenderTask=args=>transaction(async connection=>{
    z.enum(["succeeded","partially_succeeded","failed","interrupted"]).parse(args.status);
    const row=await lease(connection,args);
    if(args.error!=null)z.object({code,message:z.string().min(1).max(500)}).strict().parse(args.error);
    await connection.query(`UPDATE comic_task_outputs SET status=CASE WHEN status='running' THEN 'unknown' ELSE 'skipped' END,
      safe_error_code=CASE WHEN status='running' THEN 'COMIC_RENDER_OUTCOME_UNKNOWN' ELSE NULL END,updated_at=clock_timestamp()
      WHERE task_id=? AND status IN ('queued','running')`,[row.id]);
    const counts=progress(await outputs(connection,row.id));
    if((args.status==="succeeded"&&counts.succeeded!==counts.total)||(args.status==="partially_succeeded"&&(!counts.succeeded||counts.succeeded===counts.total||counts.unknown))||(args.status==="failed"&&(counts.succeeded||counts.unknown)))throw conflict("逐格结果与任务结束状态不一致。");
    const phase=["succeeded","partially_succeeded"].includes(args.status)?"completed":args.status;
    const [updated]=await connection.query(`UPDATE ai_tasks SET status=?,phase=?,error=?::jsonb,claim_token=NULL,lease_until=NULL,revision=revision+1,updated_at=clock_timestamp()
      WHERE id=? AND claim_token=? AND status='running' AND lease_until>clock_timestamp() RETURNING ${taskFields}`,[args.status,phase,args.error?json(args.error):null,row.id,args.claimToken]);
    if(!updated)throw conflict("漫画生成任务租约已失效。","AI_TASK_LEASE_LOST");
    await appendEvent(connection,updated);return dto(updated,await outputs(connection,row.id,true));
  });
  return {createComicRenderTask,getComicRenderTask,listComicRenderTasks,listComicRenderEvents,cancelQueuedComicRenderTask,
    getComicRenderTaskRecord,revalidateComicRenderTask,markComicFrameRunning,markComicFrameResult,bindComicFrameAssetInTransaction,finishComicRenderTask};
}
export const defaultComicRenderRepository=createComicRenderRepository();
export const {createComicRenderTask,getComicRenderTask,listComicRenderTasks,listComicRenderEvents,cancelQueuedComicRenderTask,
  getComicRenderTaskRecord,revalidateComicRenderTask,markComicFrameRunning,markComicFrameResult,bindComicFrameAssetInTransaction,finishComicRenderTask}=defaultComicRenderRepository;
