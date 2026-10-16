const { withClient } = require("./pg");

const COMPLETED_RETENTION_DAYS = 4;
const BATCH_LIMIT = 40;

function trim(value) {
  return String(value == null ? "" : value).trim();
}

function lower(value) {
  return trim(value).toLowerCase();
}

function parseBoardStatus(value) {
  const raw = lower(value).replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (/^completed$|^complete$/.test(raw)) return "completed";
  if (/ready\s*to\s*approve/.test(raw)) return "ready-to-approve";
  if (/on\s*revision|revision/.test(raw)) return "on-revision";
  if (/orders?\s*placed|^placed$/.test(raw)) return "orders-placed";
  if (/in\s*progress|new\s*order|new|progress/.test(raw)) return "in-progress";
  return "";
}

function isCompletedOrder(payload) {
  if (!payload || typeof payload !== "object") return false;
  const board = parseBoardStatus(payload.boardStatus || payload.overallStatus || payload.status);
  return board === "completed";
}

function completedAtIso(payload, row) {
  if (!payload) return "";
  const stamped = trim(payload.completedAt);
  if (stamped) {
    const parsed = new Date(stamped);
    if (!isNaN(parsed.getTime())) return parsed.toISOString();
  }
  // Fallback for older completed orders that never stamped completedAt.
  const updated = trim(payload.updatedAt) || (row && row.updated_at) || "";
  const parsed = updated ? new Date(updated) : null;
  return parsed && !isNaN(parsed.getTime()) ? parsed.toISOString() : "";
}

function cutoffIso(now) {
  const date = now ? new Date(now) : new Date();
  date.setTime(date.getTime() - COMPLETED_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  return date.toISOString();
}

function money(value) {
  const num = Number(String(value == null ? "" : value).replace(/[^0-9.\-]/g, ""));
  return isNaN(num) ? 0 : Math.round(num * 100) / 100;
}

function collectDriveIds(payload) {
  const ids = {};
  function add(file) {
    if (!file) return;
    const id = trim(file.driveId || file.driveFileId || file.id);
    if (id && /^[a-zA-Z0-9_-]{10,}$/.test(id)) ids[id] = true;
    const url = trim(file.url || file.imageUrl || file.previewUrl || file.link || file.thumbnailUrl);
    const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) ||
      url.match(/[?&]id=([a-zA-Z0-9_-]+)/) ||
      url.match(/lh3\.googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) ids[match[1]] = true;
  }
  function walk(value) {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (typeof value !== "object") return;
    if (value.url || value.imageUrl || value.driveId || value.driveFileId) add(value);
    Object.keys(value).forEach(function (key) {
      walk(value[key]);
    });
  }
  walk(payload);
  return Object.keys(ids);
}

function slimCompletedPayload(payload, hanif) {
  const src = payload || {};
  const h = hanif || {};
  const board = "completed";
  const orderValue = h.orderValue != null && h.orderValue !== "" ? h.orderValue : src.orderValue;
  return {
    id: trim(src.id || h.orderId),
    tabName: trim(src.tabName || src.accountName || h.account),
    accountName: trim(src.accountName || src.tabName || h.account),
    fiverrId: trim(h.fiverrId || src.fiverrId),
    clientName: trim(h.clientName || src.clientName),
    businessName: trim(h.businessName || src.businessName),
    orderValue: orderValue === "" || orderValue == null ? "" : orderValue,
    overallStatus: "Completed",
    boardStatus: board,
    status: "completed",
    readyToApprove: true,
    orderPlaced: h.orderPlaced != null ? Boolean(h.orderPlaced) : true,
    placementPlaced: Boolean(src.placementPlaced || src.placedAt || h.orderPlaced),
    placeOn: trim(src.placeOn),
    placementStatus: trim(src.placementStatus || (src.placedAt ? "Placed" : "")),
    placedAt: trim(src.placedAt),
    scheduledBy: trim(src.scheduledBy),
    scheduleUpdatedAt: trim(src.scheduleUpdatedAt),
    createdAt: trim(h.createdDate || src.createdAt),
    updatedAt: new Date().toISOString(),
    completedAt: trim(src.completedAt) || new Date().toISOString(),
    mediaPurgedAt: new Date().toISOString(),
    archivedSlim: true,
    // Explicit empty media / conversation fields so clients clear local copies.
    requirementFiles: [],
    messageThread: [],
    messageText: "",
    directRequirements: "",
    revisions: [],
    revisionsData: "",
    reviewText: "",
    searchKeyword: "",
    fiverrGigUrl: "",
    whatsapp: "",
    name: trim(src.name || src.accountName || h.account),
    paymentStatus: trim(src.paymentStatus),
    orderTypeCustom: false,
    orderTypeDirect: false
  };
}

