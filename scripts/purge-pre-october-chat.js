#!/usr/bin/env node
/**
 * Delete chat messages + storage attachments older than retention (default 7 days).
 * Prefers production SuperAdmin API when SERVICE_ROLE is not local.
 *
 *   node scripts/purge-pre-october-chat.js
 *   KEEP_AFTER=2026-10-01T00:00:00.000Z node scripts/purge-pre-october-chat.js
 */
require("./load-env")();

const { adminClient } = require("../api/_lib/supabase-admin");
const { RETENTION_DAYS, cutoffIso, runChatCleanup } = require("../api/_lib/chat-cleanup");

const PROD = process.env.OWLISTIC_API_BASE || "https://owlistic-order-management.vercel.app";

function keepAfterIso() {
  if (process.env.KEEP_AFTER) {
    const date = new Date(String(process.env.KEEP_AFTER).trim());
    if (isNaN(date.getTime())) throw new Error("Invalid KEEP_AFTER");
    return date.toISOString();
  }
  return cutoffIso();
}

async function viaProduction(cutoff) {
  const session = await fetch(PROD + "/api/chat/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: process.env.OWLISTIC_ADMIN_USER || "SuperAdmin",
      password: process.env.OWLISTIC_ADMIN_PASSWORD || "superman"
    })
  }).then(function (res) { return res.json(); });
  if (!session.ok || !session.access_token) {
    throw new Error((session && session.error) || "Could not sign in as SuperAdmin on production.");
  }
  const dry = await fetch(PROD + "/api/chat/purge-before", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + session.access_token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ cutoff: cutoff, dryRun: true })
  }).then(function (res) { return res.json(); });
  console.log(JSON.stringify({ dryRun: dry }, null, 2));
  const result = await fetch(PROD + "/api/chat/purge-before", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + session.access_token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ cutoff: cutoff, full: true, maxRounds: 30 })
  }).then(function (res) { return res.json(); });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok || (result.after && result.after.messagesBeforeCutoff > 0)) process.exit(2);
}

async function main() {
  const cutoff = keepAfterIso();
  console.log(JSON.stringify({ retentionDays: RETENTION_DAYS, cutoff: cutoff, project: "bgejcfjgolnascjkgdly" }));
  const admin = adminClient();
  if (!admin) {
    console.log("No local service role — using production SuperAdmin purge.");
    await viaProduction(cutoff);
    return;
  }
  const result = await runChatCleanup({ admin: admin, cutoff: cutoff, maxRounds: 30 });
  console.log(JSON.stringify(result, null, 2));
}

main().catch(function (err) {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
