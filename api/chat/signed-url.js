const { verifySupabaseJwt, chatUserFromJwt } = require("../_lib/chat-jwt");
const { JWT_SECRET } = require("../_lib/env");
const { adminClient } = require("../_lib/supabase-admin");
const { cors, readJson, send, bearer } = require("../_lib/http");
const { BUCKET, parseChatPath, canAccessThread } = require("../_lib/chat-files");

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
    return send(res, 401, { ok: false, error: "Sign in again to open files." });
  }

  const body = readJson(req);
  const paths = Array.isArray(body.paths) ? body.paths : [];
  const unique = Array.from(new Set(paths.map(function (value) { return String(value || "").trim(); }).filter(Boolean)));
  if (!unique.length) {
    return send(res, 200, { ok: true, urls: {} });
  }
  if (unique.length > 40) {
    return send(res, 400, { ok: false, error: "Too many files requested." });
  }

  const admin = adminClient();
  if (!admin) {
    return send(res, 503, { ok: false, error: "File access is not available yet." });
  }

  try {
    const urls = {};
    for (let i = 0; i < unique.length; i++) {
      const storagePath = unique[i];
      const parsed = parseChatPath(storagePath);
      if (!parsed) continue;
      const thread = await admin.from("chat_threads").select("id, user_id").eq("id", parsed.threadId).maybeSingle();
      if (thread.error) throw thread.error;
      if (!thread.data || !canAccessThread(user, thread.data)) continue;
      const signed = await admin.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 60);
      if (signed.data && signed.data.signedUrl) urls[storagePath] = signed.data.signedUrl;
    }
    return send(res, 200, { ok: true, urls: urls });
  } catch (err) {
    return send(res, 500, { ok: false, error: err.message || "Could not create file links." });
  }
};