function applyCompletedStamp(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const board = parseBoardStatus(payload.boardStatus || payload.overallStatus || payload.status);
  if (board === "completed") {
    if (!trim(payload.completedAt)) payload.completedAt = new Date().toISOString();
    payload.boardStatus = "completed";
    if (!trim(payload.overallStatus)) payload.overallStatus = "Completed";
  } else if (trim(payload.completedAt) && board && board !== "completed") {
    // Left Completed tab — allow media again and clear stamp.
    delete payload.completedAt;
    delete payload.mediaPurgedAt;
    delete payload.archivedSlim;
  }
  return payload;
}

function preserveSlimOnUpsert(prev, incoming) {
  if (!prev || !prev.archivedSlim || !prev.mediaPurgedAt) return null;
  const next = slimCompletedPayload(Object.assign({}, prev, incoming || {}), null);
  // Keep purge markers stable; refresh only editable text fields from incoming.
  next.mediaPurgedAt = prev.mediaPurgedAt;
  next.archivedSlim = true;
  next.completedAt = trim(prev.completedAt) || next.completedAt;
  if (incoming) {
    if (incoming.clientName != null) next.clientName = trim(incoming.clientName);
    if (incoming.businessName != null) next.businessName = trim(incoming.businessName);
    if (incoming.orderValue != null) next.orderValue = incoming.orderValue;
    if (incoming.fiverrId != null) next.fiverrId = trim(incoming.fiverrId);
    if (incoming.accountName != null) next.accountName = trim(incoming.accountName);
    if (incoming.paymentStatus != null) next.paymentStatus = trim(incoming.paymentStatus);
    if (incoming.hanifPaymentStatus != null) next.hanifPaymentStatus = trim(incoming.hanifPaymentStatus);
  }
  return next;
}

async function fetchWithTimeout(url, options, ms) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = setTimeout(function () {
    if (controller) controller.abort();
  }, ms);
  try {
    return await fetch(url, Object.assign({}, options || {}, controller ? { signal: controller.signal } : {}));
  } finally {
    clearTimeout(timer);
  }
}

async function tryDeleteDriveFiles(ids) {
  const result = { attempted: 0, deleted: 0, skipped: 0, errors: [] };
  const list = (ids || []).slice(0, 25);
  if (!list.length) return result;
  const driveUrl =
    process.env.OWLISTIC_DRIVE_URL ||
    "https://script.google.com/macros/s/AKfycbwlWvSU1b8SJ42_3xdrrl1w7GhUiezAjBN85w9MvD-uFc-jg8m6OGJdGJRLm-fLIdl2/exec";
  for (let i = 0; i < list.length; i++) {
    const fileId = list[i];
    result.attempted += 1;
    try {
      const response = await fetchWithTimeout(driveUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteDriveFile", fileId: fileId, id: fileId })
      }, 5000);
      const text = await response.text();
      let data = null;
      try { data = JSON.parse(text); } catch (err) { data = null; }
      if (data && data.ok) result.deleted += 1;
      else if (data && (data.missing || /not found|does not exist/i.test(String(data.error || "")))) result.skipped += 1;
      else result.errors.push({ fileId: fileId, error: (data && data.error) || "Drive delete unavailable" });
    } catch (err) {
      result.errors.push({ fileId: fileId, error: err.message || "Drive delete failed" });
    }
  }
  return result;
}

