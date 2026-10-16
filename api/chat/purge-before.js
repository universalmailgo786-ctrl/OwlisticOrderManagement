const { verifySupabaseJwt, chatUserFromJwt } = require("../_lib/chat-jwt");
const { JWT_SECRET, SERVICE_KEY } = require("../_lib/env");
const { adminClient } = require("../_lib/supabase-admin");
const { cors, readJson, send, bearer, queryOf } = require("../_lib/http");
const {
  RETENTION_DAYS,
  cutoffIso,
  runChatCleanup,
  cleanupExpiredMessages,
  cleanupOrphanAttachments,
  cleanupOrphanLegacyImages
} = require("../_lib/chat-cleanup");

function parseCutoff(value) {
  if (value == null || String(value).trim() === "") {
    return cutoffIso();
  }
  const raw = String(value).trim();
  const date = new Date(raw);
  if (isNaN(date.getTime())) return null;
  return date.toISOString();
}

async function countBefore(admin, cutoff) {
  const result = await admin
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .lt("created_at", cutoff);
  if (result.error) throw result.error;
  return Number(result.count || 0);
}

async function countKeep(admin, cutoff) {
  const result = await admin
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .gte("created_at", cutoff);
  if (result.error) throw result.error;
  return Number(result.count || 0);
}

module.exports = async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== "POST" && req.method !== "GET") {
    return send(res, 405, { ok: false, error: "Method not allowed." });
  }
  if (!JWT_SECRET) {
    return send(res, 503, { ok: false, error: "Chat is not configured." });
  }
  if (!SERVICE_KEY) {
    return send(res, 503, { ok: false, error: "Server storage credentials are not configured." });
  }

  const payload = verifySupabaseJwt(bearer(req), JWT_SECRET);
  const user = chatUserFromJwt(payload);
  if (!payload || !user.username || !user.isSuperAdmin) {
    return send(res, 401, { ok: false, error: "SuperAdmin sign-in required." });
  }

  const body = req.method === "POST" ? readJson(req) : {};
  const query = queryOf(req);
  const cutoff = parseCutoff(body.cutoff || query.cutoff);
  if (!cutoff) {
    return send(res, 400, { ok: false, error: "Invalid cutoff date." });
  }

  const limit = Math.max(1, Math.min(500, Number(body.limit || query.limit || 200)));
  const cleanOrphans = body.orphans !== false && String(query.orphans || "1") !== "0";
  const dryRun = Boolean(body.dryRun || query.dryRun === "1" || query.dryRun === "true");

  const admin = adminClient();
  if (!admin) {
    return send(res, 503, { ok: false, error: "File cleanup is not available yet." });
  }

  try {
    const before = await countBefore(admin, cutoff);
    const keep = await countKeep(admin, cutoff);
    if (dryRun) {
      return send(res, 200, {
        ok: true,
        dryRun: true,
        retentionDays: RETENTION_DAYS,
        cutoff: cutoff,
        messagesBeforeCutoff: before,
        messagesToKeep: keep
      });
    }

    const full = body.full === true || String(query.full || "") === "1";
    if (full) {
      const result = await runChatCleanup({
        admin: admin,
        cutoff: cutoff,
        limit: limit,
        maxRounds: Number(body.maxRounds || query.maxRounds || 20)
      });
      return send(res, 200, {
        ok: true,
        retentionDays: RETENTION_DAYS,
        cutoff: cutoff,
        before: { messagesBeforeCutoff: before, messagesToKeep: keep },
        result: result,
        after: {
          messagesBeforeCutoff: await countBefore(admin, cutoff),
          messagesToKeep: await countKeep(admin, cutoff)
        }
      });
    }

    const expired = await cleanupExpiredMessages(admin, { cutoff: cutoff, limit: limit });
    let orphans = null;
    let legacyImages = null;
    if (cleanOrphans && Number(expired.deletedMessages || 0) === 0 && Number(expired.scanned || 0) === 0) {
      orphans = await cleanupOrphanAttachments(admin);
      legacyImages = await cleanupOrphanLegacyImages(admin);
    }

    return send(res, 200, {
      ok: true,
      retentionDays: RETENTION_DAYS,
      cutoff: cutoff,
      before: { messagesBeforeCutoff: before, messagesToKeep: keep },
      expired: expired,
      orphans: orphans,
      legacyImages: legacyImages,
      after: {
        messagesBeforeCutoff: await countBefore(admin, cutoff),
        messagesToKeep: await countKeep(admin, cutoff)
      }
    });
  } catch (err) {
    return send(res, 500, { ok: false, error: err.message || "Could not purge old chat data." });
  }
};
