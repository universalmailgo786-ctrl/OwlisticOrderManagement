const { CHAT_CRON_SECRET, SERVICE_KEY, JWT_SECRET, POSTGRES_URL } = require("../_lib/env");
const { verifySupabaseJwt, chatUserFromJwt } = require("../_lib/chat-jwt");
const { cors, send, bearer, queryOf } = require("../_lib/http");
const { runChatCleanup, RETENTION_DAYS } = require("../_lib/chat-cleanup");
const {
  runCompletedOrderCleanup,
  COMPLETED_RETENTION_DAYS
} = require("../_lib/completed-order-cleanup");

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

  const out = {
    ok: true,
    chatRetentionDays: RETENTION_DAYS,
    completedRetentionDays: COMPLETED_RETENTION_DAYS
  };

  try {
    if (SERVICE_KEY) {
      out.chat = await runChatCleanup();
    } else {
      out.chat = { ok: false, skipped: true, error: "Server storage credentials are not configured." };
    }
  } catch (err) {
    out.chat = { ok: false, error: err.message || "Chat cleanup failed." };
  }

  try {
    if (POSTGRES_URL) {
      // Hobby cron is 60s: archive text fields in DB first (removes media from the app).
      // Drive trash is attempted with short timeouts on a small batch afterward.
      out.completedOrders = await runCompletedOrderCleanup({
        maxRounds: 4,
        limit: 30,
        skipDrive: true
      });
      try {
        out.completedOrdersDrive = await runCompletedOrderCleanup({
          maxRounds: 1,
          limit: 4,
          skipDrive: false
        });
      } catch (driveErr) {
        out.completedOrdersDrive = {
          ok: false,
          error: driveErr.message || "Drive cleanup skipped"
        };
      }
    } else {
      out.completedOrders = { ok: false, skipped: true, error: "Postgres is not configured." };
    }
  } catch (err) {
    out.completedOrders = { ok: false, error: err.message || "Completed-order cleanup failed." };
  }

  const failed = (out.chat && out.chat.ok === false && !out.chat.skipped) ||
    (out.completedOrders && out.completedOrders.ok === false && !out.completedOrders.skipped);
  return send(res, failed ? 500 : 200, out);
};
