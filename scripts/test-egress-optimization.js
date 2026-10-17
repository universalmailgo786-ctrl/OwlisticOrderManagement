/**
 * Static + logic checks for Supabase egress optimizations.
 * Does not call production APIs or mutate data.
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error("FAIL", msg);
  } else {
    console.log("ok", msg);
  }
}

const checkFiles = [
  "api/_lib/sheet-logic.js",
  "js/records.js",
  "js/sheet-sync.js",
  "js/chat-client.js",
  "js/chat-nav.js",
  "js/chat-page.js",
  "js/chat-config.js",
  "api/chat/delete-message.js",
  "api/chat/mark-read.js"
];

checkFiles.forEach(function (file) {
  const result = spawnSync(process.execPath, ["--check", path.join(ROOT, file)], { encoding: "utf8" });
  assert(result.status === 0, "syntax " + file + (result.stderr ? " " + result.stderr.trim() : ""));
});

const sheetLogic = fs.readFileSync(path.join(ROOT, "api/_lib/sheet-logic.js"), "utf8");
assert(sheetLogic.indexOf("listOrdersByIds") >= 0, "sheet-logic exports listOrdersByIds action");
assert(sheetLogic.indexOf("order_id = any($1::text[])") >= 0, "listOrdersByIds uses targeted id filter");
assert(
  /select order_id, tab_name, account_name, payload, created_at, updated_at[\s\S]*from public\.sheet_orders[\s\S]*order by order_id/.test(sheetLogic),
  "listOrders selects explicit columns (not select *)"
);
assert(
  sheetLogic.indexOf("payload->>'boardStatus' as board_status") >= 0,
  "listOrderDigest returns slim status fields"
);
assert(
  /where lower\(tab_name\) = lower\(\$1\) or lower\(account_name\) = lower\(\$1\)/.test(sheetLogic),
  "restricted accounts filter orders in SQL"
);

const records = fs.readFileSync(path.join(ROOT, "js/records.js"), "utf8");
assert(records.indexOf("LIVE_POLL_MS = 25000") >= 0, "records digest poll is 25s");
assert(records.indexOf("FULL_EVERY_TICKS = 12") >= 0, "full reconcile ~ every 12 digest ticks (~5 min)");
assert(records.indexOf("fetchOrdersByIds") >= 0, "records fetches changed orders by id");
assert(records.indexOf("document.hidden") >= 0, "records skips polls when tab hidden");
assert(records.indexOf("liveFocusBound") >= 0, "records binds focus listeners once");
assert(records.indexOf("lastDigestFingerprint") >= 0, "records skips work when digest unchanged");
assert(records.indexOf("isFreshUnsyncedOrder") >= 0, "records preserves fresh unsynced local orders");

const sheetSync = fs.readFileSync(path.join(ROOT, "js/sheet-sync.js"), "utf8");
assert(sheetSync.indexOf("fetchOrdersByIds") >= 0, "sheet-sync exposes fetchOrdersByIds");
assert(sheetSync.indexOf("ordersInFlight") >= 0, "sheet-sync dedupes full order fetches");
assert(sheetSync.indexOf("digestInFlight") >= 0, "sheet-sync dedupes digest fetches");
assert(sheetSync.indexOf("ordersByIdsInFlight") >= 0, "sheet-sync dedupes by-id fetches");

const chatConfig = fs.readFileSync(path.join(ROOT, "js/chat-config.js"), "utf8");
assert(chatConfig.indexOf("pollMs: 60000") >= 0, "chat healthy poll is 60s");
assert(chatConfig.indexOf("pollMsRealtimeDown: 20000") >= 0, "chat down poll is 20s");

const chatClient = fs.readFileSync(path.join(ROOT, "js/chat-client.js"), "utf8");
assert(chatClient.indexOf('.select("*")') < 0, "chat-client avoids select(*)");
assert(
  chatClient.indexOf("id, thread_id, sender_id, message, created_at, read_at, edited_at, image_url, has_files") >= 0,
  "chat-client selects message columns explicitly"
);

const chatNav = fs.readFileSync(path.join(ROOT, "js/chat-nav.js"), "utf8");
assert(chatNav.indexOf("inboxRealtimeOk") >= 0, "chat-nav tracks Realtime health");
assert(chatNav.indexOf("pollMsRealtimeDown") >= 0, "chat-nav uses down-interval fallback");
assert(chatNav.indexOf("document.hidden") >= 0, "chat-nav skips poll when hidden");

const chatPage = fs.readFileSync(path.join(ROOT, "js/chat-page.js"), "utf8");
assert(chatPage.indexOf("pageRealtimeOk") >= 0, "chat-page tracks Realtime health");
assert(chatPage.indexOf("reconcileMs") >= 0, "chat-page slows poll when Realtime is healthy");
assert(chatPage.indexOf("document.hidden") >= 0, "chat-page skips poll when hidden");

const deleteMsg = fs.readFileSync(path.join(ROOT, "api/chat/delete-message.js"), "utf8");
assert(deleteMsg.indexOf('.select("*")') < 0, "delete-message avoids select(*)");

const markRead = fs.readFileSync(path.join(ROOT, "api/chat/mark-read.js"), "utf8");
assert(markRead.indexOf('.select("*")') < 0, "mark-read avoids select(*)");

// Digest fingerprint helper (mirrors records.js contract)
function digestFingerprint(orders) {
  return (orders || []).map(function (row) {
    return String(row && row.id || "") + ":" + String(row && row.updatedAt || "") + ":" +
      String(row && (row.boardStatus || row.overallStatus) || "");
  }).sort().join("|");
}
const a = digestFingerprint([
  { id: "ORD-002", updatedAt: "2026-01-01T00:00:00Z", boardStatus: "in-progress" },
  { id: "ORD-001", updatedAt: "2026-01-02T00:00:00Z", boardStatus: "completed" }
]);
const b = digestFingerprint([
  { id: "ORD-001", updatedAt: "2026-01-02T00:00:00Z", boardStatus: "completed" },
  { id: "ORD-002", updatedAt: "2026-01-01T00:00:00Z", boardStatus: "in-progress" }
]);
assert(a === b, "digest fingerprint is order-independent");
const c = digestFingerprint([
  { id: "ORD-001", updatedAt: "2026-01-03T00:00:00Z", boardStatus: "completed" },
  { id: "ORD-002", updatedAt: "2026-01-01T00:00:00Z", boardStatus: "in-progress" }
]);
assert(a !== c, "digest fingerprint changes when updatedAt changes");

if (failed) {
  console.error("egress optimization checks failed:", failed);
  process.exit(1);
}
console.log("egress optimization checks passed");
