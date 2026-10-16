#!/usr/bin/env node
/**
 * Delete chat messages + storage attachments created before October 1 (UTC).
 * Keeps October and later. Requires SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY).
 *
 *   node scripts/purge-pre-october-chat.js
 *   KEEP_AFTER=2026-10-01T00:00:00.000Z node scripts/purge-pre-october-chat.js
 */
require("./load-env")();

const { adminClient } = require("../api/_lib/supabase-admin");
const {
  cleanupExpiredMessages,
  cleanupOrphanAttachments,
  cleanupOrphanLegacyImages
} = require("../api/_lib/chat-cleanup");

function keepAfterIso() {
  const raw = String(process.env.KEEP_AFTER || "2026-10-01T00:00:00.000Z").trim();
  const date = new Date(raw);
  if (isNaN(date.getTime())) throw new Error("Invalid KEEP_AFTER: " + raw);
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

async function main() {
  const cutoff = keepAfterIso();
  const admin = adminClient();
  if (!admin) {
    console.error("Missing SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY in .env.local");
    process.exit(1);
  }

  const before = await countBefore(admin, cutoff);
  const keep = await countKeep(admin, cutoff);
  console.log(JSON.stringify({ cutoff, messagesBeforeCutoff: before, messagesToKeep: keep }, null, 2));

  let totalDeleted = 0;
  let totalScanned = 0;
  let filesDeleted = 0;
  let rounds = 0;
  const maxRounds = 200;

  while (rounds < maxRounds) {
    rounds += 1;
    const batch = await cleanupExpiredMessages(admin, { cutoff: cutoff, limit: 200 });
    totalScanned += Number(batch.scanned || 0);
    totalDeleted += Number(batch.deletedMessages || 0);
    filesDeleted += Number((batch.files && batch.files.deleted) || 0);
    console.log(JSON.stringify({
      round: rounds,
      scanned: batch.scanned,
      deletedMessages: batch.deletedMessages,
      filesDeleted: (batch.files && batch.files.deleted) || 0,
      deferred: batch.deferred || 0,
      errors: (batch.files && batch.files.errors && batch.files.errors.length) || 0
    }));
    if (!batch.scanned || batch.deletedMessages === 0) break;
  }

  const orphans = await cleanupOrphanAttachments(admin);
  const legacy = await cleanupOrphanLegacyImages(admin);
  const remainingBefore = await countBefore(admin, cutoff);
  const remainingKeep = await countKeep(admin, cutoff);

  console.log(JSON.stringify({
    ok: remainingBefore === 0,
    cutoff,
    rounds,
    totalScanned,
    totalDeleted,
    filesDeleted,
    orphans,
    legacyImages: legacy,
    remainingBeforeCutoff: remainingBefore,
    remainingOctoberPlus: remainingKeep
  }, null, 2));

  if (remainingBefore > 0) process.exit(2);
}

main().catch(function (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
