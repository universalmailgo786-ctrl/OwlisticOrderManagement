const { cors, send } = require("./_lib/http");
const { withClient } = require("./_lib/pg");
const SHEET_SQL = require("./_lib/sheet-sql");

const APPS =
  process.env.OWLISTIC_DRIVE_URL ||
  "https://script.google.com/macros/s/AKfycbwlWvSU1b8SJ42_3xdrrl1w7GhUiezAjBN85w9MvD-uFc-jg8m6OGJdGJRLm-fLIdl2/exec";
const USERS_SID = "1WMIorEpqZk20VuzJ3NaB2x66xHlLh_6dh84h-yTW0Zc";

function parseJson(text) {
  const raw = String(text || "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try { return JSON.parse(raw.slice(start, end + 1)); } catch (err) { return null; }
}

async function fetchText(url) {
  const response = await fetch(url, { method: "GET", redirect: "follow" });
  return response.text();
}

async function appsGet(params) {
  const url = new URL(APPS);
  Object.keys(params).forEach(function (key) {
    url.searchParams.set(key, String(params[key]));
  });
  return parseJson(await fetchText(url.toString()));
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const raw = String(text || "").replace(/^\uFEFF/, "");
  for (let i = 0; i < raw.length; i++) {
    const ch = raw.charAt(i);
    const next = raw.charAt(i + 1);
    if (quoted) {
      if (ch === '"' && next === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") {
      row.push(cell);
      if (row.some(function (part) { return String(part || "").trim(); })) rows.push(row);
      row = []; cell = "";
    } else if (ch !== "\r") cell += ch;
  }
  row.push(cell);
  if (row.some(function (part) { return String(part || "").trim(); })) rows.push(row);
  return rows;
}

function csvMaps(text) {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const headers = rows[0].map(function (h) { return String(h || "").trim(); });
  return rows.slice(1).map(function (row) {
    const out = {};
    headers.forEach(function (h, i) { out[h] = row[i] == null ? "" : row[i]; });
    return out;
  });
}

function activeValue(value) {
  const raw = String(value || "Yes").trim().toLowerCase();
  return !(raw === "no" || raw === "false" || raw === "0");
}

async function importAll() {
  await withClient(async function (client) {
    await client.query(SHEET_SQL);
  });

  const usersCsv = csvMaps(await fetchText(
    "https://docs.google.com/spreadsheets/d/" + USERS_SID + "/export?format=csv&gid=0"
  ));
  const listUsers = await appsGet({ action: "listUsers", role: "superadmin" }) || { users: [] };
  const listAccounts = await appsGet({ action: "listAccounts", role: "superadmin" }) || { accounts: [] };
  const tabs = ["Block", "Artistic", "jd Designs", "aabi_designers", "Unassigned", "Fahad_Gfx_", "Fahad_Gfx"];
  (listUsers.users || []).forEach(function (user) {
    if (user.account && tabs.indexOf(user.account) < 0) tabs.push(user.account);
  });
  const listOrders = await appsGet({
    action: "listOrders",
    role: "superadmin",
    tabs: tabs.join(",")
  }) || { orders: [] };
  const listHanif = await appsGet({ action: "listHanifRecords", role: "superadmin" }) || { records: [] };

  const counts = { users: 0, accounts: 0, orders: 0, hanif: 0 };

  await withClient(async function (client) {
    const csvByUser = {};
    usersCsv.forEach(function (row) {
      const username = String(row.Username || "").trim();
      if (username) csvByUser[username.toLowerCase()] = row;
    });
    const liveUsers = (listUsers.users || []).slice();
    const superCsv = csvByUser.superadmin;
    if (superCsv) liveUsers.unshift({
      username: String(superCsv.Username || "SuperAdmin"),
      account: "",
      displayName: String(superCsv["Display Name"] || "Ashar"),
      personName: String(superCsv["Display Name"] || "Ashar"),
      role: "superadmin",
      active: true,
      whatsapp: "",
      fiverrId: "",
      fiverrGigUrl: "",
      paymentStatus: ""
    });
    const importedUsers = {};
    for (let i = 0; i < liveUsers.length; i++) {
      const live = liveUsers[i] || {};
      const username = String(live.username || "").trim();
      if (!username || importedUsers[username.toLowerCase()]) continue;
      if (/^fahad_gfx/i.test(username) || /^fahad_gfx/i.test(String(live.account || ""))) continue;
      importedUsers[username.toLowerCase()] = true;
      const row = csvByUser[username.toLowerCase()] || {};
      await client.query(
        `insert into public.sheet_users
          (username, password, role, account, display_name, active, whatsapp, fiverr_id, fiverr_gig_url, payment_status, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
         on conflict (username) do update set
           password = excluded.password,
           role = excluded.role,
           account = excluded.account,
           display_name = excluded.display_name,
           active = excluded.active,
           whatsapp = excluded.whatsapp,
           fiverr_id = excluded.fiverr_id,
           fiverr_gig_url = excluded.fiverr_gig_url,
           payment_status = excluded.payment_status,
           updated_at = now()`,
        [
          username,
          String(row.Password || (String(username).toLowerCase() === "superadmin" ? "superman" : "")),
          String((live.role || row.Role || "user")).trim() || "user",
          String(live.account || row.Account || "").trim(),
          String(live.displayName || live.personName || row["Display Name"] || live.account || username).trim(),
          activeValue(row.Active != null && row.Active !== "" ? row.Active : "Yes"),
          String(live.whatsapp || row["WhatsApp Number"] || "").trim(),
          String(live.fiverrId || row["Fiverr ID Name"] || "").trim(),
          String(live.fiverrGigUrl || row["Fiverr GIG URL"] || "").trim(),
          String(live.paymentStatus || row["Payment Status"] || "").trim()
        ]
      );
      counts.users += 1;
    }

    const accounts = listAccounts.accounts || [];
    const seen = {};
    for (let i = 0; i < accounts.length; i++) {
      const item = accounts[i] || {};
      const account = String(item.account || item.name || "").trim();
      if (!account || seen[account.toLowerCase()]) continue;
      if (/^fahad_gfx/i.test(account)) continue;
      seen[account.toLowerCase()] = true;
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
          String(item.username || account).trim(),
          String(item.personName || item.displayName || account).trim(),
          String(item.whatsapp || "").trim(),
          String(item.fiverrId || "").trim(),
          String(item.fiverrGigUrl || "").trim(),
          String(item.paymentStatus || "").trim()
        ]
      );
      counts.accounts += 1;
    }

    const orders = listOrders.orders || [];
    for (let i = 0; i < orders.length; i++) {
      const order = orders[i] || {};
      const orderId = String(order.id || "").trim();
      if (!orderId) continue;
      await client.query(
        `insert into public.sheet_orders (order_id, tab_name, account_name, payload, created_at, updated_at)
         values ($1,$2,$3,$4::jsonb,$5,now())
         on conflict (order_id) do update set
           tab_name = excluded.tab_name,
           account_name = excluded.account_name,
           payload = excluded.payload,
           created_at = coalesce(public.sheet_orders.created_at, excluded.created_at),
           updated_at = now()`,
        [
          orderId,
          String(order.tabName || order.accountName || "").trim(),
          String(order.accountName || order.tabName || "").trim(),
          JSON.stringify(order),
          order.createdAt || null
        ]
      );
      counts.orders += 1;
    }

    const hanif = listHanif.records || [];
    for (let i = 0; i < hanif.length; i++) {
      const record = hanif[i] || {};
      const orderId = String(record.orderId || "").trim();
      if (!orderId || /^total$/i.test(orderId)) continue;
      await client.query(
        `insert into public.sheet_hanif_records (order_id, payload, updated_at)
         values ($1,$2::jsonb,now())
         on conflict (order_id) do update set payload = excluded.payload, updated_at = now()`,
        [orderId, JSON.stringify(record)]
      );
      counts.hanif += 1;
    }

    if (listHanif.pkrRate) {
      await client.query(
        `insert into public.sheet_settings (key, value, updated_at) values ('pkr_rate', $1, now())
         on conflict (key) do update set value = excluded.value, updated_at = now()`,
        [String(listHanif.pkrRate)]
      );
    }
  });

  return {
    ok: true,
    imported: true,
    counts: counts,
    workbookTabs: listOrders.workbookTabs || []
  };
}

