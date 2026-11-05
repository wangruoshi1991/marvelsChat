import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool, closeDatabase, createConnectionAdapter } from '../src/db.js';
import { readChatAttachmentCapacity } from '../src/chat-attachment-lifecycle.js';

export async function checkChatAttachmentOperations({ pool, inspect=readChatAttachmentCapacity }={}) {
  const client=await pool.connect();
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout='10s'");
    const connection=createConnectionAdapter(client);
    return {ok:true,...await inspect({queryFn:connection.query})};
  } finally {
    try{await client.query('ROLLBACK');}finally{client.release();}
  }
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const result=await checkChatAttachmentOperations({pool:await getPool()});
    console.log(JSON.stringify(result,null,2));
    if(result.globalNearCapacity || result.nearUserLimitCount>0)process.exitCode=2;
  }catch{console.error(JSON.stringify({ok:false,code:'CHAT_ATTACHMENT_OPERATIONS_CHECK_FAILED'}));process.exitCode=1;}
  finally{await closeDatabase();}
}
