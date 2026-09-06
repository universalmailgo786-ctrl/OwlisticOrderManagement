const { withClient } = require("./pg");
const SHEET_SQL = require("./sheet-sql");

const SUPERADMIN_USERNAME = "SuperAdmin";
const SUPERADMIN_PASSWORD = "superman";
const SUPERADMIN_DISPLAY_NAME = "Ashar";
const HEADERS_LEN = 33;
const FIVERR_FEE_RATE = 0.2;
const HANIF_PRICE_MAP = [
  [10, 20], [15, 26], [20, 32], [25, 38], [30, 44], [35, 51], [40, 58], [45, 65], [50, 70],
  [55, 78], [60, 84], [65, 90], [70, 98], [75, 105], [80, 110], [85, 115], [90, 120], [95, 125],
  [100, 132], [105, 138], [110, 144], [115, 151], [120, 157], [125, 164], [130, 170], [135, 176],
  [140, 183], [145, 189], [150, 196], [155, 202], [160, 208], [165, 215], [170, 221], [175, 228],
  [180, 234], [185, 240], [190, 247], [195, 252], [200, 258], [205, 264], [210, 271], [215, 277],
  [220, 283], [225, 290], [230, 296], [235, 302], [240, 309], [245, 316], [250, 320], [255, 326],
  [260, 333], [265, 339], [270, 346], [275, 352], [280, 358], [285, 365], [290, 371], [295, 378],
  [300, 384], [350, 448], [400, 512], [500, 640]
];

function trim(value) {
  return String(value == null ? "" : value).trim();
}

function tabName(value) {
  return trim(value);
}

function lower(value) {
  return trim(value).toLowerCase();
}

function isSuperAdminUsername(value) {
  return /^(superadmin|admin)$/i.test(trim(value));
}

function normalizeRole(role) {
  const raw = lower(role).replace(/\s+/g, "");
  if (raw === "superadmin" || raw === "admin") return "superadmin";
  return "user";
}

function isRestricted(data) {
  const role = lower((data && data.role) || "").replace(/\s+/g, "");
  return role === "user" || role === "account";
}

function forcedAccount(data) {
  if (!isRestricted(data)) return "";
  return tabName(data.userAccount || data.account || "");
}

function padOrderId(n) {
  const num = Number(n) || 1;
  return "ORD-" + String(num).padStart(3, "0");
}

function orderIdNumber(id) {
  const m = String(id || "").match(/(\d+)/);
  return m ? Number(m[1]) : 0;
}

function money(value) {
  const num = Number(String(value == null ? "" : value).replace(/[^0-9.\-]/g, ""));
  return isNaN(num) ? 0 : Math.round(num * 100) / 100;
}

function hanifCostForValue(orderValue) {
  const val = Math.round(money(orderValue));
  if (!val || val < 10) return 0;
  let match = null;
  for (let i = 0; i < HANIF_PRICE_MAP.length; i++) {
    if (HANIF_PRICE_MAP[i][0] <= val) match = HANIF_PRICE_MAP[i];
    else break;
  }
  return match ? match[1] : 0;
}

function hanifFinancials(orderValue, pkrRate) {
  const value = money(orderValue);
  const hanifCost = hanifCostForValue(value);
  const fiverrFee = money(value * FIVERR_FEE_RATE);
  const returnAfterFee = money(value - fiverrFee);
  const totalLoss = money(hanifCost - returnAfterFee);
  const rate = money(pkrRate) > 0 ? money(pkrRate) : 275;
  return {
    orderValue: value,
    hanifCost: hanifCost,
    fiverrFee: fiverrFee,
    returnAfterFee: returnAfterFee,
    totalLoss: totalLoss,
    pkrRate: rate,
    totalLossPkr: Math.round(totalLoss * rate)
  };
}

function tabMatches(name, wanted) {
  const key = lower(name);
  const need = lower(wanted);
  if (!key || !need) return false;
  return key === need || key.indexOf(need + " ") === 0;
}

function sheetMatchesAny(name, allowed) {
  return (allowed || []).some(function (item) { return tabMatches(name, item); });
}

function parseFiles(text) {
  const raw = String(text == null ? "" : text).replace(/\r/g, "").trim();
  if (!raw) return [];
  const chunks = [];
  raw.split(/\n|;/).forEach(function (part) {
    const chunk = trim(part);
    if (chunk) chunks.push(chunk);
  });
  const files = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const urlMatch = chunk.match(/https?:\/\/\S+/i);
    const url = urlMatch ? urlMatch[0] : "";
    let name = chunk;
    if (url) name = trim(chunk.replace(url, "").replace(/[()]/g, ""));
    if (!name) name = url;
    files.push({ name: name, url: url, previewUrl: url });
  }
  return files;
}

function parseRevisionMessages(rest, createdAt, number) {
  const messages = [];
  const text = trim(rest);
  if (!text || text === "(empty)") return messages;
  const parts = text.split(/\s*\|\|?\s*(?=(?:Buyer|Seller)\b)/i);
  for (let i = 0; i < parts.length; i++) {
    const part = trim(parts[i]);
    if (!part) continue;
    const cleaned = part.replace(/^(Buyer|Seller)(?:\s*\([^)]*\))?\s*—\s*/i, "");
    let files = [];
    let body = cleaned;
    const fileMatch = cleaned.match(/^([\s\S]*?)(?:\s*—\s*Files:\s*|\s+\|\s*Files:\s*)([\s\S]*)$/);
    if (fileMatch) {
      body = trim(String(fileMatch[1] || "").replace(/^\(no text\)\s*$/i, ""));
      files = parseFiles(fileMatch[2]);
    } else {
      body = trim(body.replace(/^\(no text\)\s*$/i, ""));
    }
    messages.push({
      id: "msg_sheet_" + number + "_" + i,
      role: /^Seller/i.test(part) ? "seller" : "buyer",
      text: body,
      files: files,
      createdAt: createdAt
    });
  }
  return messages;
}

