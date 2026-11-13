import crypto from 'node:crypto';
import { z } from 'zod';
import { getAgent } from '../../agents/registry.js';
import { withTransaction } from './db.js';
import { HttpError } from './http-error.js';
import { assertCurrentAgentAccess,assertAgentProductEntitlement } from './ai-agent-access.js';
import { hashSiteDocumentValue } from './site-document-repository.js';
import { contentPreviewDecisionSchema } from './chat-content-contract.js';
import { validateContentSources } from './chat-content-provenance.js';
import { createComicRenderRepository } from './comic-render-repository.js';
import { buildAgentReadiness } from './agent-readiness-service.js';
import { createStationComicDiary } from './station-agent-repository.js';
import { createStationDiaryEntry } from './station-library-repository.js';
import { createUsageEvent } from './repositories.js';

const fail=(status,code,message)=>new HttpError(status,message,{code});
const missing=()=>fail(404,'CHAT_CONTENT_NOT_FOUND','创作预览不存在或不可访问。');
const conflict=()=>fail(409,'CHAT_CONTENT_CHANGED','创作预览已变化，请查看当前状态。');
const iso=value=>new Date(value).toISOString();
const ttl=24*60*60*1000;
const hashSchema=z.string().regex(/^[a-f0-9]{64}$/);
const idSchema=z.string().uuid();
export const chatContentConfirmationSchema=z.object({revision:z.number().int().min(1),snapshotHash:hashSchema,idempotencyKey:z.string().min(8).max(160)}).strict();
export const chatContentRejectionSchema=z.object({revision:z.number().int().min(1)}).strict();
export const canonicalContentRefs=refs=>{
  const result=[...new Map(refs.map(ref=>[`${ref.kind}:${ref.id}`,ref])).values()];
  if(result.length>6)throw fail(422,'CHAT_CONTENT_SOURCE_LIMIT','本次创作最多选择6份来源，请移除部分素材。');
  return result.sort((a,b)=>`${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`));
};
export const canonicalSourceSnapshots=snapshots=>[...new Map(snapshots.map(s=>[s.id,s])).values()].sort((a,b)=>a.id.localeCompare(b.id));

