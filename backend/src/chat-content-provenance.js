import { z } from 'zod';
import { HttpError } from './http-error.js';
import { hashSiteDocumentValue } from './site-document-repository.js';
import { resolveAIContextReferences } from './ai-context.js';
import { assertAgentProductEntitlement } from './ai-agent-access.js';

const fail = () => new HttpError(409,'创作来源已删除、撤回或变化，未继续执行。',{code:'CHAT_CONTENT_SOURCE_CHANGED'});
export const sourceMessageSnapshot = row => ({id:row.id,hash:hashSiteDocumentValue([row.sender_type,row.content])});
export async function validateContentSourceMessages(connection,{userId,threadId,sourceSnapshots,requiredMessageIds=[],lock=true}) {
  const snapshots=z.array(z.object({id:z.string().uuid(),hash:z.string().regex(/^[a-f0-9]{64}$/)}).strict()).min(1).max(100).parse(sourceSnapshots);
  const required=z.array(z.string().uuid()).max(2).parse(requiredMessageIds);
  // One ordered lock set covers both the source history and the actual proposal
  // message. Deleting either boundary must stop dispatch and output binding.
  const ids=[...new Set([...snapshots.map(s=>s.id),...required])].sort();
  const rows=await connection.query(`SELECT id,sender_type,content FROM chat_messages WHERE user_id=? AND thread_id=?
    AND id=ANY(?::text[]) AND deleted_at IS NULL AND recalled_at IS NULL ORDER BY id${lock?' FOR SHARE':''}`,[userId,threadId,ids]);
  if(rows.length!==ids.length || snapshots.some(s=>sourceMessageSnapshot(rows.find(r=>r.id===s.id)).hash!==s.hash)) throw fail();
}
export async function validateContentSources(connection,{userId,threadId,sourceSnapshots,contextRefs,grantedScopes,requiredMessageIds=[],lock=true}) {
  await validateContentSourceMessages(connection,{userId,threadId,sourceSnapshots,requiredMessageIds,lock});
  return resolveAIContextReferences({userId,refs:contextRefs,grantedScopes,queryFn:connection.query.bind(connection),lock});
}

// No mutable preview row lock after the task lock. The immutable association is
// authenticated by the marker frozen on the comic, so missing provenance fails closed.
export async function validateComicChatProvenance(connection,{comic,userId,agent}) {
  const previewId=comic.metadata?.chatContentPreviewId;
  if(!previewId)return;
  const [preview]=await connection.query('SELECT * FROM chat_content_previews WHERE id=? AND user_id=?',[previewId,userId]);
  if(!preview || !preview.input_message_id || !preview.output_message_id || preview.kind!=='comic' || preview.authority_snapshot.agentVersion!==agent.version ||
    (preview.status!=='pending' && !(preview.status==='confirmed' && preview.comic_diary_id===comic.id))) throw fail();
  // Pending is only observable by its own confirmation transaction, before its
  // new task and receipt commit atomically; workers only see confirmed rows.
  if(hashSiteDocumentValue(preview.snapshot)!==preview.snapshot_hash)throw fail();
  const entitlement=await assertAgentProductEntitlement({userId,agent,queryFn:connection.query.bind(connection)});
  if(preview.authority_snapshot.entitlement &&
      hashSiteDocumentValue(preview.authority_snapshot.entitlement)!==hashSiteDocumentValue(entitlement))throw fail();
  await validateContentSources(connection,{userId,threadId:preview.thread_id,sourceSnapshots:preview.source_snapshots,
    contextRefs:preview.context_refs,grantedScopes:agent.permissions,requiredMessageIds:[preview.input_message_id,preview.output_message_id]});
}
