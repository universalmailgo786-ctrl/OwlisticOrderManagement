const { CHAT_CRON_SECRET, SERVICE_KEY } = require("../_lib/env");
const { cors, send, bearer, queryOf } = require("../_lib/http");
const { runChatCleanup } = require("../_lib/chat-cleanup");

function authorized(req) {
  if (!CHAT_CRON_SECRET) return false;
  const token = bearer(req);
  const query = queryOf(req);
  const provided = token || String(query.secret || query.token || "").trim();
  return Boolean(provided) && provided === CHAT_CRON_SECRET;
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
    return send(res, 200, result);
  } catch (err) {
    return send(res, 500, {
      ok: false,
      error: err.message || "Chat cleanup failed."
    });
  }
};
