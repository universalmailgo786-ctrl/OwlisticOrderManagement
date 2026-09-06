const { verifySupabaseJwt, chatUserFromJwt } = require("../_lib/chat-jwt");
const { JWT_SECRET } = require("../_lib/env");
const { adminClient } = require("../_lib/supabase-admin");
const { cors, send, bearer } = require("../_lib/http");
const { isSuperAdminSender } = require("../_lib/chat-files");

function unreadFor(rows, user) {
  const mine = String((user && user.username) || "").toLowerCase();
  const admin = Boolean(user && user.isSuperAdmin);
  const byThread = {};
  let total = 0;
  (rows || []).forEach(function (row) {
    const sender = String(row.sender_id || "").toLowerCase();
    const incoming = admin ? !isSuperAdminSender(sender) : sender !== mine;
    if (!incoming) return;
    byThread[row.thread_id] = (byThread[row.thread_id] || 0) + 1;
    total += 1;
  });
  return { total: total, byThread: byThread };
}

module.exports = async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== "GET" && req.method !== "POST") {
    return send(res, 405, { ok: false, error: "Method not allowed." });
  }
  if (!JWT_SECRET) {
    return send(res, 503, { ok: false, error: "Chat is not configured." });
  }
  const payload = verifySupabaseJwt(bearer(req), JWT_SECRET);
  const user = chatUserFromJwt(payload);
  if (!payload || !user.username) {
    return send(res, 401, { ok: false, total: 0, byThread: {} });
  }
  const admin = adminClient();
  if (!admin) {
    return send(res, 503, { ok: false, total: 0, byThread: {} });
  }
  try {
    let allowedIds = null;
    let query = admin.from("chat_messages").select("id, thread_id, sender_id, read_at").is("read_at", null).limit(500);
    if (!user.isSuperAdmin) {
      const threads = await admin.from("chat_threads").select("id").ilike("user_id", user.username);
      if (threads.error) throw threads.error;
      allowedIds = (threads.data || []).map(function (row) { return row.id; });
      if (!allowedIds.length) {
        return send(res, 200, { ok: true, total: 0, byThread: {} });
      }
      query = query.in("thread_id", allowedIds);
    }
    let listed = await query;
    if (listed.error) {
      listed = await admin.from("chat_messages").select("id, thread_id, sender_id, read_at").order("created_at", { ascending: false }).limit(500);
      if (listed.error) throw listed.error;
    }
    const rows = (listed.data || []).filter(function (row) {
      if (row.read_at) return false;
      if (allowedIds && allowedIds.indexOf(row.thread_id) < 0) return false;
      return true;
    });
    const summary = unreadFor(rows, user);
    return send(res, 200, { ok: true, total: summary.total, byThread: summary.byThread });
  } catch (err) {
    return send(res, 500, { ok: false, total: 0, byThread: {}, error: err.message || "Could not load unread count." });
  }
};