function parseRevisions(history, revisionCount, createdAt, latestBuyer, latestSeller) {
  const raw = String(history || "").replace(/\r/g, "").trim();
  const rounds = [];
  if (raw) {
    const re = /^Revision\s+(\d+)\s*\[(Completed|Open)\]\s*:?\s*/gim;
    const matches = [];
    let m;
    while ((m = re.exec(raw)) !== null) {
      matches.push({
        index: m.index,
        end: m.index + m[0].length,
        number: Number(m[1]) || 0,
        status: m[2]
      });
    }
    for (let i = 0; i < matches.length; i++) {
      const number = matches[i].number || (rounds.length + 1);
      const restEnd = i + 1 < matches.length ? matches[i + 1].index : raw.length;
      const rest = trim(raw.slice(matches[i].end, restEnd));
      rounds.push({
        id: "rev_sheet_" + number,
        number: number,
        createdAt: createdAt,
        completed: String(matches[i].status || "").toLowerCase() === "completed",
        messages: parseRevisionMessages(rest, createdAt, number)
      });
    }
  }
  let count = Math.max(Number(revisionCount) || 0, rounds.length);
  if (!count && (latestBuyer || latestSeller)) count = 1;
  if (!rounds.length && count > 0) {
    for (let n = 1; n <= count; n++) {
      const messages = [];
      if (n === count) {
        if (latestBuyer) messages.push({ id: "msg_buyer", role: "buyer", text: latestBuyer, createdAt: createdAt });
        if (latestSeller) messages.push({ id: "msg_seller", role: "seller", text: latestSeller, createdAt: createdAt });
      }
      rounds.push({
        id: "rev_sheet_" + n,
        number: n,
        createdAt: createdAt,
        completed: false,
        messages: messages
      });
    }
  }
  while (rounds.length < count) {
    const next = rounds.length + 1;
    rounds.push({
      id: "rev_sheet_" + next,
      number: next,
      createdAt: createdAt,
      completed: false,
      messages: []
    });
  }
  rounds.sort(function (a, b) { return (a.number || 0) - (b.number || 0); });
  for (let r = 0; r < rounds.length; r++) rounds[r].number = r + 1;
  return rounds;
}

function parseBoardStatus(text) {
  const raw = lower(text);
  if (/complet/.test(raw)) return "completed";
  if (/revision/.test(raw)) return "revision";
  if (/progress|working/.test(raw)) return "in-progress";
  if (/cancel/.test(raw)) return "cancelled";
  if (/new|inbox|received/.test(raw)) return "new";
  return trim(text);
}