export function createChatContentPreviewService({transaction=withTransaction,loadAgent=getAgent,renderRepository=createComicRenderRepository(),
  audit=createUsageEvent,now=()=>Date.now(),assertReady=async()=>{
    if(!(await buildAgentReadiness())['comic-diary']?.configured)throw fail(503,'COMIC_RENDER_NOT_READY','漫画图片生成服务尚未就绪。');
  }}={}) {
  const lockThread=(connection,userId,threadId)=>connection.query('SELECT pg_advisory_xact_lock(hashtextextended(?,0))',[`specialist-message:${userId}:${threadId}`]);
  const read=async(connection,userId,previewId,lock=false)=>{
    const [row]=await connection.query(`SELECT * FROM chat_content_previews WHERE id=? AND user_id=?${lock?' FOR UPDATE':''}`,[previewId,userId]);
    if(!row)throw missing();return row;
  };
  async function authorize(connection,userId,authority=null,kind=null) {
    const agent=await loadAgent('comic-diary');
    if(!agent || (authority&&authority.agentVersion!==agent.version))throw fail(409,'AI_AGENT_VERSION_CHANGED','Agent版本已变化，请重新整理创作。');
    if(kind==='diary'&&!agent.permissions.includes('diary:write'))throw fail(403,'CHAT_CONTENT_SCOPE_REQUIRED','Agent未获准保存日记。');
    if(kind==='comic'&&!agent.permissions.includes('media:image:generate'))throw fail(403,'CHAT_CONTENT_SCOPE_REQUIRED','Agent未获准生成漫画。');
    await assertCurrentAgentAccess({userId,agent,grantedScopes:agent.permissions,contextRefs:[],queryFn:connection.query.bind(connection),lock:true});
    const entitlement=await assertAgentProductEntitlement({userId,agent,queryFn:connection.query.bind(connection)});
    if(authority?.entitlement && hashSiteDocumentValue(authority.entitlement)!==hashSiteDocumentValue(entitlement))
      throw fail(409,'CHAT_CONTENT_AUTHORITY_CHANGED','产品授权版本已变化，请重新整理创作。');
    return {agent,authority:{agentId:agent.key,agentVersion:agent.version,permissions:[...agent.permissions].sort(),entitlement}};
  }
  async function assertMessagesVisible(connection,row,lock=false) {
    const ids=[row.input_message_id,row.output_message_id].filter(Boolean).sort();
    const rows=await connection.query(`SELECT id FROM chat_messages WHERE user_id=? AND thread_id=? AND id=ANY(?::text[])
      AND deleted_at IS NULL AND recalled_at IS NULL ORDER BY id${lock?' FOR SHARE':''}`,[row.user_id,row.thread_id,ids]);
    if(rows.length!==ids.length || !row.output_message_id)throw missing();
  }
  async function validateSources(connection,row,agent,lock=true) {
    return validateContentSources(connection,{userId:row.user_id,threadId:row.thread_id,sourceSnapshots:row.source_snapshots,
      contextRefs:row.context_refs,grantedScopes:agent.permissions,lock});
  }
  function dto(row,{replay=false,hideSources=false}={}) {
    const expired=row.status==='pending'&&new Date(row.expires_at).getTime()<=now();
    const status=expired?'expired':row.status;
    return {id:row.id,version:1,revision:row.revision,snapshotHash:row.snapshot_hash,kind:row.kind,status,
      threadId:row.thread_id,inputMessageId:row.input_message_id,outputMessageId:row.output_message_id,
      snapshot:row.snapshot,sources:hideSources?[]:row.context_refs.map(ref=>({type:ref.kind,id:ref.id,title:ref.title||'所选素材',
        ...(ref.kind==='station-photo'?{mediaAssetId:ref.id}:{})})),
      allowedActions:!replay&&status==='pending'?['confirm','reject']:[],expiresAt:iso(row.expires_at),
      result:row.status!=='confirmed'?null:row.kind==='comic'?{comicDiaryId:row.comic_diary_id,comicRenderTaskId:row.comic_render_task_id}:{diaryEntryId:row.diary_entry_id}};
  }
  async function persistPreparedInTransaction({connection,userId,threadId,inputMessageId,outputMessageId=null,decision,sourceSnapshots,contextRefs,authority,basePreviewId=null}) {
    const parsed=contentPreviewDecisionSchema.parse(decision),refs=canonicalContentRefs(contextRefs);
    if(refs.some(ref=>!['station-photo','station-diary','chat-message'].includes(ref.kind)))
      throw fail(422,'CHAT_CONTENT_SOURCE_UNSUPPORTED','请选择具体照片、日记或聊天消息，不支持整库或文件来源。');
    const access=await authorize(connection,userId,authority,parsed.kind);
    const sources=canonicalSourceSnapshots(sourceSnapshots);
    await validateContentSources(connection,{userId,threadId,sourceSnapshots:sources,contextRefs:refs,grantedScopes:access.agent.permissions});
    const photoIds=new Set(refs.filter(r=>r.kind==='station-photo').map(r=>r.id));
    if(parsed.kind==='comic'&&parsed.snapshot.frames.some(frame=>frame.mediaAssetIds.some(id=>!photoIds.has(id))))
      throw fail(502,'SPECIALIST_DISPATCH_INVALID','漫画提案包含未选定的图片，未创建预览。');
    if(refs.filter(r=>r.kind==='station-diary').length>1)throw fail(422,'CHAT_CONTENT_SOURCE_LIMIT','一次漫画创作只能选择一篇日记。');
    const snapshotHash=hashSiteDocumentValue(parsed.snapshot);
    const requestHash=hashSiteDocumentValue({snapshotHash,sources,refs,authority:access.authority,basePreviewId});
    const id=crypto.randomUUID();
    const [created]=await connection.query(`INSERT INTO chat_content_previews
      (id,user_id,thread_id,input_message_id,output_message_id,kind,snapshot,snapshot_hash,source_snapshots,context_refs,authority_snapshot,base_preview_id,request_hash,expires_at)
      VALUES (?,?,?,?,?,?,?::jsonb,?,?::jsonb,?::jsonb,?::jsonb,?,?,?)
      ON CONFLICT(input_message_id,kind) DO NOTHING RETURNING id`,[id,userId,threadId,inputMessageId,outputMessageId,parsed.kind,
      JSON.stringify(parsed.snapshot),snapshotHash,JSON.stringify(sources),JSON.stringify(refs),JSON.stringify(access.authority),basePreviewId,requestHash,new Date(now()+ttl).toISOString()]);
    if(!created){const [existing]=await connection.query('SELECT id,request_hash FROM chat_content_previews WHERE input_message_id=? AND kind=?',[inputMessageId,parsed.kind]);
      if(existing?.request_hash!==requestHash)throw conflict();return {id:existing.id};}
    await audit({userId,eventType:'chat.content.preview',targetType:'chat_content_preview',targetId:id,payload:{kind:parsed.kind}},connection.query.bind(connection));
    return {id};
  }
  async function bindOutputInTransaction(connection,{previewId,outputMessageId}) {
    await connection.query('UPDATE chat_content_previews SET output_message_id=? WHERE id=? AND output_message_id IS NULL',[outputMessageId,previewId]);
  }
  async function continuationInTransaction({connection,userId,threadId,context,contextRefs=[],agent}) {
    const origin=await read(connection,userId,context.id);
    await assertMessagesVisible(connection,origin,true);
    const row=await read(connection,userId,context.id,true);
    if(agent?.key!=='comic-diary' || row.thread_id!==threadId || row.revision!==context.revision || !['pending','confirmed'].includes(row.status) ||
      (row.status==='pending'&&new Date(row.expires_at).getTime()<=now()))throw conflict();
    await assertMessagesVisible(connection,row,true);
    if(row.authority_snapshot.agentVersion!==agent.version)throw conflict();
    if(hashSiteDocumentValue(row.snapshot)!==row.snapshot_hash)throw conflict();
    // A continuation's submitted list is the complete selection. Preserve a
    // retained reference's frozen version, but never resolve removed resources.
    const refs=canonicalContentRefs(contextRefs.map(ref=>{
      const prior=row.context_refs.find(previous=>previous.kind===ref.kind&&previous.id===ref.id);
      return prior&&!ref.version?{...ref,version:prior.version}:ref;
    }));
    const removedMessageIds=row.context_refs.filter(ref=>ref.kind==='chat-message'&&!refs.some(current=>current.kind===ref.kind&&current.id===ref.id)).map(ref=>ref.id);
    const photoIds=new Set(refs.filter(ref=>ref.kind==='station-photo').map(ref=>ref.id));
    const snapshot=row.kind==='comic'?{...row.snapshot,frames:row.snapshot.frames.map(frame=>({...frame,mediaAssetIds:frame.mediaAssetIds.filter(id=>photoIds.has(id))}))}:row.snapshot;
    return {id:row.id,revision:context.revision,snapshotHash:row.snapshot_hash,kind:row.kind,snapshot,
      contextRefs:refs,removedMessageIds};
  }
  async function supersedePendingInTransaction({connection,userId,threadId}) {
    // The caller holds the same thread lock as confirmation. Every admitted
    // message ends earlier pending intentions before any new provider call.
    await connection.query(`UPDATE chat_content_previews SET status='superseded',revision=revision+1,updated_at=clock_timestamp()
      WHERE user_id=? AND thread_id=? AND status='pending'`,[userId,threadId]);
  }
  async function validateContinuationInTransaction({connection,userId,threadId,context}) {
    const row=await read(connection,userId,context.id);
    if(row.thread_id!==threadId || row.snapshot_hash!==context.snapshotHash || hashSiteDocumentValue(row.snapshot)!==context.snapshotHash ||
      !((row.status==='confirmed'&&row.revision===context.revision)||(row.status==='superseded'&&row.revision===context.revision+1)))throw conflict();
    await assertMessagesVisible(connection,row,true);
  }
  async function getPreview({userId,previewId}) {
    idSchema.parse(previewId);
    return transaction(async connection=>{const row=await read(connection,userId,previewId);await assertMessagesVisible(connection,row);
      const [owner]=await connection.query("SELECT id FROM users WHERE id=? AND status='active'",[userId]);if(!owner)throw missing();
      const activePending=row.status==='pending'&&new Date(row.expires_at).getTime()>now();
      if(activePending){
        const access=await authorize(connection,userId,row.authority_snapshot,row.kind);await validateSources(connection,row,access.agent,false);
      }else{
        try { await validateContentSources(connection,{userId,threadId:row.thread_id,sourceSnapshots:row.source_snapshots,contextRefs:row.context_refs,grantedScopes:row.authority_snapshot.permissions||[],lock:false}); }
        catch { throw missing(); }
      }
      // Confirmed snapshots are authored content; source labels are withheld once
      // execution has ended, so removed source titles are never replayed.
      return dto(row,{hideSources:!activePending});
    });
  }
  async function confirm({userId,previewId,...request}) {
    idSchema.parse(previewId);const body=chatContentConfirmationSchema.parse(request);
    return transaction(async connection=>{
      const origin=await read(connection,userId,previewId);await lockThread(connection,userId,origin.thread_id);
      // First lock messages, then the mutable preview. Successful replays never
      // enter this path's task/source locking or execution authorization.
      if(origin.status!=='confirmed')await assertMessagesVisible(connection,origin,true);
      const row=await read(connection,userId,previewId,true);
      if(row.status==='confirmed'){
        if(row.accepted_revision!==body.revision||row.accepted_hash!==body.snapshotHash)throw conflict();
        return dto(row,{replay:true,hideSources:true});
      }
      if(row.status!=='pending'||row.revision!==body.revision||row.snapshot_hash!==body.snapshotHash)throw conflict();
      if(new Date(row.expires_at).getTime()<=now())throw fail(409,'CHAT_CONTENT_EXPIRED','创作预览已过期，请重新整理。');
      const access=await authorize(connection,userId,row.authority_snapshot,row.kind);
      await validateSources(connection,row,access.agent);
      if(hashSiteDocumentValue(row.snapshot)!==row.snapshot_hash)throw conflict();
      let comicId=null,taskId=null,diaryId=null;
      if(row.kind==='comic'){
        await assertReady();
        const comic=await createStationComicDiary({userId,title:row.snapshot.title,prompt:'用户已确认的聊天漫画提案',style:row.snapshot.style,
          sourceDiaryEntryId:row.context_refs.find(r=>r.kind==='station-diary')?.id||null,
          sourceMediaAssetIds:row.context_refs.filter(r=>r.kind==='station-photo').map(r=>r.id),frames:row.snapshot.frames,summary:row.snapshot.summary,
          metadata:{source:'chat-content',chatContentPreviewId:row.id}},connection.query.bind(connection));
        comicId=comic.id;
        const result=await renderRepository.createComicRenderTaskInTransaction(connection,{userId,comicDiaryId:comicId,idempotencyKey:`chat-content:${row.id}`,assertReady:async()=>{}});
        taskId=result.task.id;
      }else{
        const diary=await createStationDiaryEntry({userId,...row.snapshot,source:'agent',visibility:'private'},connection.query.bind(connection));diaryId=diary.id;
      }
      const [updated]=await connection.query(`UPDATE chat_content_previews SET status='confirmed',revision=revision+1,accepted_revision=?,accepted_hash=?,confirmation_key=?,
        comic_diary_id=?,comic_render_task_id=?,diary_entry_id=?,confirmed_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=? RETURNING *`,
      [body.revision,body.snapshotHash,body.idempotencyKey,comicId,taskId,diaryId,row.id]);
      await audit({userId,eventType:'chat.content.confirm',targetType:'chat_content_preview',targetId:row.id,payload:{kind:row.kind}},connection.query.bind(connection));
      return dto(updated,{hideSources:true});
    });
  }
  async function reject({userId,previewId,revision}) {
    idSchema.parse(previewId);chatContentRejectionSchema.parse({revision});
    return transaction(async connection=>{const origin=await read(connection,userId,previewId);await lockThread(connection,userId,origin.thread_id);
      await assertMessagesVisible(connection,origin,true);const row=await read(connection,userId,previewId,true);
      if(row.status==='rejected'&&row.revision===revision+1)return dto(row,{hideSources:true});
      if(row.status!=='pending'||row.revision!==revision)throw conflict();
      const [updated]=await connection.query("UPDATE chat_content_previews SET status='rejected',revision=revision+1,updated_at=clock_timestamp() WHERE id=? RETURNING *",[row.id]);
      await audit({userId,eventType:'chat.content.reject',targetType:'chat_content_preview',targetId:row.id,payload:{}},connection.query.bind(connection));return dto(updated,{hideSources:true});
    });
  }
  return {persistPreparedInTransaction,bindOutputInTransaction,continuationInTransaction,validateContinuationInTransaction,supersedePendingInTransaction,getPreview,confirm,reject};
}
export const chatContentPreviewService=createChatContentPreviewService();
