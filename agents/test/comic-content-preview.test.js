import assert from 'node:assert/strict';
import test from 'node:test';
import {getAgent} from '../registry.js';
test('comic dispatch proposes complete content with one confirmation and independent diary saving',async()=>{
  const agent=await getAgent('comic-diary');
  const plan=await agent.dispatch({input:'画猫狗放纸船',messages:[],appContext:{client:{language:'zh'},
    specialistDispatch:{agent:{id:agent.key,name:agent.name},capabilities:agent.workspaceCapabilities.map(c=>({...c,agentId:agent.key})),requestMessages:[{content:'画猫狗放纸船'}]},
    contentPreviewContext:{kind:'comic',snapshot:{title:'旧方案'}}}});
  assert.equal(agent.version,'0.1.6');
  assert.match(plan.system,/content_preview/);assert.match(plan.system,/diary/);assert.match(plan.system,/一次/);
  assert.doesNotMatch(plan.system,/填写本次故事并点击|引导用户使用制作漫画入口/);
  assert.doesNotMatch(plan.system,/用户继续修改|继续修改此任务|制作漫画入口/);
  assert.match(plan.user,/旧方案/);
});
