import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { acceptFriendRequest, cancelFriendRequest, createFriendRequest, rejectFriendRequest } from "../src/social-repository.js";
import { closeDatabase, query } from "../src/db.js";

const enabled = process.env.RUN_SOCIAL_FRIEND_REQUEST_POSTGRES === "1";

test("friend request transitions and relationships serialize in PostgreSQL", {
  skip: !enabled && "RUN_SOCIAL_FRIEND_REQUEST_POSTGRES=1 requires a loopback *_migration_test database",
}, async t => {
  const database = new URL(process.env.DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1"].includes(database.hostname));
  assert.match(database.pathname, /_migration_test$/);
  const ids = Array.from({ length: 3 }, () => randomUUID());
  const [requesterId,targetId,otherId] = ids;
  const aiIds = ["930000000001","930000000002","930000000003"];
  t.after(async () => {
    await query("DELETE FROM users WHERE id=ANY(?::bpchar[])", [ids]);
    await closeDatabase();
  });
  for(let i=0;i<ids.length;i+=1) {
    await query("INSERT INTO users(id,email,password_hash,display_name,ai_id) VALUES (?,?,'test',?,?)",
      [ids[i],`${ids[i]}@social.example.invalid`,`Social ${i}`,aiIds[i]]);
    await query("INSERT INTO user_profiles(user_id,nickname,avatar_text) VALUES (?,?,'妙')", [ids[i],`Social ${i}`]);
  }
  const attemptPair=(left,right)=>Promise.allSettled([left(),right()]);
  const accepted = await createFriendRequest({requesterUserId:requesterId,targetUserId:targetId,message:"first"});
  const acceptedPair=await attemptPair(
    ()=>acceptFriendRequest({requestId:accepted.id,targetUserId:targetId}),
    ()=>cancelFriendRequest({requestId:accepted.id,requesterUserId:requesterId}),
  );
  assert.equal(acceptedPair.filter(result=>result.status==="fulfilled").length,1);
  const [acceptedRows]=await query("SELECT status FROM social_requests WHERE id=?",[accepted.id]);
  assert.equal(acceptedRows.status,acceptedPair[0].status==="fulfilled"?"accepted":"cancelled");
  if(acceptedRows.status==="accepted") {
    const [relationships]=await query("SELECT count(*)::int AS count FROM social_relationships WHERE relation_type='friend' AND status='active' AND ((follower_user_id=? AND followed_user_id=?) OR (follower_user_id=? AND followed_user_id=?))",
    [requesterId,targetId,targetId,requesterId]);
    const [threads]=await query("SELECT count(*)::int AS count FROM chat_threads WHERE kind='direct' AND ((user_id=? AND peer_user_id=?) OR (user_id=? AND peer_user_id=?))",
    [requesterId,targetId,targetId,requesterId]);
    const [notifications]=await query("SELECT count(*)::int AS count FROM notifications WHERE target_type='user' AND target_id=? AND kind='friend.accepted'",[targetId]);
    assert.equal(relationships.count,2);
    assert.equal(threads.count,2);
    assert.equal(notifications.count,1);
  }

  const rejected = await createFriendRequest({requesterUserId:requesterId,targetUserId:otherId,message:"second"});
  const rejectPair=await attemptPair(
    ()=>rejectFriendRequest({requestId:rejected.id,targetUserId:otherId}),
    ()=>acceptFriendRequest({requestId:rejected.id,targetUserId:otherId}),
  );
  assert.equal(rejectPair.filter(result=>result.status==="fulfilled").length,1);
  const [rejectedRows]=await query("SELECT status FROM social_requests WHERE id=?",[rejected.id]);
  const winner=rejectPair.find(result=>result.status==="fulfilled").value;
  assert.equal(rejectedRows.status,winner.status);
  const [relationships]=await query("SELECT count(*)::int AS count FROM social_relationships WHERE relation_type='friend' AND status='active' AND follower_user_id=? AND followed_user_id=?",
    [requesterId,otherId]);
  if(winner.status==="rejected") assert.equal(relationships.count,0);
  if(winner.status==="accepted") assert.equal(relationships.count,1);

  if (winner.status === "accepted") {
    await assert.rejects(createFriendRequest({ requesterUserId: requesterId, targetUserId: otherId, message: "retry" }), { status: 409 });
  } else {
    const reactivated = await createFriendRequest({ requesterUserId: requesterId, targetUserId: otherId, message: "retry" });
    const [requestRow] = await query("SELECT id,status,message FROM social_requests WHERE id=?", [reactivated.id]);
    assert.deepEqual(requestRow, { id: reactivated.id, status: "pending", message: "retry" });
    const attempts = await attemptPair(
      () => acceptFriendRequest({ requestId: reactivated.id, targetUserId: otherId }),
      () => acceptFriendRequest({ requestId: reactivated.id, targetUserId: otherId }),
    );
    assert.equal(attempts.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(attempts.find(result => result.status === "rejected").reason.status, 409);
  }

  const racedTarget=randomUUID();
  await query("INSERT INTO users(id,email,password_hash,display_name,ai_id) VALUES (?,?,'test','Race Target','930000000099')",[racedTarget,randomUUID()+"@social.example.invalid"]);
  ids.push(racedTarget);
  await query("INSERT INTO user_profiles(user_id,nickname,avatar_text) VALUES (?,'Race Target','妙')",[racedTarget]);
  const created=await Promise.all(Array.from({length:12},()=>createFriendRequest({requesterUserId:requesterId,targetUserId:racedTarget,message:"duplicate"})));
  assert.equal(new Set(created.map(item=>item.id)).size,1);
  assert.equal(created.filter(item=>item.notification).length,1);
  const [count]=await query("SELECT count(*)::int AS count FROM notifications WHERE target_type='friend_request' AND target_id=?",[created[0].id]);
  assert.equal(count.count,1);
  const acceptedDuplicate = await attemptPair(
    () => acceptFriendRequest({ requestId: created[0].id, targetUserId: racedTarget }),
    () => createFriendRequest({ requesterUserId: requesterId, targetUserId: racedTarget, message: "replay" }),
  );
  assert.equal(acceptedDuplicate[0].status, "fulfilled");
  if (acceptedDuplicate[1].status === "fulfilled") assert.equal(acceptedDuplicate[1].value.id, created[0].id);
  else assert.equal(acceptedDuplicate[1].reason.status, 409);
  const pending = await query("SELECT id FROM social_requests WHERE requester_user_id=? AND target_user_id=? AND status='pending'", [requesterId, racedTarget]);
  assert.deepEqual(pending, []);
});