function isoFrom(datePart, timePart) {
  const dateText = trim(datePart);
  const timeText = trim(timePart);
  if (!dateText) return "";
  const parsed = new Date(dateText + (timeText ? " " + timeText : ""));
  return isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function orderFromRow(row, tab, files) {
  const r = (row || []).slice();
  while (r.length < HEADERS_LEN) r.push("");
  const paymentText = lower(r[9]);
  let paymentStatus = "";
  if (/unpaid/.test(paymentText)) paymentStatus = "unpaid";
  else if (/paid/.test(paymentText)) paymentStatus = "paid";
  const readyText = lower(r[23]);
  const typeText = lower(r[11]);
  const fileList = files && files.length ? files : parseFiles(r[14]);
  return {
    id: trim(r[0]),
    accountName: trim(r[5] || tab),
    tabName: tab,
    whatsapp: trim(r[6]),
    name: trim(r[7]),
    orderValue: r[8] === "" || r[8] == null ? "" : r[8],
    paymentStatus: paymentStatus,
    searchKeyword: trim(r[10]),
    orderTypeCustom: typeText.indexOf("custom") >= 0 || typeText.indexOf("message") >= 0,
    orderTypeDirect: typeText.indexOf("direct") >= 0,
    messageText: String(r[12] || ""),
    directRequirements: String(r[13] || ""),
    requirementFiles: fileList,
    fiverrId: trim(r[15]),
    fiverrGigUrl: trim(r[16]),
    reviewText: String(r[17] || ""),
    revisions: parseRevisions(r[19], r[18], isoFrom(r[1], r[2]), trim(r[21]), trim(r[22])),
    readyToApprove: /ready to approve/.test(readyText) && readyText.indexOf("not ready") === -1,
    overallStatus: trim(r[24]),
    boardStatus: parseBoardStatus(r[24]),
    businessName: trim(r[25]),
    clientName: trim(r[26]),
    placeOn: trim(r[27]),
    placementStatus: trim(r[28]),
    scheduledBy: trim(r[29]),
    scheduleUpdatedAt: trim(r[30]),
    placedAt: trim(r[31]),
    placementHold: /on hold/i.test(String(r[28] || "")),
    placementPlaced: /^placed$/i.test(trim(r[28])) && trim(r[31]) !== "",
    revisionsData: trim(r[32]),
    createdAt: isoFrom(r[1], r[2]),
    updatedAt: isoFrom(r[3], r[4]) || isoFrom(r[1], r[2])
  };
}

function superAdminLogin() {
  return {
    ok: true,
    username: SUPERADMIN_USERNAME,
    role: "superadmin",
    account: "",
    name: SUPERADMIN_DISPLAY_NAME,
    personName: SUPERADMIN_DISPLAY_NAME,
    displayName: SUPERADMIN_DISPLAY_NAME,
    whatsapp: "",
    fiverrId: "",
    fiverrGigUrl: "",
    paymentStatus: ""
  };
}

function publicUser(row) {
  return {
    username: row.username,
    account: row.account,
    name: row.account,
    displayName: row.display_name || row.account,
    personName: row.display_name || row.account,
    role: "user",
    active: row.active !== false,
    whatsapp: row.whatsapp || "",
    fiverrId: row.fiverr_id || "",
    fiverrGigUrl: row.fiverr_gig_url || "",
    paymentStatus: row.payment_status || ""
  };
}

function publicAccount(row) {
  return {
    username: row.username || row.account,
    name: row.account,
    account: row.account,
    personName: row.person_name || row.account,
    whatsapp: row.whatsapp || "",
    fiverrId: row.fiverr_id || "",
    fiverrGigUrl: row.fiverr_gig_url || "",
    paymentStatus: /unpaid/i.test(row.payment_status || "") ? "unpaid" : "paid"
  };
}

async function pkrRate(client) {
  const result = await client.query("select value from public.sheet_settings where key = 'pkr_rate'");
  return money((result.rows[0] && result.rows[0].value) || 275) || 275;
}

async function nextOrderIdValue(client) {
  const result = await client.query(`
    select greatest(
      coalesce((select max(cast(substring(order_id from '[0-9]+') as int)) from public.sheet_orders), 0),
      coalesce((select max(cast(substring(order_id from '[0-9]+') as int)) from public.sheet_hanif_records), 0)
    ) as max_n
  `);
  return padOrderId(Number((result.rows[0] && result.rows[0].max_n) || 0) + 1);
}

function fileKey(file) {
  return lower(trim((file && (file.id || file.driveId || file.driveFileId || file.name || file.fileName)) || ""));
}

function hasFileUrl(file) {
  return Boolean(trim((file && (file.url || file.imageUrl || file.link)) || ""));
}

function mergeFileLists(prev, next) {
  const old = {};
  (prev || []).forEach(function (file) {
    const key = fileKey(file);
    if (key && hasFileUrl(file)) old[key] = file;
  });
  return (next || []).map(function (file) {
    if (!file || hasFileUrl(file)) return file;
    const prevFile = old[fileKey(file)];
    if (!prevFile) return file;
    return Object.assign({}, file, {
      url: prevFile.url || prevFile.imageUrl || prevFile.link,
      imageUrl: prevFile.imageUrl || prevFile.url || prevFile.link,
      previewUrl: file.previewUrl || prevFile.previewUrl,
      thumbnailUrl: file.thumbnailUrl || prevFile.thumbnailUrl,
      driveId: file.driveId || prevFile.driveId || prevFile.driveFileId,
      driveFileId: file.driveFileId || prevFile.driveFileId || prevFile.driveId
    });
  });
}

function mergeStoredFiles(prev, payload) {
  if (!prev || !payload) return payload;
  payload.requirementFiles = mergeFileLists(prev.requirementFiles, payload.requirementFiles);
  if (Array.isArray(payload.messageThread) && Array.isArray(prev.messageThread)) {
    const prevById = {};
    prev.messageThread.forEach(function (msg) {
      if (msg && msg.id) prevById[msg.id] = msg;
    });
    payload.messageThread = payload.messageThread.map(function (msg, i) {
      if (!msg) return msg;
      const old = prevById[msg.id] || prev.messageThread[i];
      if (old) msg.files = mergeFileLists(old.files, msg.files);
      return msg;
    });
  }
  if (Array.isArray(payload.revisions) && Array.isArray(prev.revisions)) {
    payload.revisions = payload.revisions.map(function (round, i) {
      if (!round) return round;
      const oldRound = prev.revisions.find(function (item) {
        return item && (item.id === round.id || item.number === round.number);
      }) || prev.revisions[i];
      if (!oldRound) return round;
      if (Array.isArray(round.messages) && Array.isArray(oldRound.messages)) {
        round.messages = round.messages.map(function (msg, j) {
          const oldMsg = (oldRound.messages || []).find(function (item) {
            return item && item.id === (msg && msg.id);
          }) || oldRound.messages[j];
          if (oldMsg && msg) msg.files = mergeFileLists(oldMsg.files, msg.files);
          return msg;
        });
      }
      if (Array.isArray(round.subRevisions) && Array.isArray(oldRound.subRevisions)) {
        round.subRevisions = round.subRevisions.map(function (sub, j) {
          const oldSub = oldRound.subRevisions[j];
          if (oldSub && sub) sub.attachments = mergeFileLists(oldSub.attachments, sub.attachments);
          return sub;
        });
      }
      return round;
    });
  }
  return payload;
}

function sanitizeClientOrder(order) {
  let copy;
  try {
    copy = JSON.parse(JSON.stringify(order || {}));
  } catch (err) {
    copy = Object.assign({}, order || {});
  }
  delete copy.pendingBlob;
  delete copy.blob;
  delete copy.isNewOrder;
  delete copy._isNewOrder;
  return copy;
}

async function login(data) {
  const wantedUser = lower(data.username);
  const wantedPass = String(data.password || "");
  if (!wantedUser || !wantedPass) {
    return { ok: false, error: "Enter username and password." };
  }
  return withClient(async function (client) {
    if (isSuperAdminUsername(wantedUser)) {
      const row = (await client.query(
        "select * from public.sheet_users where lower(username) = 'superadmin' limit 1"
      )).rows[0];
      const password = row && row.password ? String(row.password) : SUPERADMIN_PASSWORD;
      if (wantedPass !== password) return { ok: false, error: "Wrong username or password." };
      return superAdminLogin();
    }
    const row = (await client.query(
      "select * from public.sheet_users where lower(username) = $1 limit 1",
      [wantedUser]
    )).rows[0];
    if (!row) return { ok: false, error: "Wrong username or password." };
    if (row.active === false) return { ok: false, error: "This user is inactive." };
    if (String(row.password || "") !== wantedPass) {
      return { ok: false, error: "Wrong username or password." };
    }
    const role = normalizeRole(row.role);
    if (role !== "superadmin" && !trim(row.account)) {
      return { ok: false, error: "This user has no Account assigned in the login sheet." };
    }
    const account = tabName(row.account);
    const profile = (await client.query(
      "select * from public.sheet_accounts where lower(account) = $1 limit 1",
      [lower(account)]
    )).rows[0];
    return {
      ok: true,
      username: row.username,
      role: role,
      account: account,
      name: (profile && profile.person_name) || row.display_name || account,
      personName: (profile && profile.person_name) || row.display_name || account,
      displayName: row.display_name || account,
      whatsapp: (profile && profile.whatsapp) || row.whatsapp || "",
      fiverrId: (profile && profile.fiverr_id) || row.fiverr_id || "",
      fiverrGigUrl: (profile && profile.fiverr_gig_url) || row.fiverr_gig_url || "",
      paymentStatus: (profile && profile.payment_status) || row.payment_status || ""
    };
  });
}

async function listUsers(data) {
  return withClient(async function (client) {
    const forced = forcedAccount(data);
    const reqUser = lower(data.username);
    const result = await client.query(
      "select * from public.sheet_users where lower(username) not in ('superadmin','admin') and active = true order by account, username"
    );
    const users = [];
    result.rows.forEach(function (row) {
      if (normalizeRole(row.role) === "superadmin") return;
      if (!trim(row.account)) return;
      if (forced) {
        if (lower(row.account) !== lower(forced) && lower(row.username) !== reqUser) return;
      }
      users.push(publicUser(row));
    });
    return { ok: true, action: "listUsers", users: users, count: users.length };
  });
}

async function listAccounts(data) {
  return withClient(async function (client) {
    const users = await listUsers(data);
    const loginKeys = {};
    (users.users || []).forEach(function (user) {
      if (user.account) loginKeys[lower(user.account)] = true;
      if (user.username) loginKeys[lower(user.username)] = true;
    });
    const result = await client.query("select * from public.sheet_accounts order by account");
    let accounts = result.rows.map(publicAccount).filter(function (item) {
      if (isSuperAdminUsername(item.username) && !item.account) return false;
      const accKey = lower(item.account || item.name);
      const userKey = lower(item.username);
      if (users.users.length && !loginKeys[accKey] && !loginKeys[userKey]) return false;
      return true;
    });
    const forced = forcedAccount(data);
    const username = lower(data.username);
    if (forced || (isRestricted(data) && username)) {
      accounts = accounts.filter(function (item) {
        if (forced && lower(item.account) === lower(forced)) return true;
        if (username && lower(item.username) === username) return true;
        return false;
      });
    }
    const seen = {};
    accounts = accounts.filter(function (item) {
      const key = lower(item.account);
      if (!key || seen[key]) return false;
      seen[key] = true;
      return true;
    });
    return { ok: true, action: "listAccounts", count: accounts.length, accounts: accounts };
  });
}

async function getUserProfile(data) {
  const wanted = lower(data.username);
  if (!wanted) return { ok: false, action: "getUserProfile", error: "Username is required." };
  if (isSuperAdminUsername(wanted)) {
    return Object.assign({ action: "getUserProfile" }, superAdminLogin());
  }
  return withClient(async function (client) {
    const row = (await client.query(
      "select * from public.sheet_users where lower(username) = $1 limit 1",
      [wanted]
    )).rows[0];
    if (!row) return { ok: false, action: "getUserProfile", error: "User was not found." };
    if (isRestricted(data) && lower(data.username) !== wanted) {
      return { ok: false, action: "getUserProfile", error: "You can only load your own account profile." };
    }
    const account = (await client.query(
      "select * from public.sheet_accounts where lower(account) = $1 limit 1",
      [lower(row.account)]
    )).rows[0];
    return Object.assign({ ok: true, action: "getUserProfile" }, {
      username: row.username,
      role: normalizeRole(row.role),
      account: row.account,
      name: (account && account.person_name) || row.display_name || row.account,
      personName: (account && account.person_name) || row.display_name || row.account,
      whatsapp: (account && account.whatsapp) || row.whatsapp || "",
      fiverrId: (account && account.fiverr_id) || row.fiverr_id || "",
      fiverrGigUrl: (account && account.fiverr_gig_url) || row.fiverr_gig_url || "",
      paymentStatus: (account && account.payment_status) || row.payment_status || ""
    });
  });
}

async function listOrders(data) {
  const forced = forcedAccount(data);
  const allowed = forced
    ? [forced]
    : String(data.tabs || "").split(",").map(tabName).filter(Boolean);
  return withClient(async function (client) {
    const result = await client.query("select * from public.sheet_orders order by order_id");
    const orders = [];
    const tabs = {};
    const filter = forced ? allowed : null;
    result.rows.forEach(function (row) {
      const payload = row.payload || {};
      const tab = row.tab_name || payload.tabName || "";
      const account = row.account_name || payload.accountName || tab;
      if (filter && !sheetMatchesAny(tab, filter) && !sheetMatchesAny(account, filter)) return;
      tabs[tab] = true;
      payload.id = row.order_id;
      payload.tabName = tab;
      payload.accountName = account;
      if (!payload.messageThread && payload.messageText) payload.messageThread = [];
      orders.push(payload);
    });
    const known = await workbookTabs(client);
    known.forEach(function (name) {
      if (!filter || sheetMatchesAny(name, filter)) tabs[name] = true;
    });
    return {
      ok: true,
      action: "listOrders",
      count: orders.length,
      orders: orders,
      sheetColumns: HEADERS_LEN,
      workbookTabs: Object.keys(tabs)
    };
  });
}

async function getOrder(data) {
  const orderId = trim(data.orderId);
  if (!orderId) return { ok: false, action: "getOrder", found: false, error: "Order ID is required." };
  return withClient(async function (client) {
    const row = (await client.query(
      "select * from public.sheet_orders where order_id = $1 limit 1",
      [orderId]
    )).rows[0];
    const forced = forcedAccount(data);
    if (row && forced && !tabMatches(row.tab_name, forced) && !tabMatches(row.account_name, forced)) {
      return { ok: false, action: "getOrder", found: false, orderId: orderId, order: null, error: "You can only open orders for " + forced + "." };
    }
    if (!row) return { ok: true, action: "getOrder", found: false, orderId: orderId, order: null };
    return {
      ok: true,
      action: "getOrder",
      found: true,
      orderId: orderId,
      tab: row.tab_name,
      order: Object.assign({}, row.payload, { id: row.order_id, tabName: row.tab_name, accountName: row.account_name })
    };
  });
}

async function hasOrder(data) {
  const result = await getOrder(data);
  return {
    ok: result.ok,
    action: "hasOrder",
    found: Boolean(result.found),
    orderId: trim(data.orderId),
    tab: result.tab || "",
    error: result.error
  };
}

async function nextOrderId() {
  return withClient(async function (client) {
    return { ok: true, action: "nextOrderId", orderId: await nextOrderIdValue(client) };
  });
}

async function touchHanif(client, order) {
  if (!order || !order.id) return;
  const rate = await pkrRate(client);
  const existing = (await client.query(
    "select payload from public.sheet_hanif_records where order_id = $1",
    [order.id]
  )).rows[0];
  const prev = (existing && existing.payload) || {};
  const fin = hanifFinancials(order.orderValue, rate);
  const paymentStatus = prev.hanifPaymentStatus || "unpaid";
  const board = parseBoardStatus(order.boardStatus || order.overallStatus);
  const merged = {
    orderId: order.id,
    createdDate: prev.createdDate || order.createdAt || "",
    orderNumber: orderIdNumber(order.id),
    account: trim(order.accountName || order.tabName),
    fiverrId: trim(order.fiverrId || prev.fiverrId),
    clientName: trim(order.clientName),
    businessName: trim(order.businessName),
    orderValue: fin.orderValue,
    hanifCost: fin.hanifCost,
    fiverrFee: fin.fiverrFee,
    returnAfterFee: fin.returnAfterFee,
    totalLoss: fin.totalLoss,
    pkrRate: rate,
    totalLossPkr: fin.totalLossPkr,
    orderStatus: trim(order.overallStatus || prev.orderStatus),
    orderPlaced: Boolean(board && board !== "in-progress"),
    hanifPaymentStatus: paymentStatus,
    paidAmount: paymentStatus === "paid" ? (prev.paidAmount || fin.hanifCost) : 0,
    paidAt: prev.paidAt || "",
    updatedAt: new Date().toISOString()
  };
  await client.query(
    `insert into public.sheet_hanif_records (order_id, payload, updated_at)
     values ($1, $2::jsonb, now())
     on conflict (order_id) do update set payload = excluded.payload, updated_at = now()`,
    [order.id, JSON.stringify(merged)]
  );
}

async function upsertOrder(data) {
  return withClient(async function (client) {
    const forced = forcedAccount(data);
    let row = Array.isArray(data.row) ? data.row.slice() : [];
    let orderId = trim(data.orderId || row[0]);
    let tab = tabName(forced || data.tabName || data.accountName || data.tab || "");
    const existing = orderId
      ? (await client.query("select * from public.sheet_orders where order_id = $1", [orderId])).rows[0]
      : null;
    if (existing && forced && !tabMatches(existing.tab_name, forced) && !tabMatches(existing.account_name, forced)) {
      return { ok: false, error: "You can only save orders for " + forced + "." };
    }
    if (!orderId) orderId = await nextOrderIdValue(client);
    if (!tab && existing) tab = existing.tab_name;
    if (!tab) {
      return { ok: false, error: "Select an account before saving." };
    }
    if (forced) tab = forced;
    let payload;
    if (data.order && typeof data.order === "object" && !Array.isArray(data.order)) {
      payload = Object.assign({}, existing && existing.payload, sanitizeClientOrder(data.order), {
        id: orderId,
        tabName: tab,
        accountName: tabName(data.accountName || data.order.accountName || (existing && existing.account_name) || tab)
      });
    } else if (row.length) {
      while (row.length < HEADERS_LEN) row.push("");
      row[0] = orderId;
      if (forced) row[5] = tab;
      if (existing && existing.payload) {
        const prev = existing.payload;
        if (!trim(row[1])) row[1] = prev.createdAt || "";
      }
      payload = orderFromRow(row, tab, data.uploads || data.files);
    } else {
      payload = Object.assign({}, existing && existing.payload, data.order || data, {
        id: orderId,
        tabName: tab,
        accountName: tabName(data.accountName || (existing && existing.account_name) || tab)
      });
    }
    if (existing && existing.payload) {
      const prev = existing.payload;
      if (prev.requirementFiles && !(payload.requirementFiles && payload.requirementFiles.length)) {
        payload.requirementFiles = prev.requirementFiles;
      }
      if ((!payload.revisions || !payload.revisions.length) && prev.revisions && prev.revisions.length) {
        payload.revisions = prev.revisions;
      }
      if (!trim(payload.revisionsData) && prev.revisionsData) payload.revisionsData = prev.revisionsData;
      if (!trim(payload.messageText) && prev.messageText) payload.messageText = prev.messageText;
      if ((!payload.messageThread || !payload.messageThread.length) && prev.messageThread) {
        payload.messageThread = prev.messageThread;
      }
      mergeStoredFiles(prev, payload);
    }
    if (data.uploads && data.uploads.length) {
      payload.requirementFiles = (payload.requirementFiles || []).concat(data.uploads);
    }
    payload.id = orderId;
    payload.tabName = tab;
    payload.accountName = payload.accountName || tab;
    payload.updatedAt = new Date().toISOString();
    if (!payload.createdAt) payload.createdAt = (existing && existing.payload && existing.payload.createdAt) || new Date().toISOString();
    if (existing) {
      await client.query(
        `update public.sheet_orders
         set tab_name = $2, account_name = $3, payload = $4::jsonb, updated_at = now()
         where order_id = $1`,
        [orderId, tab, payload.accountName, JSON.stringify(payload)]
      );
    } else {
      let inserted = false;
      let tries = 0;
      while (!inserted && tries < 8) {
        try {
          await client.query(
            `insert into public.sheet_orders (order_id, tab_name, account_name, payload, created_at, updated_at)
             values ($1,$2,$3,$4::jsonb,$5,now())`,
            [orderId, tab, payload.accountName, JSON.stringify(payload), payload.createdAt || null]
          );
          inserted = true;
        } catch (err) {
          if (String(err && err.code) !== "23505") throw err;
          tries += 1;
          orderId = await nextOrderIdValue(client);
          payload.id = orderId;
          if (row.length) row[0] = orderId;
        }
      }
      if (!inserted) {
        return { ok: false, error: "Could not allocate a unique order ID." };
      }
    }
    await touchHanif(client, payload);
    return { ok: true, action: "upsertOrder", orderId: orderId, tab: tab, order: payload };
  });
}

async function deleteOrder(data) {
  const orderId = trim(data.orderId);
  if (!orderId) return { ok: false, action: "deleteOrder", error: "Order ID is required." };
  const forced = forcedAccount(data);
  return withClient(async function (client) {
    const existing = (await client.query("select * from public.sheet_orders where order_id = $1", [orderId])).rows[0];
    if (existing && forced && !tabMatches(existing.tab_name, forced) && !tabMatches(existing.account_name, forced)) {
      return { ok: false, action: "deleteOrder", error: "You can only delete orders for " + forced + "." };
    }
    await client.query("delete from public.sheet_orders where order_id = $1", [orderId]);
    await client.query("delete from public.sheet_hanif_records where order_id = $1", [orderId]);
    return { ok: true, action: "deleteOrder", orderId: orderId };
  });
}

async function updateOrderStatus(data) {
  const orderId = trim(data.orderId);
  if (!orderId) return { ok: false, error: "Order ID is required." };
  return withClient(async function (client) {
    const existing = (await client.query("select * from public.sheet_orders where order_id = $1", [orderId])).rows[0];
    if (!existing) return { ok: false, error: "Order was not found." };
    const payload = Object.assign({}, existing.payload);
    if (data.status || data.overallStatus) {
      payload.overallStatus = trim(data.status || data.overallStatus);
      payload.boardStatus = parseBoardStatus(payload.overallStatus);
    }
    payload.updatedAt = new Date().toISOString();
    await client.query(
      "update public.sheet_orders set payload = $2::jsonb, updated_at = now() where order_id = $1",
      [orderId, JSON.stringify(payload)]
    );
    await touchHanif(client, payload);
    return { ok: true, action: "updateOrderStatus", orderId: orderId, order: payload };
  });
}

async function updateOrderSchedule(data) {
  const orderId = trim(data.orderId);
  if (!orderId) return { ok: false, error: "Order ID is required." };
  return withClient(async function (client) {
    const existing = (await client.query("select * from public.sheet_orders where order_id = $1", [orderId])).rows[0];
    if (!existing) return { ok: false, error: "Order was not found." };
    const payload = Object.assign({}, existing.payload);
    if (data.placeOn != null || data.placeon != null) payload.placeOn = data.placeOn != null ? data.placeOn : data.placeon;
    if (data.placementStatus != null || data.placementstatus != null) payload.placementStatus = data.placementStatus != null ? data.placementStatus : data.placementstatus;
    if (data.scheduledBy != null || data.scheduledby != null) payload.scheduledBy = data.scheduledBy != null ? data.scheduledBy : data.scheduledby;
    if (data.scheduleUpdatedAt != null || data.scheduleupdatedat != null) payload.scheduleUpdatedAt = data.scheduleUpdatedAt != null ? data.scheduleUpdatedAt : data.scheduleupdatedat;
    if (data.placedAt != null || data.placedat != null) payload.placedAt = data.placedAt != null ? data.placedAt : data.placedat;
    payload.placementHold = /on hold/i.test(String(payload.placementStatus || ""));
    payload.placementPlaced = /^placed$/i.test(trim(payload.placementStatus)) && trim(payload.placedAt) !== "";
    payload.updatedAt = new Date().toISOString();
    await client.query(
      "update public.sheet_orders set payload = $2::jsonb, updated_at = now() where order_id = $1",
      [orderId, JSON.stringify(payload)]
    );
    return { ok: true, action: "updateOrderSchedule", orderId: orderId, order: payload };
  });
}

async function updateOrderNames(data) {
  const orderId = trim(data.orderId);
  if (!orderId) return { ok: false, error: "Order ID is required." };
  return withClient(async function (client) {
    const existing = (await client.query("select * from public.sheet_orders where order_id = $1", [orderId])).rows[0];
    if (!existing) return { ok: false, error: "Order was not found." };
    const payload = Object.assign({}, existing.payload);
    if (data.businessName != null) payload.businessName = trim(data.businessName);
    if (data.clientName != null) payload.clientName = trim(data.clientName);
    payload.updatedAt = new Date().toISOString();
    await client.query(
      "update public.sheet_orders set payload = $2::jsonb, updated_at = now() where order_id = $1",
      [orderId, JSON.stringify(payload)]
    );
    await touchHanif(client, payload);
    return { ok: true, action: "updateOrderNames", orderId: orderId, order: payload };
  });
}

async function updateRevisionsData(data) {
  const orderId = trim(data.orderId);
  if (!orderId) return { ok: false, error: "Order ID is required." };
  return withClient(async function (client) {
    const existing = (await client.query("select * from public.sheet_orders where order_id = $1", [orderId])).rows[0];
    if (!existing) return { ok: false, error: "Order was not found." };
    const payload = Object.assign({}, existing.payload);
    payload.revisionsData = data.revisionsData != null ? String(data.revisionsData) : payload.revisionsData;
    if (data.revisions) payload.revisions = data.revisions;
    if (data.revisionHistory != null) payload.revisionHistory = String(data.revisionHistory);
    if (data.revisionCount != null) payload.revisionCount = data.revisionCount;
    if (data.currentRevision != null) payload.currentRevision = String(data.currentRevision);
    if (data.latestBuyer != null) payload.latestBuyer = String(data.latestBuyer);
    if (data.latestSeller != null) payload.latestSeller = String(data.latestSeller);
    payload.updatedAt = new Date().toISOString();
    await client.query(
      "update public.sheet_orders set payload = $2::jsonb, updated_at = now() where order_id = $1",
      [orderId, JSON.stringify(payload)]
    );
    return { ok: true, action: "updateRevisionsData", orderId: orderId, order: payload };
  });
}

async function upsertUser(data) {
  if (isRestricted(data)) return { ok: false, error: "Only Super Admin can add login users." };
  const username = trim(data.username);
  const account = tabName(data.account || data.name || "");
  if (!account) return { ok: false, error: "Account Name is required." };
  if (!username) return { ok: false, error: "Login username is required." };
  if (isSuperAdminUsername(username) || isSuperAdminUsername(account)) {
    return { ok: false, error: "SuperAdmin cannot be used as a user login." };
  }
  return withClient(async function (client) {
    const existing = (await client.query(
      "select * from public.sheet_users where lower(username) = $1",
      [lower(username)]
    )).rows[0];
    const password = data.password != null && String(data.password) !== ""
      ? String(data.password)
      : (existing ? existing.password : "");
    if (!password) return { ok: false, error: "Set a login password for this new user." };
    await client.query(
      `insert into public.sheet_users
        (username, password, role, account, display_name, active, whatsapp, fiverr_id, fiverr_gig_url, payment_status, updated_at)
       values ($1,$2,'user',$3,$4,true,$5,$6,$7,$8,now())
       on conflict (username) do update set
         password = excluded.password,
         account = excluded.account,
         display_name = excluded.display_name,
         whatsapp = excluded.whatsapp,
         fiverr_id = excluded.fiverr_id,
         fiverr_gig_url = excluded.fiverr_gig_url,
         payment_status = excluded.payment_status,
         active = true,
         updated_at = now()`,
      [
        username, password, account, trim(data.displayName || data.personName || account),
        trim(data.whatsapp), trim(data.fiverrId), trim(data.fiverrGigUrl), trim(data.paymentStatus)
      ]
    );
    await upsertAccountRow(client, {
      account: account,
      username: username,
      personName: data.personName || data.displayName || account,
      whatsapp: data.whatsapp,
      fiverrId: data.fiverrId,
      fiverrGigUrl: data.fiverrGigUrl,
      paymentStatus: data.paymentStatus
    });
    return {
      ok: true,
      action: "upsertUser",
      username: username,
      account: account,
      created: !existing,
      updated: Boolean(existing)
    };
  });
}

async function deleteUser(data) {
  if (isRestricted(data)) return { ok: false, error: "Only Super Admin can delete login users." };
  const username = lower(data.username);
  const wantedAccount = lower(data.account || data.name);
  if (!username && !wantedAccount) return { ok: false, error: "Username or account is required." };
  if (isSuperAdminUsername(username) || isSuperAdminUsername(wantedAccount)) {
    return { ok: false, error: "SuperAdmin cannot be deleted." };
  }
  return withClient(async function (client) {
    let account = wantedAccount;
    if (!account && username) {
      const row = (await client.query(
        "select account from public.sheet_users where lower(username) = $1 limit 1",
        [username]
      )).rows[0];
      account = lower(row && row.account);
    }
    if (!username && account) {
      const row = (await client.query(
        "select username from public.sheet_users where lower(account) = $1 limit 1",
        [account]
      )).rows[0];
      if (row && row.username) {
        data.username = row.username;
      }
    }
    const loginName = lower(data.username || username);
    if (loginName) {
      await client.query("delete from public.sheet_users where lower(username) = $1", [loginName]);
    }
    if (account) {
      await client.query("delete from public.sheet_users where lower(account) = $1", [account]);
      await client.query("delete from public.sheet_accounts where lower(account) = $1", [account]);
      const orders = await client.query(
        "select order_id from public.sheet_orders where lower(tab_name) = $1 or lower(account_name) = $1",
        [account]
      );
      const ids = orders.rows.map(function (row) { return row.order_id; }).filter(Boolean);
      await client.query(
        "delete from public.sheet_orders where lower(tab_name) = $1 or lower(account_name) = $1",
        [account]
      );
      if (ids.length) {
        await client.query("delete from public.sheet_hanif_records where order_id = any($1::text[])", [ids]);
      }
      await client.query(
        `delete from public.sheet_hanif_records
         where lower(coalesce(payload->>'account','')) = $1
            or lower(coalesce(payload->>'accountName','')) = $1
            or lower(coalesce(payload->>'tabName','')) = $1`,
        [account]
      );
    }
    return { ok: true, action: "deleteUser", username: loginName, account: account };
  });
}

async function upsertAccountRow(client, item) {
  const account = tabName(item.account || item.name);
  if (!account) return;
  await client.query(
    `insert into public.sheet_accounts
      (account, username, person_name, whatsapp, fiverr_id, fiverr_gig_url, payment_status, updated_at)
     values ($1,$2,$3,$4,$5,$6,$7,now())
     on conflict (account) do update set
       username = excluded.username,
       person_name = excluded.person_name,
       whatsapp = excluded.whatsapp,
       fiverr_id = excluded.fiverr_id,
       fiverr_gig_url = excluded.fiverr_gig_url,
       payment_status = excluded.payment_status,
       updated_at = now()`,
    [
      account,
      trim(item.username || account),
      trim(item.personName || item.displayName || account),
      trim(item.whatsapp),
      trim(item.fiverrId),
      trim(item.fiverrGigUrl),
      trim(item.paymentStatus)
    ]
  );
}

async function upsertAccountProfile(data) {
  if (isRestricted(data)) return { ok: false, error: "Only Super Admin can edit account profiles." };
  if (trim(data.username) && (data.password != null && String(data.password) !== "")) {
    return upsertUser(data);
  }
  return withClient(async function (client) {
    await upsertAccountRow(client, data);
    return { ok: true, action: "upsertAccountProfile", account: tabName(data.account || data.name) };
  });
}

async function listHanifRecords(data) {
  if (isRestricted(data)) return { ok: false, error: "Only Super Admin can access Hanif Costing." };
  return withClient(async function (client) {
    const rate = await pkrRate(client);
    const result = await client.query("select payload from public.sheet_hanif_records order by order_id");
    const records = result.rows.map(function (row) { return row.payload; }).filter(function (item) {
      return item && item.orderId && lower(item.orderId) !== "total";
    });
    return { ok: true, action: "listHanifRecords", count: records.length, records: records, pkrRate: rate };
  });
}

async function updateHanifPayment(data) {
  if (isRestricted(data)) return { ok: false, error: "Only Super Admin can access Hanif Costing." };
  const orderId = trim(data.orderId);
  if (!orderId) return { ok: false, action: "updateHanifPayment", error: "Order ID is required." };
  return withClient(async function (client) {
    const existing = (await client.query(
      "select payload from public.sheet_hanif_records where order_id = $1",
      [orderId]
    )).rows[0];
    if (!existing) return { ok: false, action: "updateHanifPayment", error: "Hanif record was not found." };
    const record = Object.assign({}, existing.payload);
    const status = /^paid$/i.test(trim(data.hanifPaymentStatus)) ? "paid" : "unpaid";
    record.hanifPaymentStatus = status;
    if (status === "paid") {
      record.paidAmount = money(data.paidAmount != null ? data.paidAmount : record.hanifCost);
      record.paidAt = trim(data.paidAt || record.paidAt || new Date().toISOString());
    } else {
      record.paidAmount = 0;
      record.paidAt = "";
    }
    record.updatedAt = new Date().toISOString();
    await client.query(
      "update public.sheet_hanif_records set payload = $2::jsonb, updated_at = now() where order_id = $1",
      [orderId, JSON.stringify(record)]
    );
    return { ok: true, action: "updateHanifPayment", orderId: orderId, record: record };
  });
}

async function bulkUpdateHanifPayment(data) {
  const ids = data.orderIds || data.ids || [];
  const results = [];
  for (let i = 0; i < ids.length; i++) {
    results.push(await updateHanifPayment(Object.assign({}, data, { orderId: ids[i] })));
  }
  return { ok: true, action: "bulkUpdateHanifPayment", results: results };
}

async function deleteHanifRecord(data) {
  if (isRestricted(data)) return { ok: false, error: "Only Super Admin can access Hanif Costing." };
  const orderId = trim(data.orderId);
  return withClient(async function (client) {
    await client.query("delete from public.sheet_hanif_records where order_id = $1", [orderId]);
    return { ok: true, action: "deleteHanifRecord", orderId: orderId };
  });
}

async function syncHanifRecords(data) {
  if (isRestricted(data)) return { ok: false, error: "Only Super Admin can access Hanif Costing." };
  const incoming = data.orders || [];
  return withClient(async function (client) {
    let created = 0;
    let updated = 0;
    for (let i = 0; i < incoming.length; i++) {
      const item = incoming[i] || {};
      const orderId = trim(item.orderId || item.id);
      if (!orderId) continue;
      const exists = (await client.query("select 1 from public.sheet_hanif_records where order_id = $1", [orderId])).rowCount;
      const order = (await client.query("select payload, tab_name, account_name from public.sheet_orders where order_id = $1", [orderId])).rows[0];
      const payload = order ? Object.assign({ id: orderId, tabName: order.tab_name, accountName: order.account_name }, order.payload, item) : Object.assign({ id: orderId }, item);
      await touchHanif(client, payload);
      if (exists) updated += 1;
      else created += 1;
    }
    return { ok: true, action: "syncHanifRecords", created: created, updated: updated, pkrRate: await pkrRate(client) };
  });
}

async function workbookTabs(client) {
  const accounts = await client.query("select account from public.sheet_accounts");
  const orders = await client.query("select distinct tab_name from public.sheet_orders");
  const tabs = {};
  accounts.rows.forEach(function (row) { if (row.account) tabs[row.account] = true; });
  orders.rows.forEach(function (row) { if (row.tab_name) tabs[row.tab_name] = true; });
  return Object.keys(tabs);
}

let schemaReady = false;
async function ensureSchema() {
  if (schemaReady) return;
  await withClient(async function (client) {
    try {
      await client.query("select 1 from public.sheet_settings limit 1");
    } catch (err) {
      await client.query(SHEET_SQL);
    }
  });
  schemaReady = true;
}

async function handle(data) {
  const action = trim(data.action);
  if (action === "login") return login(data);
  if (action === "listUsers") return listUsers(data);
  if (action === "listAccounts") return listAccounts(data);
  if (action === "getUserProfile" || action === "getAccountProfile") return getUserProfile(data);
  if (action === "listOrders") return listOrders(data);
  if (action === "getOrder") return getOrder(data);
  if (action === "hasOrder") return hasOrder(data);
  if (action === "nextOrderId") return nextOrderId(data);
  if (action === "deleteOrder") return deleteOrder(data);
  if (action === "updateOrderStatus") return updateOrderStatus(data);
  if (action === "updateOrderSchedule") return updateOrderSchedule(data);
  if (action === "updateOrderNames") return updateOrderNames(data);
  if (action === "updateRevisionsData") return updateRevisionsData(data);
  if (action === "upsertUser") return upsertUser(data);
  if (action === "deleteUser") return deleteUser(data);
  if (action === "upsertAccountProfile") return upsertAccountProfile(data);
  if (action === "listHanifRecords") return listHanifRecords(data);
  if (action === "updateHanifPayment") return updateHanifPayment(data);
  if (action === "bulkUpdateHanifPayment") return bulkUpdateHanifPayment(data);
  if (action === "deleteHanifRecord") return deleteHanifRecord(data);
  if (action === "syncHanifRecords") return syncHanifRecords(data);
  if (action === "setupHanifSheet" || action === "formatHanifLedger" || action === "reconcileHanifRecords") {
    const list = await listHanifRecords(data);
    return Object.assign({ sheetName: "Hanif Costing Data", dashboardName: "Hanif Costing Dashboard", columns: 16 }, list, { action: action || "setupHanifSheet" });
  }
  if (action === "ensureScheduleColumns") {
    return withClient(async function (client) {
      return { ok: true, action: "ensureScheduleColumns", sheetColumns: HEADERS_LEN, tabs: await workbookTabs(client) };
    });
  }
  if (action === "ensureTabs" || action === "formatWorkbook" || action === "setupAccounts" || action === "setupUsers") {
    return withClient(async function (client) {
      return { ok: true, action: action || "ensureTabs", tabs: await workbookTabs(client), sheetColumns: HEADERS_LEN };
    });
  }
  if (action === "upsertOrder" || action === "upsert" || (!action && (data.row || data.orderId || data.order))) {
    return upsertOrder(data);
  }
  return { ok: true, service: "Owlistic Order Management", sheetColumns: HEADERS_LEN, database: "supabase" };
}

module.exports = {
  handle,
  login,
  listUsers,
  listOrders,
  upsertOrder,
  normalizeRole,
  HEADERS_LEN,
  SUPERADMIN_USERNAME,
  SUPERADMIN_PASSWORD
};