async function status() {
  await withClient(async function (client) {
    await client.query(SHEET_SQL);
  });
  return withClient(async function (client) {
    const users = await client.query("select count(*)::int as n from public.sheet_users");
    const accounts = await client.query("select count(*)::int as n from public.sheet_accounts");
    const orders = await client.query("select count(*)::int as n from public.sheet_orders");
    const hanif = await client.query("select count(*)::int as n from public.sheet_hanif_records");
    return {
      ok: true,
      applied: true,
      imported: Number(users.rows[0].n) > 0,
      counts: {
        users: users.rows[0].n,
        accounts: accounts.rows[0].n,
        orders: orders.rows[0].n,
        hanif: hanif.rows[0].n
      }
    };
  });
}

function wantsForce(req) {
  try {
    return new URL(req.url, "http://localhost").searchParams.get("force") === "1";
  } catch (err) {
    return false;
  }
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
  try {
    if (req.method === "GET") {
      return send(res, 200, await status());
    }
    const current = await status();
    if (current.imported && !wantsForce(req)) {
      return send(res, 200, Object.assign({ alreadyImported: true }, current));
    }
    const result = await importAll();
    return send(res, 200, result);
  } catch (err) {
    return send(res, 500, { ok: false, error: err.message || "Import failed." });
  }
};

module.exports.importAll = importAll;
module.exports.status = status;
