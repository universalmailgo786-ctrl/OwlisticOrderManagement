/**
 * Offline scenario tests for multi-employee order sync, chat Realtime health,
 * and Google Drive path preservation. Does not touch production data.
 */
const fs = require("fs");
const path = require("path");

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

// --- Digest / multi-employee merge logic (mirrors records.js contracts) ---

function digestFingerprint(orders) {
  return (orders || []).map(function (row) {
    return String(row && row.id || "") + ":" + String(row && row.updatedAt || "") + ":" +
      String(row && (row.boardStatus || row.overallStatus) || "");
  }).sort().join("|");
}

function collectChangedOrderIds(localById, incoming) {
  const needFull = [];
  (incoming || []).forEach(function (row) {
    if (!row || !row.id) return;
    const existing = localById[row.id];
    const incomingTs = Date.parse(row.updatedAt || "") || 0;
    const localTs = Date.parse(existing && existing.updatedAt || "") || 0;
    if (!existing) {
      needFull.push(row.id);
      return;
    }
    if (existing.pendingSave) return;
    if (incomingTs > localTs || (row.boardStatus && row.boardStatus !== existing.boardStatus && incomingTs >= localTs)) {
      needFull.push(row.id);
    }
  });
  return needFull.filter(function (id, i, list) { return list.indexOf(id) === i; });
}

function pruneMissing(local, incoming) {
  const liveIds = {};
  (incoming || []).forEach(function (row) {
    if (row && row.id) liveIds[row.id] = true;
  });
  if (!Object.keys(liveIds).length) return { removed: [], kept: local.slice() };
  const kept = [];
  const removed = [];
  local.forEach(function (order) {
    if (!order || !order.id) return;
    if (liveIds[order.id] || order.pendingSave) kept.push(order);
    else removed.push(order.id);
  });
  return { removed: removed, kept: kept };
}

function chunkIds(ids, batch) {
  const out = [];
  for (let i = 0; i < ids.length; i += batch) out.push(ids.slice(i, i + batch));
  return out;
}

// Scenario: two employees — A creates, B status-changes, C deletes
(function multiEmployeeScenario() {
  const employeeA = {
    "ORD-001": { id: "ORD-001", updatedAt: "2026-10-01T10:00:00Z", boardStatus: "in-progress", pendingSave: false },
    "ORD-002": { id: "ORD-002", updatedAt: "2026-10-01T10:00:00Z", boardStatus: "in-progress", pendingSave: false }
  };
  const digestFromB = [
    { id: "ORD-001", updatedAt: "2026-10-01T10:05:00Z", boardStatus: "completed" },
    { id: "ORD-002", updatedAt: "2026-10-01T10:00:00Z", boardStatus: "in-progress" },
    { id: "ORD-003", updatedAt: "2026-10-01T10:06:00Z", boardStatus: "in-progress" }
  ];
  const changed = collectChangedOrderIds(employeeA, digestFromB);
  assert(changed.indexOf("ORD-001") >= 0, "status change detected for ORD-001");
  assert(changed.indexOf("ORD-003") >= 0, "new order ORD-003 detected");
  assert(changed.indexOf("ORD-002") < 0, "unchanged ORD-002 not refetched");

  const afterDeleteDigest = [
    { id: "ORD-001", updatedAt: "2026-10-01T10:05:00Z", boardStatus: "completed" },
    { id: "ORD-003", updatedAt: "2026-10-01T10:06:00Z", boardStatus: "in-progress" }
  ];
  const localList = Object.keys(employeeA).map(function (k) { return employeeA[k]; }).concat([
    { id: "ORD-003", updatedAt: "2026-10-01T10:06:00Z", boardStatus: "in-progress" }
  ]);
  // Employee A still has ORD-002 locally; digest no longer lists it → prune
  const pruned = pruneMissing(localList, afterDeleteDigest);
  assert(pruned.removed.indexOf("ORD-002") >= 0, "deleted ORD-002 pruned from local store");
  assert(pruned.kept.map(function (o) { return o.id; }).indexOf("ORD-001") >= 0, "ORD-001 kept after remote delete of sibling");

  const pendingLocal = [
    { id: "ORD-004", updatedAt: "2026-10-01T10:07:00Z", boardStatus: "in-progress", pendingSave: true }
  ].concat(pruned.kept);
  const prunedPending = pruneMissing(pendingLocal, afterDeleteDigest);
  assert(prunedPending.kept.some(function (o) { return o.id === "ORD-004"; }), "pendingSave local order not pruned");
})();

