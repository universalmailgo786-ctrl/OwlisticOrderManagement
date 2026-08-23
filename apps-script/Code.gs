var SPREADSHEET_ID = "1nZuMePQFJA9lCQ6C48d9MUC3Fwn00ao6Kilap5rbFfQ";
var USERS_SPREADSHEET_ID = "1WMIorEpqZk20VuzJ3NaB2x66xHlLh_6dh84h-yTW0Zc";
var USER_HEADERS = ["Username", "Password", "Role", "Account", "Display Name", "Active"];
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

var FOREST = "#223829";
var CREAM = "#f7f3ec";
var PAPER = "#fffdf8";
var INK = "#17211c";
var MUTED = "#5c6560";
var SAGE = "#e7efe0";
var SAGE_TEXT = "#3d5a2c";
var ROSE = "#fbe7dc";
var ROSE_TEXT = "#8a3d22";
var GOLD = "#f4ead0";
var GOLD_TEXT = "#6b5420";
var SKY = "#e4eef4";
var SKY_TEXT = "#1f4f66";
var COL_WIDTHS = [118, 122, 108, 140, 128, 150, 150, 150, 108, 132, 140, 150, 240, 220, 160, 140, 200, 200, 92, 260, 140, 220, 220, 168, 168];
var TAB_COLORS = ["#9baa86", "#c4a574", "#4e91b1", "#e98a5f", "#708b55", "#8b6b4a"];
var FORMAT_ROWS = 300;

function doGet(e) {
  var params = (e && e.parameter) || {};
  var action = String(params.action || "");
  if (action === "login") {
    return json_(login_(params.username, params.password));
  }
  if (action === "setupUsers") {
    return json_(setupUsersSheet_());
  }
  return json_({ ok: true, service: "Ashar Orders Management System" });
}

