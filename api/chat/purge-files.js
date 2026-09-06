const { verifySupabaseJwt, chatUserFromJwt } = require("../_lib/chat-jwt");
const { JWT_SECRET } = require("../_lib/env");
const { adminClient } = require("../_lib/supabase-admin");
const { cors, readJson, send, bearer } = require("../_lib/http");
const { BUCKET, parseChatPath, parsePublicImageUrl, canAccessThread, deleteStorageObjects } = require("../_lib/chat-files");

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
    return send(res, 401, { ok: false, error: "Sign in again to remove files." });
  }

  const body = readJson(req);
  const incoming = Array.isArray(body.paths) ? body.paths : [];
  const items = [];
  incoming.forEach(function (value) {
    if (!value) return;
    if (typeof value === "string") {
      const parsed = parseChatPath(value);
      const legacy = parsePublicImageUrl(value);
      if (parsed) items.push({ bucket: BUCKET, path: value, threadId: parsed.threadId });
      else if (legacy) items.push(legacy);
      return;
    }
    if (value.path) {
      const parsed = parseChatPath(value.path);
      items.push({
        bucket: value.bucket || BUCKET,
        path: value.path,
        threadId: parsed && parsed.threadId
      });
    }
  });

  if (!items.length) {
    return send(res, 200, { ok: true, deleted: 0 });
  }

  const admin = adminClient();
  if (!admin) {
    return send(res, 503, { ok: false, error: "File cleanup is not available yet." });
  }

  try {
    const allowed = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.bucket === BUCKET) {
        const parsed = parseChatPath(item.path);
        if (!parsed) continue;
        const thread = await admin.from("chat_threads").select("id, user_id").eq("id", parsed.threadId).maybeSingle();
        if (!thread.data || !canAccessThread(user, thread.data)) continue;
        allowed.push(item);
      } else if (item.bucket === "chat-images" && user.isSuperAdmin) {
        allowed.push(item);
      } else if (item.bucket === "chat-images") {
        const folder = String(item.path || "").split("/")[0];
        if (folder && folder.toLowerCase() === String(user.username).toLowerCase().replace(/[^a-z0-9._-]/g, "")) {
          allowed.push(item);
        }
      }
    }
    const result = await deleteStorageObjects(admin, allowed);
    return send(res, 200, { ok: true, deleted: result.deleted, missing: result.missing });
  } catch (err) {
    return send(res, 500, { ok: false, error: err.message || "Could not remove those files." });
  }
};
