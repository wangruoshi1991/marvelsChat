import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import { validateSpecialistDispatch } from '../src/specialist-dispatch.js';
import { messageSchema } from '../src/schemas.js';
import { messageRequestFingerprint } from '../src/message-request.js';
import { publicMessage } from '../src/public-message.js';
import * as contracts from '../src/ai-client-contract.js';

const frames = Array.from({length:4}, (_,i)=>({index:i+1,title:`第${i+1}格`,scene:'猫与狗放纸船',caption:'',dialogue:'',mood:'轻松',camera:'远景',mediaAssetIds:[]}));
export const proposal = {type:'content_preview',kind:'comic',reply:'四格故事已整理，请确认生成。',snapshot:{title:'纸船',summary:'猫与狗一起放纸船',style:'cute',frameCount:4,frames}};
test('only comic Agent accepts complete typed previews and refuses cross branch/extra fields',()=>{
  assert.deepEqual(validateSpecialistDispatch(proposal,{agentId:'comic-diary',capabilities:[]}),proposal);
  for(const decision of [{...proposal,kind:'diary'},{...proposal,snapshot:{...proposal.snapshot,frameCount:3}},{...proposal,permissions:['all']}])
    assert.throws(()=>validateSpecialistDispatch(decision,{agentId:'comic-diary',capabilities:[]}),e=>e.status===502);
  assert.throws(()=>validateSpecialistDispatch(proposal,{agentId:'ui-agent',capabilities:[]}),e=>e.status===502);
  assert.equal(validateSpecialistDispatch({type:'content_preview',kind:'diary',reply:'请确认保存',snapshot:{title:'今天',body:'一起放纸船。',mood:'开心'}},{agentId:'comic-diary',capabilities:[]}).kind,'diary');
});
test('preview context is fingerprinted and incompatible workflow combinations are rejected',()=>{
  const body=messageSchema.parse({content:'把结尾改成雨天',clientMessageId:crypto.randomUUID()});
  const context={id:crypto.randomUUID(),revision:1};
  const parsed=messageSchema.parse({...body,contentPreviewContext:context});
  assert.notEqual(messageRequestFingerprint(body),messageRequestFingerprint(parsed));
  assert.equal(messageSchema.safeParse({...parsed,agentContextReset:true}).success,false);
  assert.equal(messageSchema.safeParse({...parsed,workspaceContext:{id:crypto.randomUUID(),revision:1,currentRound:1}}).success,false);
});
test('only live Agent output exposes versioned preview reference without private fields',()=>{
  const id=crypto.randomUUID(),metadata={contentPreview:{version:1,id,snapshot:{private:true}},agentDispatch:{version:1,kind:'content_preview'}};
  assert.deepEqual(publicMessage({senderType:'agent',metadata}).metadata,{contentPreview:{version:1,id},agentDispatch:{version:1,kind:'content_preview'}});
  assert.equal(publicMessage({senderType:'user',metadata}).metadata.contentPreview,undefined);
  assert.equal(publicMessage({senderType:'agent',recalledAt:'now',metadata}).metadata.contentPreview,undefined);
});
test('new comic message contract rejects old client before calling next',()=>{
  assert.equal(typeof contracts.requireChatContentContract,'function');
  assert.throws(()=>contracts.requireChatContentContract({get:()=>undefined}),e=>e.status===426);
  let accepted=false;contracts.requireChatContentContract({get:()=> '1'},null,()=>accepted=true);assert.equal(accepted,true);
});
