const { verifySupabaseJwt, chatUserFromJwt } = require("../_lib/chat-jwt");
const { JWT_SECRET } = require("../_lib/env");
const { adminClient } = require("../_lib/supabase-admin");
const { cors, readJson, send, bearer } = require("../_lib/http");
const { canDeleteMessage } = require("../_lib/chat-files");
const { deleteMessageStorage } = require("../_lib/chat-cleanup");

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
    return send(res, 401, { ok: false, error: "Sign in again to delete messages." });
  }

  const body = readJson(req);
  const id = String(body.id || body.messageId || "").trim();
  if (!id) {
    return send(res, 400, { ok: false, error: "Missing message." });
  }

  const admin = adminClient();
  if (!admin) {
    return send(res, 503, { ok: false, error: "Message delete is not available yet." });
  }

  try {
    const messageRes = await admin.from("chat_messages").select("*").eq("id", id).maybeSingle();
    if (messageRes.error) throw messageRes.error;
    const message = messageRes.data;
    if (!message) {
      return send(res, 200, { ok: true, alreadyGone: true });
    }
    const threadRes = await admin.from("chat_threads").select("*").eq("id", message.thread_id).maybeSingle();
    if (threadRes.error) throw threadRes.error;
    if (!canDeleteMessage(user, message, threadRes.data)) {
      return send(res, 403, { ok: false, error: "You cannot delete that message." });
    }
    const atts = await admin.from("chat_attachments").select("*").eq("message_id", id);
    if (atts.error) throw atts.error;
    const files = await deleteMessageStorage(admin, message, atts.data || []);
    const removed = await admin.from("chat_messages").delete().eq("id", id).select("id");
    if (removed.error) throw removed.error;
    return send(res, 200, {
      ok: true,
      deleted: Boolean(removed.data && removed.data.length),
      files: files
    });
  } catch (err) {
    return send(res, 500, { ok: false, error: err.message || "Could not delete that message." });
  }
};