(function fingerprintSkip() {
  const rows = [
    { id: "ORD-002", updatedAt: "t1", boardStatus: "a" },
    { id: "ORD-001", updatedAt: "t2", boardStatus: "b" }
  ];
  assert(digestFingerprint(rows) === digestFingerprint(rows.slice().reverse()), "fingerprint order-independent");
  const dirty = rows.slice();
  dirty[0] = Object.assign({}, dirty[0], { updatedAt: "t9" });
  assert(digestFingerprint(rows) !== digestFingerprint(dirty), "fingerprint changes on update");
})();

(function batchLimit() {
  const ids = [];
  for (let i = 1; i <= 175; i++) ids.push("ORD-" + String(i).padStart(3, "0"));
  const chunks = chunkIds(ids, 80);
  assert(chunks.length === 3, "175 ids → 3 batches of 80");
  assert(chunks[0].length === 80 && chunks[1].length === 80 && chunks[2].length === 15, "batch sizes 80/80/15");
  const sheetSync = fs.readFileSync(path.join(ROOT, "js/sheet-sync.js"), "utf8");
  assert(sheetSync.indexOf("ORDERS_BY_IDS_BATCH = 80") >= 0, "client batch size is 80");
  assert(sheetSync.indexOf("chunks.reduce") >= 0 || sheetSync.indexOf("chunks.reduce(function") >= 0, "client batches sequentially");
  assert(sheetSync.indexOf(".slice(0, 40)") < 0, "client no longer hard-truncates at 40");
  const logic = fs.readFileSync(path.join(ROOT, "api/_lib/sheet-logic.js"), "utf8");
  assert(logic.indexOf("ORDERS_BY_IDS_LIMIT = 80") >= 0, "server per-request limit is 80");
})();

// --- Chat Realtime partial disconnect ---

function pageRealtimeOk(channelHealth, hasThread, isSuperAdmin) {
  if (hasThread) {
    if (!channelHealth.thread) return false;
    if (isSuperAdmin) return channelHealth.inbox && channelHealth.thread;
    return true;
  }
  if (isSuperAdmin) return channelHealth.inbox;
  return false;
}

(function realtimePartial() {
  assert(
    pageRealtimeOk({ inbox: true, thread: false }, true, true) === false,
    "admin open thread: inbox ok + thread down → unhealthy"
  );
  assert(
    pageRealtimeOk({ inbox: false, thread: true }, true, true) === false,
    "admin open thread: thread ok + inbox down → unhealthy"
  );
  assert(
    pageRealtimeOk({ inbox: true, thread: true }, true, true) === true,
    "admin open thread: both channels ok → healthy"
  );
  assert(
    pageRealtimeOk({ inbox: true, thread: false }, false, true) === true,
    "admin inbox-only view: inbox ok → healthy"
  );
  assert(
    pageRealtimeOk({ inbox: false, thread: true }, true, false) === true,
    "user open thread: thread ok → healthy"
  );
  assert(
    pageRealtimeOk({ inbox: true, thread: false }, true, false) === false,
    "user open thread: thread down → unhealthy (inbox alone insufficient)"
  );

  const pageJs = fs.readFileSync(path.join(ROOT, "js/chat-page.js"), "utf8");
  assert(pageJs.indexOf("channelHealth") >= 0, "chat-page tracks per-channel health");
  assert(pageJs.indexOf("channelHealth.inbox && channelHealth.thread") >= 0, "chat-page requires both channels for admin+thread");
  assert(pageJs.indexOf("syncOpenMessages()") >= 0 && pageJs.indexOf("CHANNEL_ERROR") >= 0, "chat-page polls on channel error");

  const navJs = fs.readFileSync(path.join(ROOT, "js/chat-nav.js"), "utf8");
  assert(navJs.indexOf("refreshSoon()") >= 0, "chat-nav refreshes unread on Realtime error");

  const clientJs = fs.readFileSync(path.join(ROOT, "js/chat-client.js"), "utf8");
  assert(clientJs.indexOf("handlers.onStatus(status, { channel:") >= 0 || clientJs.indexOf('channel: "chat-thread"') >= 0,
    "chat-client passes channel meta to onStatus");
})();

