import assert from 'node:assert/strict';
import test from 'node:test';
import { createAITaskWorkerStatusRepository } from '../src/ai-task-worker-status-repository.js';

test('worker readiness queries only fresh ready capabilities and fails closed on database errors',async()=>{
  let statement;
  const repository=createAITaskWorkerStatusRepository({query:async sql=>{statement=sql;return [{capabilities:['agent_message','comic_render']}];}});
  assert.deepEqual(await repository.getAITaskWorkerStatus(),{state:'ready',capabilities:['agent_message','comic_render']});
  assert.match(statement,/90 seconds/);assert.match(statement,/state = 'ready'/);
  const unavailable=createAITaskWorkerStatusRepository({query:async()=>{throw new Error('secret-host');}});
  assert.deepEqual(await unavailable.getAITaskWorkerStatus(),{state:'unavailable',capabilities:[]});
});
test('worker heartbeat records only known capabilities and shutdown clears readiness',async()=>{
  const writes=[];const repository=createAITaskWorkerStatusRepository({query:async(sql,params)=>{writes.push(params);return [];}});
  await repository.recordAITaskWorkerStatus({instanceId:'worker-1',state:'ready',capabilities:['comic_render']});
  assert.equal(writes[0][1],'ready');assert.equal(writes[0][2],'["comic_render"]');
  await repository.recordAITaskWorkerStatus({instanceId:'worker-1',state:'stopped',capabilities:[]});
  await assert.rejects(()=>repository.recordAITaskWorkerStatus({instanceId:'worker-1',state:'ready',capabilities:['unknown']}));
  assert.equal(writes.length,2);
});
