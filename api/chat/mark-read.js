const { verifySupabaseJwt, chatUserFromJwt } = require("../_lib/chat-jwt");
const { JWT_SECRET } = require("../_lib/env");
const { adminClient } = require("../_lib/supabase-admin");
const { cors, readJson, send, bearer } = require("../_lib/http");
const { isSuperAdminSender, canAccessThread, isUuid } = require("../_lib/chat-files");

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
    return send(res, 401, { ok: false, error: "Sign in to update messages." });
  }
  const admin = adminClient();
  if (!admin) {
    return send(res, 503, { ok: false, error: "Chat is not configured." });
  }
  const body = readJson(req);
  const threadId = String((body && body.threadId) || "").trim();
  if (!isUuid(threadId)) {
    return send(res, 400, { ok: false, error: "Missing conversation." });
  }
  try {
    const thread = await admin.from("chat_threads").select("*").eq("id", threadId).maybeSingle();
    if (thread.error) throw thread.error;
    if (!thread.data || !canAccessThread(user, thread.data)) {
      return send(res, 403, { ok: false, error: "You cannot open that conversation." });
    }
    const listed = await admin
      .from("chat_messages")
      .select("id, sender_id, read_at")
      .eq("thread_id", threadId)
      .is("read_at", null)
      .limit(500);
    if (listed.error) throw listed.error;
    const mine = String(user.username || "").toLowerCase();
    const ids = (listed.data || []).filter(function (row) {
      const sender = String(row.sender_id || "").toLowerCase();
      return user.isSuperAdmin ? !isSuperAdminSender(sender) : sender !== mine;
    }).map(function (row) { return row.id; });
    if (ids.length) {
      const updated = await admin
        .from("chat_messages")
        .update({ read_at: new Date().toISOString() })
        .in("id", ids);
      if (updated.error) throw updated.error;
    }
    return send(res, 200, { ok: true, marked: ids.length });
  } catch (err) {
    return send(res, 500, { ok: false, error: err.message || "Could not mark messages as read." });
  }
};
