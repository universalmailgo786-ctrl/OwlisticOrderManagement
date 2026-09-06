const { verifySupabaseJwt, chatUserFromJwt } = require("../_lib/chat-jwt");
const { JWT_SECRET } = require("../_lib/env");
const { adminClient } = require("../_lib/supabase-admin");
const { cors, readJson, send, bearer } = require("../_lib/http");
const {
  BUCKET,
  MAX_BYTES,
  MAX_LABEL,
  classifyFile,
  isUuid,
  storagePath,
  canAccessThread,
  ensurePrivateBucket
} = require("../_lib/chat-files");

async function loadThread(admin, threadId) {
  const result = await admin.from("chat_threads").select("id, user_id").eq("id", threadId).maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

module.exports = async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== "POST") {
    return send(res, 405, { ok: false, error: "Method not allowed." });
  }
  if (!JWT_SECRET) {
    return send(res, 503, { ok: false, error: "Chat is not configured." });
  }
  const payload = verifySupabaseJwt(bearer(req), JWT_SECRET);
  const user = chatUserFromJwt(payload);
  if (!payload || !user.username) {
    return send(res, 401, { ok: false, error: "Sign in again to send files." });
  }

  const body = readJson(req);
  const threadId = String(body.threadId || "").trim();
  const messageId = String(body.messageId || "").trim();
  if (!isUuid(threadId) || !isUuid(messageId)) {
    return send(res, 400, { ok: false, error: "Missing conversation details for this upload." });
  }

  const filename = String(body.filename || body.fileName || "file");
  const contentType = String(body.contentType || "").toLowerCase();
  const classified = classifyFile(filename, contentType);
  if (!classified.ok) {
    return send(res, 400, { ok: false, error: classified.error });
  }

  const raw = String(body.data || "").replace(/^data:[^;]+;base64,/, "");
  let buf;
  try {
    buf = Buffer.from(raw, "base64");
  } catch (err) {
    return send(res, 400, { ok: false, error: "Could not read that file." });
  }
  if (!buf.length) {
    return send(res, 400, { ok: false, error: "File data was empty." });
  }
  if (buf.length > MAX_BYTES) {
    return send(res, 400, { ok: false, error: "That file is too large. Maximum size is " + MAX_LABEL + "." });
  }

  const admin = adminClient();
  if (!admin) {
    return send(res, 503, { ok: false, error: "File upload is not available yet." });
  }

  try {
    const thread = await loadThread(admin, threadId);
    if (!thread || !canAccessThread(user, thread)) {
      return send(res, 403, { ok: false, error: "You cannot upload to this conversation." });
    }

    const existing = await admin.from("chat_messages").select("id, sender_id, thread_id").eq("id", messageId).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) {
      if (String(existing.data.thread_id) !== threadId) {
        return send(res, 403, { ok: false, error: "That file does not belong to this conversation." });
      }
      const sender = String(existing.data.sender_id || "").toLowerCase();
      const own = user.isSuperAdmin
        ? /^(superadmin|admin)$/i.test(sender)
        : sender === String(user.username).toLowerCase();
      if (!own) {
        return send(res, 403, { ok: false, error: "You can only attach files to your own messages." });
      }
    }

    await ensurePrivateBucket(admin);
    const path = storagePath(threadId, messageId, filename);
    const uploaded = await admin.storage.from(BUCKET).upload(path, buf, {
      contentType: classified.mime,
      upsert: false
    });
    if (uploaded.error) {
      return send(res, 500, { ok: false, error: uploaded.error.message || "Could not save the file." });
    }

    const signed = await admin.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
    return send(res, 200, {
      ok: true,
      bucket: BUCKET,
      path: path,
      fileName: filename.split(/[/\\]/).pop() || filename,
      mimeType: classified.mime,
      sizeBytes: buf.length,
      attachmentType: classified.type,
      signedUrl: signed.data && signed.data.signedUrl ? signed.data.signedUrl : ""
    });
  } catch (err) {
    return send(res, 500, { ok: false, error: err.message || "Could not save the file." });
  }
};
