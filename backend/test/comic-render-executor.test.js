import assert from 'node:assert/strict';
import test from 'node:test';
import { createComicRenderExecutor } from '../src/comic-render-executor.js';

function fixture({ failAt, unknown = false, revokeAt, storageFailAt } = {}) {
  const transitions = []; let calls = 0, validations = 0;
  const frames = [1,2,3].map(index => ({ index, title: `第${index}格`, scene:'测试场景', caption:'', dialogue:'', mood:'', camera:'', mediaAssetIds:[] }));
  const record = { id:'task',userId:'owner',claimToken:'claim',input:{ frames, style:'cute',outputOptions:{width:1024,height:1024} } };
  const repository = {
    revalidateComicRenderTask: async () => { validations++; if (validations === revokeAt) throw { status:403 }; return record; },
    markComicFrameRunning: async ({frameIndex}) => transitions.push(`running:${frameIndex}`),
    markComicFrameResult: async value => {
      assert.ok(transitions.includes(`running:${value.frameIndex}`), 'only a running output accepts a result');
      transitions.push(value);
    },
    finishComicRenderTask: async value => transitions.push(value),
  };
  const execute = createComicRenderExecutor({ repository,
    provider:{ generateFrame: async () => {
      calls++; if (calls === failAt) throw unknown ? {outcomeUnknown:true,details:{code:'COMIC_IMAGE_OUTCOME_UNKNOWN'}} : {status:422};
      return { bytes:Buffer.from('validated-by-storage'),mimeType:'image/png',model:'test-model',usage:null };
    } },
    storage:{readSelectedImages:async()=>[],storeComicFrame:async ({frameIndex})=>{ if(frameIndex===storageFailAt) throw new Error('private-error'); transitions.push(`stored:${frameIndex}`); }},
  });
  return { execute: () => execute(record), transitions, calls: () => calls };
}

test('frames are dispatched sequentially and bound before the next provider call',async()=>{
  const f=fixture(); await f.execute(); assert.equal(f.calls(),3);
  assert.deepEqual(f.transitions.slice(0,6),['running:1','stored:1','running:2','stored:2','running:3','stored:3']);
  assert.equal(f.transitions.at(-1).status,'succeeded');
});
test('deterministic frame failure preserves other successes as partial completion',async()=>{
  const f=fixture({failAt:2}); await f.execute(); assert.equal(f.calls(),3);
  assert.equal(f.transitions.at(-1).status,'partially_succeeded');
  assert.ok(f.transitions.some(x=>x.frameIndex===2&&x.status==='failed'));
});
test('unknown dispatch outcome interrupts later frames with no replay',async()=>{
  const f=fixture({failAt:2,unknown:true});await f.execute();assert.equal(f.calls(),2);
  assert.ok(f.transitions.some(x=>x.frameIndex===2&&x.status==='unknown'));
  assert.equal(f.transitions.at(-1).status,'interrupted');
});
test('access revocation before the second frame stops further requests',async()=>{
  const f=fixture({revokeAt:3});await f.execute();assert.equal(f.calls(),1);
  assert.equal(f.transitions.at(-1).status,'partially_succeeded');
  assert.equal(f.transitions.at(-1).error.code,'COMIC_RENDER_ACCESS_REVOKED');
});
test('storage failure is a known delivery failure and never repeats a provider call',async()=>{
  const f=fixture({storageFailAt:2});await f.execute();assert.equal(f.calls(),3);
  assert.equal(f.transitions.at(-1).status,'partially_succeeded');
  assert.doesNotMatch(JSON.stringify(f.transitions),/private-error/);
});