function doPost(e) {
  try {
    var data = JSON.parse((e.postData && e.postData.contents) || "{}");
    if (data.action === "login") {
      return json_(login_(data.username, data.password));
    }
    if (data.action === "setupUsers") {
      return json_(setupUsersSheet_());
    }

    var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    if (data.action === "ensureTabs") {
      if (isRestrictedUser_(data)) {
        return json_({ ok: false, error: "Only Super Admin can manage account tabs." });
      }
      return json_(ensureTabs_(ss, data.accounts || []));
    }
    if (data.action === "formatWorkbook") {
      if (isRestrictedUser_(data)) {
        return json_({ ok: false, error: "Only Super Admin can format the workbook." });
      }
      return json_(formatWorkbook_(ss));
    }

    return json_(upsertOrder_(ss, data));
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function setupUsersSheet() {
  return setupUsersSheet_();
}

function formatWorkbook() {
  return formatWorkbook_(SpreadsheetApp.openById(SPREADSHEET_ID));
}

function ensureTabs_(ss, accounts) {
  var tabs = [];
  formatWorkbook_(ss);
  for (var i = 0; i < accounts.length; i++) {
    var account = accounts[i] || {};
    var name = tabName_(account.name || account.id || "");
    if (!name) continue;
    var sheet = getOrCreateSheet_(ss, name);
    styleSheet_(ss, sheet);
    tabs.push(sheet.getName());
  }
  return { ok: true, action: "ensureTabs", tabs: tabs };
}

function formatWorkbook_(ss) {
  var first = ss.getSheets()[0];
  if (first && first.getName() === "Sheet1") {
    first.setName("Unassigned");
  }
  var sheets = ss.getSheets();
  var names = [];
  for (var i = 0; i < sheets.length; i++) {
    styleSheet_(ss, sheets[i]);
    names.push(sheets[i].getName());
  }
  return { ok: true, action: "formatWorkbook", tabs: names };
}

function isRestrictedUser_(data) {
  var role = String((data && data.role) || "").toLowerCase().replace(/\s+/g, "");
  return role === "user" || role === "account";
}

function forcedAccount_(data) {
  if (!isRestrictedUser_(data)) return "";
  return tabName_(data.userAccount || data.account || "");
}

function upsertOrder_(ss, data) {
  var row = data.row || [];
  var orderId = String(data.orderId || row[0] || "");
  var forced = forcedAccount_(data);
  var wantedName = forced || tabName_(data.tabName || data.accountName || "");
  var target = wantedName ? getOrCreateSheet_(ss, wantedName) : ss.getSheets()[0];
  if (forced && tabName_(target.getName()) !== forced) {
    return { ok: false, error: "You can only save orders to the " + forced + " tab." };
  }
  styleSheet_(ss, target);

  while (row.length < HEADERS.length) {
    row.push("");
  }
  row = row.slice(0, HEADERS.length);
  if (forced) {
    row[5] = forced;
  }

  var found = findOrder_(ss, orderId);
  if (found) {
    if (forced && tabName_(found.sheet.getName()) !== forced) {
      return { ok: false, error: "You can only edit orders on the " + forced + " tab." };
    }
    if (found.sheet.getSheetId() === target.getSheetId()) {
      target.getRange(found.row, 1, 1, HEADERS.length).setValues([row]);
      styleDataRow_(target, found.row);
      return { ok: true, updated: true, orderId: orderId, tab: target.getName() };
    }
    target.appendRow(row);
    styleDataRow_(target, target.getLastRow());
    found.sheet.deleteRow(found.row);
    return { ok: true, moved: true, orderId: orderId, tab: target.getName() };
  }

  target.appendRow(row);
  styleDataRow_(target, target.getLastRow());
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
  if (!name || /^(no account|unassigned)$/i.test(name)) return "";
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

function styleSheet_(ss, sheet) {
  var cols = HEADERS.length;
  var lastRow = Math.max(sheet.getLastRow(), FORMAT_ROWS);
  var lastCol = Math.max(sheet.getLastColumn(), cols);

  if (lastCol > cols) {
    sheet.getRange(1, cols + 1, lastRow, lastCol - cols).clear();
  }

  sheet.getRange(1, 1, 1, cols).setValues([HEADERS]);
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);
  try {
    sheet.setHiddenGridlines(true);
  } catch (err) {}

  var header = sheet.getRange(1, 1, 1, cols);
  header.setFontFamily("Google Sans");
  header.setFontWeight("bold");
  header.setFontSize(10);
  header.setFontColor("#ffffff");
  header.setBackground(FOREST);
  header.setHorizontalAlignment("center");
  header.setVerticalAlignment("middle");
  header.setWrap(true);
  sheet.setRowHeight(1, 46);
  header.setNotes([[
    "Unique order id. Stays visible when you scroll.",
    "Date the order was first saved.",
    "Time the order was first saved.",
    "Date of the latest update.",
    "Time of the latest update.",
    "Client / account tab this order belongs to.",
    "WhatsApp number for this order.",
    "Person name.",
    "Quoted or paid amount.",
    "Use Paid or Unpaid. Filter from the header arrow.",
    "Keyword used to find this order.",
    "Custom message, Direct, or both.",
    "Buyer message / brief.",
    "Direct-order requirements.",
    "Attached requirement file names.",
    "Fiverr username.",
    "Link to the Fiverr gig.",
    "Review or feedback text.",
    "How many revision rounds exist.",
    "Full revision conversation history.",
    "The revision currently in play.",
    "Most recent buyer comment.",
    "Most recent seller reply.",
    "Ready to Approve or Not Ready. Dropdown in each cell.",
    "Overall workflow status. Dropdown in each cell."
  ]]);

  var dataRows = Math.max(lastRow - 1, FORMAT_ROWS - 1);
  var body = sheet.getRange(2, 1, dataRows, cols);
  body.setFontFamily("Google Sans");
  body.setFontSize(10);
  body.setFontColor(INK);
  body.setVerticalAlignment("middle");
  body.setWrap(true);

  sheet.getRange(2, 1, dataRows, 1).setFontWeight("bold").setFontColor(FOREST);
  sheet.getRange(2, 2, dataRows, 4).setHorizontalAlignment("center");
  sheet.getRange(2, 9, dataRows, 1).setHorizontalAlignment("right");
  sheet.getRange(2, 10, dataRows, 1).setHorizontalAlignment("center");
  sheet.getRange(2, 19, dataRows, 1).setHorizontalAlignment("center");
  sheet.getRange(2, 24, dataRows, 2).setHorizontalAlignment("center");

  var bandings = sheet.getBandings();
  for (var b = 0; b < bandings.length; b++) {
    bandings[b].remove();
  }
  var banding = sheet.getRange(1, 1, lastRow, cols).applyRowBanding();
  banding.setHeaderRowColor(FOREST);
  banding.setFirstRowColor(PAPER);
  banding.setSecondRowColor(CREAM);

  for (var c = 0; c < COL_WIDTHS.length; c++) {
    sheet.setColumnWidth(c + 1, COL_WIDTHS[c]);
  }

  var filter = sheet.getFilter();
  if (filter) filter.remove();
  sheet.getRange(1, 1, lastRow, cols).createFilter();

  applyStatusColors_(sheet, dataRows);
  applyDropdowns_(sheet, dataRows);
  colorTab_(ss, sheet);
}

function styleDataRow_(sheet, row) {
  if (row < 2) return;
  var range = sheet.getRange(row, 1, 1, HEADERS.length);
  range.setFontFamily("Google Sans");
  range.setFontSize(10);
  range.setFontColor(INK);
  range.setVerticalAlignment("middle");
  range.setWrap(true);
  sheet.getRange(row, 1).setFontWeight("bold").setFontColor(FOREST);
  sheet.setRowHeight(row, 32);
}

function applyStatusColors_(sheet, dataRows) {
  sheet.clearConditionalFormatRules();
  var rules = [];

  function chip(column, text, bg, fg) {
    return SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(text)
      .setBackground(bg)
      .setFontColor(fg)
      .setRanges([sheet.getRange(2, column, dataRows, 1)])
      .build();
  }

  rules.push(chip(10, "Paid", SAGE, SAGE_TEXT));
  rules.push(chip(10, "Unpaid", ROSE, ROSE_TEXT));
  rules.push(chip(24, "Ready to Approve", SAGE, SAGE_TEXT));
  rules.push(chip(24, "Not Ready", CREAM, MUTED));
  rules.push(chip(25, "Complete", SAGE, SAGE_TEXT));
  rules.push(chip(25, "Ready to Approve", SAGE, SAGE_TEXT));
  rules.push(chip(25, "In Progress", SKY, SKY_TEXT));
  rules.push(chip(25, "Waiting", GOLD, GOLD_TEXT));
  rules.push(chip(25, "Revision Pending", GOLD, GOLD_TEXT));
  rules.push(chip(25, "Revision Needed", ROSE, ROSE_TEXT));

  sheet.setConditionalFormatRules(rules);
}

function applyDropdowns_(sheet, dataRows) {
  var payment = SpreadsheetApp.newDataValidation()
    .requireValueInList(["Paid", "Unpaid"], true)
    .setAllowInvalid(true)
    .setHelpText("Paid or Unpaid")
    .build();
  var ready = SpreadsheetApp.newDataValidation()
    .requireValueInList(["Ready to Approve", "Not Ready"], true)
    .setAllowInvalid(true)
    .setHelpText("Ready to Approve or Not Ready")
    .build();
  var status = SpreadsheetApp.newDataValidation()
    .requireValueInList(
      ["In Progress", "Ready to Approve", "Revision Pending", "Waiting", "Revision Needed", "Complete"],
      true
    )
    .setAllowInvalid(true)
    .setHelpText("Choose the current workflow status")
    .build();

  sheet.getRange(2, 10, dataRows, 1).setDataValidation(payment);
  sheet.getRange(2, 24, dataRows, 1).setDataValidation(ready);
  sheet.getRange(2, 25, dataRows, 1).setDataValidation(status);
}

function colorTab_(ss, sheet) {
  if (sheet.getIndex() === 1) {
    sheet.setTabColor(FOREST);
    return;
  }
  var sheets = ss.getSheets();
  var colorIndex = 0;
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === sheet.getSheetId()) {
      colorIndex = Math.max(0, i - 1);
      break;
    }
  }
  sheet.setTabColor(TAB_COLORS[colorIndex % TAB_COLORS.length]);
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function setupUsersSheet_() {
  var ss = SpreadsheetApp.openById(USERS_SPREADSHEET_ID);
  var sheet = ss.getSheets()[0];
  if (sheet.getName() === "Sheet1") sheet.setName("Users");
  var cols = USER_HEADERS.length;
  var first = String(sheet.getRange(1, 1).getValue() || "").trim().toLowerCase();
  if (first !== "username") {
    sheet.getRange(1, 1, 1, cols).setValues([USER_HEADERS]);
  }
  if (sheet.getLastRow() < 2) {
    sheet.getRange(2, 1, 2, cols).setValues([
      ["superadmin", "ChangeMeAdmin", "superadmin", "", "Super Admin", "Yes"],
      ["block", "ChangeMeBlock", "user", "Block", "Block", "Yes"]
    ]);
  }
  var header = sheet.getRange(1, 1, 1, cols);
  header.setFontFamily("Google Sans");
  header.setFontWeight("bold");
  header.setFontSize(10);
  header.setFontColor("#ffffff");
  header.setBackground(FOREST);
  header.setHorizontalAlignment("center");
  header.setVerticalAlignment("middle");
  sheet.setRowHeight(1, 42);
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);
  try { sheet.setHiddenGridlines(true); } catch (err) {}
  var body = sheet.getRange(2, 1, 40, cols);
  body.setFontFamily("Google Sans");
  body.setFontSize(10);
  body.setVerticalAlignment("middle");
  var widths = [140, 140, 120, 160, 180, 90];
  for (var i = 0; i < widths.length; i++) sheet.setColumnWidth(i + 1, widths[i]);
  var filter = sheet.getFilter();
  if (filter) filter.remove();
  sheet.getRange(1, 1, 40, cols).createFilter();
  var roleRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["superadmin", "user"], true)
    .setAllowInvalid(true)
    .setHelpText("superadmin can see every account. user is locked to one Account tab.")
    .build();
  var activeRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["Yes", "No"], true)
    .setAllowInvalid(true)
    .build();
  sheet.getRange(2, 3, 40, 1).setDataValidation(roleRule);
  sheet.getRange(2, 6, 40, 1).setDataValidation(activeRule);
  sheet.getRange("A1").setNote("Add one row per person. Super Admin can see every tab. A user such as Block can only fill and view that account.");
  sheet.getRange("C1").setNote("Use superadmin or user.");
  sheet.getRange("D1").setNote("For user rows, this must match the account name / sheet tab, for example Block.");
  sheet.getRange("B1").setNote("Set each password here. Leave blank until you are ready for that person to log in.");
  sheet.setTabColor(FOREST);
  return { ok: true, action: "setupUsers", sheet: sheet.getName() };
}

