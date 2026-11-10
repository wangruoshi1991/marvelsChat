import { z } from 'zod';
import { query } from './db.js';

const capabilitiesSchema=z.array(z.enum(['agent_message','site_draft','comic_render'])).max(3);
export function createAITaskWorkerStatusRepository({query:runQuery=query}={}) {
  const recordAITaskWorkerStatus=async({instanceId,state,capabilities})=>{
    z.string().min(1).max(160).parse(instanceId);
    z.enum(['starting','ready','stopped']).parse(state);
    capabilitiesSchema.parse(capabilities);
    await runQuery(`INSERT INTO ai_task_worker_heartbeats(instance_id,state,capabilities,last_seen_at)
      VALUES(?,?,?::jsonb,clock_timestamp()) ON CONFLICT(instance_id) DO UPDATE
      SET state=EXCLUDED.state,capabilities=EXCLUDED.capabilities,last_seen_at=clock_timestamp()`,[instanceId,state,JSON.stringify([...new Set(capabilities)])]);
  };
  const getAITaskWorkerStatus=async()=>{
    try {
      const rows=await runQuery(`SELECT capabilities FROM ai_task_worker_heartbeats
        WHERE state = 'ready' AND last_seen_at > clock_timestamp() - INTERVAL '90 seconds'`);
      const capabilities=[...new Set(rows.flatMap(row=>capabilitiesSchema.parse(row.capabilities)))];
      return {state:rows.length?'ready':'unavailable',capabilities};
    } catch {return {state:'unavailable',capabilities:[]};}
  };
  return {recordAITaskWorkerStatus,getAITaskWorkerStatus};
}
export const {recordAITaskWorkerStatus,getAITaskWorkerStatus}=createAITaskWorkerStatusRepository();
