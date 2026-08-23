var SPREADSHEET_ID = "1nZuMePQFJA9lCQ6C48d9MUC3Fwn00ao6Kilap5rbFfQ";
var HEADERS = [
  "Order ID",
  "Created Date",
  "Created Time",
  "Last Updated Date",
  "Last Updated Time",
  "Account",
  "WhatsApp Number",
  "Your Name",
  "Order Value",
  "Payment Status",
  "Search Keyword",
  "Order Type",
  "Message Text",
  "Direct Order Requirements",
  "Requirement Files",
  "Fiverr ID Name",
  "Fiverr GIG URL",
  "Review Text (Feedback)",
  "Revision Count",
  "Revision History",
  "Current Revision",
  "Latest Buyer Message",
  "Latest Seller Reply",
  "Ready to Approve",
  "Overall Status"
];

function doGet() {
  return json_({ ok: true, service: "Ashar Orders Management System" });
}

function doPost(e) {
  try {
    var data = JSON.parse((e.postData && e.postData.contents) || "{}");
    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    if (data.action === "ensureTabs") {
      return json_(ensureTabs_(ss, data.accounts || []));
    }

    return json_(upsertOrder_(ss, data));
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function ensureTabs_(ss, accounts) {
  var tabs = [];
  for (var i = 0; i < accounts.length; i++) {
    var account = accounts[i] || {};
    var name = tabName_(account.name || account.id || "");
    if (!name) continue;
    var sheet = getOrCreateSheet_(ss, name);
    ensureHeaders_(sheet);
    tabs.push(sheet.getName());
  }
  return { ok: true, action: "ensureTabs", tabs: tabs };
}

function upsertOrder_(ss, data) {
  var row = data.row || [];
  var orderId = String(data.orderId || row[0] || "");
  var wantedName = tabName_(data.tabName || data.accountName || "");
  var target = wantedName ? getOrCreateSheet_(ss, wantedName) : ss.getSheets()[0];
  ensureHeaders_(target);

  while (row.length < HEADERS.length) {
    row.push("");
  }
  row = row.slice(0, HEADERS.length);

  var found = findOrder_(ss, orderId);
  if (found) {
    if (found.sheet.getSheetId() === target.getSheetId()) {
      target.getRange(found.row, 1, 1, HEADERS.length).setValues([row]);
      return { ok: true, updated: true, orderId: orderId, tab: target.getName() };
    }
    target.appendRow(row);
    found.sheet.deleteRow(found.row);
    return { ok: true, moved: true, orderId: orderId, tab: target.getName() };
  }

  target.appendRow(row);
  return { ok: true, created: true, orderId: orderId, tab: target.getName() };
}

function findOrder_(ss, orderId) {
  if (!orderId) return null;
  var sheets = ss.getSheets();
  for (var s = 0; s < sheets.length; s++) {
    var sheet = sheets[s];
    var last = sheet.getLastRow();
    if (last < 2) continue;
    var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === orderId) {
        return { sheet: sheet, row: i + 2 };
      }
    }
  }
  return null;
}

function tabName_(raw) {
  var name = String(raw || "")
    .replace(/[:\\\/\?\*\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!name || /^(no account|no account)$/i.test(name)) return "";
  if (name.length > 100) name = name.substring(0, 100).trim();
  return name;
}

function getOrCreateSheet_(ss, name) {
  var sheets = ss.getSheets();
  var lower = name.toLowerCase();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().toLowerCase() === lower) {
      return sheets[i];
    }
  }
  return ss.insertSheet(name);
}

function ensureHeaders_(sheet) {
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  sheet.setFrozenRows(1);
  var header = sheet.getRange(1, 1, 1, HEADERS.length);
  header.setFontWeight("bold");
  header.setWrap(true);
  header.setBackground("#223829");
  header.setFontColor("#ffffff");
  header.setVerticalAlignment("middle");
  sheet.setRowHeight(1, 36);
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