async function purgeCompletedOrders(options) {
  const limit = Math.max(1, Math.min(100, Number((options && options.limit) || BATCH_LIMIT)));
  const cutoff = (options && options.cutoff) || cutoffIso();
  const dryRun = Boolean(options && options.dryRun);

  return withClient(async function (client) {
    const listed = await client.query(
      `select order_id, tab_name, account_name, payload, created_at, updated_at
       from public.sheet_orders
       where (
         lower(coalesce(payload->>'boardStatus','')) in ('completed','complete')
         or lower(coalesce(payload->>'overallStatus','')) like '%complet%'
       )
       and coalesce(payload->>'archivedSlim','') <> 'true'
       order by updated_at asc
       limit $1`,
      [limit]
    );

    const eligible = [];
    (listed.rows || []).forEach(function (row) {
      const payload = row.payload || {};
      if (!isCompletedOrder(payload)) return;
      if (payload.archivedSlim || payload.mediaPurgedAt) return;
      const completedAt = completedAtIso(payload, row);
      if (!completedAt || completedAt >= cutoff) return;
      eligible.push({ row: row, payload: payload, completedAt: completedAt });
    });

    if (dryRun) {
      return {
        ok: true,
        dryRun: true,
        retentionDays: COMPLETED_RETENTION_DAYS,
        cutoff: cutoff,
        scanned: (listed.rows || []).length,
        eligible: eligible.length,
        orderIds: eligible.map(function (item) { return item.row.order_id; })
      };
    }

    let purged = 0;
    let drive = { attempted: 0, deleted: 0, skipped: 0, errors: [] };
    const purgedIds = [];

    for (let i = 0; i < eligible.length; i++) {
      const item = eligible[i];
      const orderId = item.row.order_id;
      const hanifRow = (await client.query(
        "select payload from public.sheet_hanif_records where order_id = $1",
        [orderId]
      )).rows[0];
      const hanif = (hanifRow && hanifRow.payload) || {};
      const skipDrive = Boolean(options && options.skipDrive);
      const driveIds = skipDrive ? [] : collectDriveIds(item.payload);
      if (driveIds.length) {
        const removed = await tryDeleteDriveFiles(driveIds);
        drive.attempted += removed.attempted;
        drive.deleted += removed.deleted;
        drive.skipped += removed.skipped;
        drive.errors = drive.errors.concat(removed.errors || []);
      }

      const slim = slimCompletedPayload(
        Object.assign({}, item.payload, { completedAt: item.completedAt }),
        hanif
      );
      slim.id = orderId;

      // Keep Hanif text ledger in sync with the slim archive fields.
      const nextHanif = Object.assign({}, hanif, {
        orderId: orderId,
        createdDate: slim.createdAt || hanif.createdDate || "",
        account: slim.accountName || hanif.account || "",
        fiverrId: slim.fiverrId || hanif.fiverrId || "",
        clientName: slim.clientName || hanif.clientName || "",
        businessName: slim.businessName || hanif.businessName || "",
        orderValue: money(slim.orderValue != null ? slim.orderValue : hanif.orderValue),
        orderStatus: "Completed",
        orderPlaced: true,
        updatedAt: new Date().toISOString()
      });

      await client.query(
        `update public.sheet_orders
         set payload = $2::jsonb, updated_at = now()
         where order_id = $1`,
        [orderId, JSON.stringify(slim)]
      );
      await client.query(
        `insert into public.sheet_hanif_records (order_id, payload, updated_at)
         values ($1, $2::jsonb, now())
         on conflict (order_id) do update set payload = excluded.payload, updated_at = now()`,
        [orderId, JSON.stringify(nextHanif)]
      );
      purged += 1;
      purgedIds.push(orderId);
    }

    return {
      ok: true,
      retentionDays: COMPLETED_RETENTION_DAYS,
      cutoff: cutoff,
      scanned: (listed.rows || []).length,
      eligible: eligible.length,
      purged: purged,
      orderIds: purgedIds,
      drive: drive
    };
  });
}

async function runCompletedOrderCleanup(options) {
  const maxRounds = Math.max(1, Math.min(20, Number((options && options.maxRounds) || 8)));
  const totals = {
    ok: true,
    retentionDays: COMPLETED_RETENTION_DAYS,
    rounds: 0,
    scanned: 0,
    purged: 0,
    orderIds: [],
    drive: { attempted: 0, deleted: 0, skipped: 0, errors: [] }
  };
  for (let round = 0; round < maxRounds; round++) {
    const batch = await purgeCompletedOrders(options);
    totals.rounds += 1;
    totals.cutoff = batch.cutoff;
    totals.scanned += Number(batch.scanned || 0);
    totals.purged += Number(batch.purged || 0);
    totals.orderIds = totals.orderIds.concat(batch.orderIds || []);
    if (batch.drive) {
      totals.drive.attempted += Number(batch.drive.attempted || 0);
      totals.drive.deleted += Number(batch.drive.deleted || 0);
      totals.drive.skipped += Number(batch.drive.skipped || 0);
      totals.drive.errors = totals.drive.errors.concat(batch.drive.errors || []);
    }
    if (!batch.purged) break;
  }
  return totals;
}

module.exports = {
  COMPLETED_RETENTION_DAYS,
  parseBoardStatus,
  isCompletedOrder,
  completedAtIso,
  cutoffIso,
  collectDriveIds,
  slimCompletedPayload,
  applyCompletedStamp,
  preserveSlimOnUpsert,
  purgeCompletedOrders,
  runCompletedOrderCleanup
};
