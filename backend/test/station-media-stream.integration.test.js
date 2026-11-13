import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';
import test from 'node:test';
import { query,closeDatabase } from '../src/db.js';
import { authenticate,hashToken } from '../src/auth.js';
import { registerStationMediaRoutes } from '../src/routes/station-media-routes.js';
import { createRequestErrorHandler } from '../src/request-observability.js';

test('protected media streams stored bytes only after current owner authorization', {
  skip:process.env.RUN_STATION_MEDIA_STREAM_INTEGRATION!=='1'&&'Requires disposable loopback migrated PG',
},async()=>{
  assert.match(process.env.DATABASE_URL,/127\.0\.0\.1.*_migration_test$/);
  const owners=[],assetId=crypto.randomUUID(),key=`fixture/${assetId}`;
  let server,reads=0;
  try {
    for(let index=0;index<2;index++){
      const userId=crypto.randomUUID(),token=crypto.randomBytes(32).toString('hex');owners.push({userId,token});
      await query("INSERT INTO users(id,email,password_hash,display_name,ai_id) VALUES (?,?,'fixture',?,?)",
        [userId,`${userId}@example.invalid`,`Media ${userId}`,String(crypto.randomInt(100000000000,999999999999))]);
      await query("INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES (?,?,?,clock_timestamp()+INTERVAL '1 hour')",
        [crypto.randomUUID(),userId,hashToken(token)]);
    }
    await query("INSERT INTO station_media_assets(id,user_id,kind,status,storage_provider,storage_key,mime_type) VALUES (?,?,'image','uploaded','oss',?,'image/webp')",[assetId,owners[0].userId,key]);
    const app=express();
    registerStationMediaRoutes(app,{authenticate,asyncHandler:fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next),
      fetchMediaObject:async args=>{
        reads++;assert.equal(args.objectKey,key);
        return new Response(Buffer.from('explicit-fixture-object'),{headers:{'content-type':'image/webp'}});
      }});
    app.use(createRequestErrorHandler({production:true,logger:{error(){}}}));
    await new Promise(resolve=>{server=app.listen(0,'127.0.0.1',resolve);});
    const url=`http://127.0.0.1:${server.address().port}/api/station/media-assets/${assetId}/file`;
    const get=owner=>fetch(url,{headers:owner?{Authorization:`Bearer ${owner.token}`}:{}});
    assert.equal((await get()).status,401);
    assert.equal((await get(owners[1])).status,404);
    assert.equal(reads,0,'Unauthorized requests must not read object storage');
    const own=await get(owners[0]);
    assert.equal(own.status,200);
    assert.equal(await own.text(),'explicit-fixture-object');
    assert.equal(own.headers.get('cache-control'),'private, no-store');
    assert.equal(reads,1);
  } finally {
    if(server)await new Promise(resolve=>server.close(resolve));
    await query('DELETE FROM users WHERE id=ANY(?::text[])',[owners.map(owner=>owner.userId)]);
    await closeDatabase();
  }
});