function login_(username, password) {
  setupUsersSheetIfNeeded_();
  var wantedUser = String(username || "").trim().toLowerCase();
  var wantedPass = String(password || "");
  if (!wantedUser || !wantedPass) {
    return { ok: false, error: "Enter username and password." };
  }
  var ss = SpreadsheetApp.openById(USERS_SPREADSHEET_ID);
  var sheet = ss.getSheets()[0];
  var last = Math.max(sheet.getLastRow(), 1);
  if (last < 2) {
    return { ok: false, error: "No users in the login sheet yet." };
  }
  var values = sheet.getRange(2, 1, last - 1, USER_HEADERS.length).getValues();
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var name = String(row[0] || "").trim().toLowerCase();
    if (!name || name !== wantedUser) continue;
    var active = String(row[5] || "Yes").trim().toLowerCase();
    if (active === "no" || active === "false" || active === "0") {
      return { ok: false, error: "This user is inactive." };
    }
    if (String(row[1] || "") !== wantedPass) {
      return { ok: false, error: "Wrong username or password." };
    }
    var role = String(row[2] || "user").trim().toLowerCase().replace(/\s+/g, "");
    if (role === "super admin" || role === "admin") role = "superadmin";
    var account = tabName_(row[3] || "");
    if (role !== "superadmin" && !account) {
      return { ok: false, error: "This user has no Account assigned in the login sheet." };
    }
    return {
      ok: true,
      username: String(row[0] || "").trim(),
      role: role === "superadmin" ? "superadmin" : "user",
      account: account,
      name: String(row[4] || row[0] || "").trim()
    };
  }
  return { ok: false, error: "Wrong username or password." };
}

function setupUsersSheetIfNeeded_() {
  var ss = SpreadsheetApp.openById(USERS_SPREADSHEET_ID);
  var sheet = ss.getSheets()[0];
  var first = String(sheet.getRange(1, 1).getValue() || "").trim().toLowerCase();
  if (first !== "username") setupUsersSheet_();
}