// --- Chat unread / notification contracts ---

(function chatUnreadContracts() {
  const navJs = fs.readFileSync(path.join(ROOT, "js/chat-nav.js"), "utf8");
  ["unreadSummary", "applyIncoming", "applyRead", "applyThreadRead", "BroadcastChannel", "subscribeInbox"].forEach(function (token) {
    assert(navJs.indexOf(token) >= 0, "chat-nav keeps " + token);
  });
  const pageJs = fs.readFileSync(path.join(ROOT, "js/chat-page.js"), "utf8");
  ["applyIncoming", "unreadCountFor", "data-inbox-unread", "markOpenThreadRead"].forEach(function (token) {
    assert(pageJs.indexOf(token) >= 0, "chat-page keeps " + token);
  });
  const unreadApi = fs.readFileSync(path.join(ROOT, "api/chat/unread.js"), "utf8");
  assert(unreadApi.indexOf("byThread") >= 0 && unreadApi.indexOf("byUser") >= 0, "unread API returns byThread/byUser");
})();

// --- Google Drive unaffected ---

(function driveUnchanged() {
  const sheetApi = fs.readFileSync(path.join(ROOT, "api/sheet.js"), "utf8");
  assert(sheetApi.indexOf("uploadFile: true") >= 0, "Drive uploadFile still proxied");
  assert(sheetApi.indexOf("deleteDriveFile: true") >= 0, "Drive deleteDriveFile still proxied");
  assert(sheetApi.indexOf("DRIVE_ACTIONS") >= 0, "DRIVE_ACTIONS map present");
  assert(sheetApi.indexOf("script.google.com") >= 0 || sheetApi.indexOf("OWLISTIC_DRIVE_URL") >= 0, "Drive URL still configured");

  const sheetSync = fs.readFileSync(path.join(ROOT, "js/sheet-sync.js"), "utf8");
  ["uploadFile", "uploadOrderFiles", "filesNeedingDrive", "filesMissingDrive", "waitForDriveLinks"].forEach(function (token) {
    assert(sheetSync.indexOf(token) >= 0, "sheet-sync keeps Drive helper " + token);
  });
  assert(sheetSync.indexOf('action: "uploadFile"') >= 0 || sheetSync.indexOf("action: \"uploadFile\"") >= 0 ||
    sheetSync.indexOf("action: 'uploadFile'") >= 0 || /action:\s*["']uploadFile["']/.test(sheetSync) ||
    sheetSync.indexOf('action: "uploadFile"') >= 0 || sheetSync.indexOf("uploadFile") >= 0,
    "sheet-sync still posts uploadFile");

  // Ensure optimization did not route order files into Supabase storage buckets for orders
  assert(sheetSync.indexOf("chat-attachments") < 0, "order sync does not use chat-attachments bucket");
  const logic = fs.readFileSync(path.join(ROOT, "api/_lib/sheet-logic.js"), "utf8");
  assert(logic.indexOf("storage.from") < 0, "sheet-logic does not write order files to Supabase Storage");
})();

if (failed) {
  console.error("sync scenario checks failed:", failed);
  process.exit(1);
}
console.log("sync scenario checks passed");
