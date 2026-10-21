import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test, { before, after } from 'node:test';
import pg from 'pg';
import { loadMigrationFiles } from '../src/migration-files.js';
import { applyPendingMigrations } from '../src/migration-ledger.js';
const enabled=process.env.RUN_FILE_SOURCE_MIGRATION_INTEGRATION==='1';
const integration=(name,work)=>test(name,{skip:!enabled&&'RUN_FILE_SOURCE_MIGRATION_INTEGRATION=1 with empty disposable loopback *_migration_test database'},work);
let client,migrations;const userId=crypto.randomUUID(),ids=[];
before(async()=>{
 if(!enabled)return;const url=new URL(process.env.DATABASE_URL);
 assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname)&&url.pathname.endsWith('_migration_test'));
 assert.equal(process.env.MIAOXUN_DOTENV_ENABLED,'false');client=new pg.Client({connectionString:url.toString()});await client.connect();
 assert.equal((await client.query("SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='public'")).rows[0].n,0);
 migrations=(await loadMigrationFiles()).filter(x=>x.filename<='043_file_text_sources.sql');
 await applyPendingMigrations({client,migrations:migrations.filter(x=>x.filename<'043_file_text_sources.sql')});
 await client.query("INSERT INTO users(id,email,password_hash,display_name,ai_id) VALUES($1,$2,'isolated-only','Legacy file migration','123456789123')",[userId,`${userId}@example.invalid`]);
 for(const status of ['processed','pending_upload','unsupported']){const id=crypto.randomUUID();ids.push(id);await client.query("INSERT INTO file_assets(id,user_id,original_filename,status,preprocessing_result) VALUES($1,$2,'legacy.txt',$3,$4::jsonb)",[id,userId,status,JSON.stringify({textPreview:'Legacy incomplete preview'})]);}
});
after(async()=>{if(client)await client.end();});
integration('042 legacy file upgrade preserves preview and never invents original text',async()=>{
 const result=await applyPendingMigrations({client,migrations});assert.equal(result.applied.length,1);
 const {rows}=await client.query('SELECT extracted_text,parse_version,preprocessing_result FROM file_assets WHERE user_id=$1',[userId]);assert.equal(rows.length,3);
 for(const row of rows){assert.equal(row.extracted_text,null);assert.equal(row.parse_version,null);assert.equal(row.preprocessing_result.textPreview,'Legacy incomplete preview');}
 assert.equal((await applyPendingMigrations({client,migrations})).applied.length,0);
});
integration('database rejects parser mismatches, overlong extracted text and half upload receipts',async()=>{
 for(const [sql,params] of [
  ['UPDATE file_assets SET extracted_text=$1 WHERE id=$2',['text',ids[0]]],
  ["UPDATE file_assets SET extracted_text=$1,parse_version='unknown' WHERE id=$2",['text',ids[0]]],
  ["UPDATE file_assets SET extracted_text=$1,parse_version='utf8-text-v1' WHERE id=$2",['x'.repeat(50001),ids[0]]],
  ['UPDATE file_assets SET upload_idempotency_key=$1 WHERE id=$2',[crypto.randomUUID(),ids[0]]],
 ])await assert.rejects(client.query(sql,params),error=>error.code==='23514');
});
