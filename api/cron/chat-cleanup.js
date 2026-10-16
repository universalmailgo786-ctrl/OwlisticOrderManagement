const { CHAT_CRON_SECRET, SERVICE_KEY, JWT_SECRET } = require("../_lib/env");
const { verifySupabaseJwt, chatUserFromJwt } = require("../_lib/chat-jwt");
const { cors, send, bearer, queryOf } = require("../_lib/http");
const { runChatCleanup, RETENTION_DAYS } = require("../_lib/chat-cleanup");

function authorized(req) {
  const token = bearer(req);
  const query = queryOf(req);
  const provided = token || String(query.secret || query.token || "").trim();

  if (CHAT_CRON_SECRET && provided && provided === CHAT_CRON_SECRET) return true;

  // Vercel Cron Job requests include this header.
  if (String((req.headers && req.headers["x-vercel-cron"]) || "") === "1") return true;

  if (JWT_SECRET && token) {
    const payload = verifySupabaseJwt(token, JWT_SECRET);
    const user = chatUserFromJwt(payload);
    if (payload && user && user.isSuperAdmin) return true;
  }

  return false;
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
  if (!authorized(req)) {
    return send(res, 401, { ok: false, error: "Unauthorized." });
  }
  if (!SERVICE_KEY) {
    return send(res, 503, { ok: false, error: "Server storage credentials are not configured." });
  }
  try {
    const result = await runChatCleanup();
    return send(res, 200, Object.assign({ retentionDays: RETENTION_DAYS }, result));
  } catch (err) {
    return send(res, 500, {
      ok: false,
      error: err.message || "Chat cleanup failed."
    });
  }
};
