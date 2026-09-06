require("./load-env")();

const crypto = require("crypto");
const { adminClient } = require("../api/_lib/supabase-admin");
const { BUCKET, ensurePrivateBucket, classifyFile, canEditMessage, canDeleteMessage } = require("../api/_lib/chat-files");
const { cleanupExpiredMessages } = require("../api/_lib/chat-cleanup");

function assert(cond, label) {
  if (!cond) throw new Error("FAIL " + label);
  console.log("ok", label);
}

async function main() {
  assert(classifyFile("brief.pdf", "application/pdf").ok, "pdf allowed");
  assert(classifyFile("notes.txt", "text/plain").ok, "txt allowed");
  assert(classifyFile("virus.exe", "application/x-msdownload").ok === false, "exe blocked");
  assert(classifyFile("run.sh", "application/x-sh").ok === false, "sh blocked");

  const user = { username: "fahad", isSuperAdmin: false };
  const admin = { username: "SuperAdmin", isSuperAdmin: true };
  const thread = { id: "t1", user_id: "fahad" };
  const userMsg = { sender_id: "fahad", thread_id: "t1" };
  const adminMsg = { sender_id: "SuperAdmin", thread_id: "t1" };
  assert(canEditMessage(user, userMsg, thread), "user can edit own");
  assert(!canEditMessage(user, adminMsg, thread), "user cannot edit admin");
  assert(canEditMessage(admin, adminMsg, thread), "admin can edit own");
  assert(!canEditMessage(admin, userMsg, thread), "admin cannot edit user");
  assert(canDeleteMessage(user, userMsg, thread), "user can delete own");
  assert(!canDeleteMessage(user, adminMsg, thread), "user cannot delete admin");
  assert(canDeleteMessage(admin, adminMsg, thread), "admin can delete own");
  assert(canDeleteMessage(admin, userMsg, thread), "admin can moderate-delete user");
  assert(!canDeleteMessage(user, userMsg, { id: "t2", user_id: "other" }), "user cannot touch other thread");

  const db = adminClient();
  if (!db) {
    console.log("skip live cleanup test (no SUPABASE_SERVICE_ROLE_KEY)");
    return;
  }

  await ensurePrivateBucket(db);
  const username = "cleanuptestuser";
  let threadRow = (await db.from("chat_threads").select("*").eq("user_id", username).maybeSingle()).data;
  if (!threadRow) {
    const created = await db.from("chat_threads").insert({ user_id: username }).select("*").single();
    if (created.error) throw created.error;
    threadRow = created.data;
  }

  const messageId = crypto.randomUUID();
  const objectPath = "chat/" + threadRow.id + "/" + messageId + "/cleanup-test.txt";
  const uploaded = await db.storage.from(BUCKET).upload(objectPath, Buffer.from("cleanup-test"), {
    contentType: "text/plain",
    upsert: true
  });
  if (uploaded.error) throw uploaded.error;

  const createdAt = new Date(Date.now() - 11 * 24 * 60 * 60 * 1000).toISOString();
  const inserted = await db.from("chat_messages").insert({
    id: messageId,
    thread_id: threadRow.id,
    sender_id: username,
    message: "expired cleanup test",
    has_files: true,
    created_at: createdAt
  }).select("id").single();
  if (inserted.error) throw inserted.error;

  const att = await db.from("chat_attachments").insert({
    message_id: messageId,
    storage_path: objectPath,
    file_name: "cleanup-test.txt",
    mime_type: "text/plain",
    size_bytes: 13,
    attachment_type: "file"
  }).select("id").single();
  if (att.error) throw att.error;

  const result = await cleanupExpiredMessages(db, { limit: 200 });
  assert(result.deletedMessages >= 1, "expired messages deleted (" + result.deletedMessages + ")");

  const leftoverMsg = await db.from("chat_messages").select("id").eq("id", messageId).maybeSingle();
  if (leftoverMsg.error) throw leftoverMsg.error;
  assert(!leftoverMsg.data, "expired message row gone");

  const leftoverAtt = await db.from("chat_attachments").select("id").eq("message_id", messageId);
  if (leftoverAtt.error) throw leftoverAtt.error;
  assert(!(leftoverAtt.data && leftoverAtt.data.length), "attachment metadata gone");

  const stored = await db.storage.from(BUCKET).download(objectPath);
  assert(Boolean(stored.error), "storage object removed");

  console.log("live cleanup test passed", {
    scanned: result.scanned,
    deletedMessages: result.deletedMessages,
    files: result.files
  });
}

main().catch(function (err) {
  console.error(err.message || err);
  process.exit(1);
});
