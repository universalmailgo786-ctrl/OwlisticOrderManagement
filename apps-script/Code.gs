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
  "Overall Status",
  "Business Name",
  "Client Name"
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
var COL_WIDTHS = [118, 122, 108, 140, 128, 150, 150, 150, 108, 132, 140, 150, 240, 220, 220, 140, 200, 200, 92, 260, 140, 220, 220, 168, 168, 160, 160];
var FILES_FOLDER_ID = "1feJrckxiyjHzCe9Rz_w-L879BWjpExdB";
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
  if (action === "listOrders") {
    return json_(listOrders_(params));
  }
  if (action === "hasOrder") {
    return json_(hasOrder_(params));
  }
  if (action === "getOrder") {
    return json_(getOrder_(params));
  }
  if (action === "getUpload") {
    return json_(getUpload_(params));
  }
  if (action === "driveStatus") {
    return json_(driveStatus_());
  }
  return json_({ ok: true, service: "Ashar Orders Management System", sheetColumns: HEADERS.length });
}

function doPost(e) {
  try {
    var data = JSON.parse((e.postData && e.postData.contents) || "{}");
    if (data.action === "uploadFile") {
      return json_(uploadFile_(data));
    }
    if (data.action === "login") {
      return json_(login_(data.username, data.password));
    }
    if (data.action === "setupUsers") {
      return json_(setupUsersSheet_());
    }
    if (data.action === "upsertUser") {
      if (isRestrictedUser_(data)) {
        return json_({ ok: false, error: "Only Super Admin can add login users." });
      }
      return json_(upsertUser_(data));
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
    if (data.action === "deleteOrder") {
      return json_(deleteOrder_(ss, data));
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

function listOrders_(params) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var forced = "";
  var role = String((params && params.role) || "").toLowerCase().replace(/\s+/g, "");
  if (role === "user" || role === "account") {
    forced = tabName_((params && (params.userAccount || params.account)) || "");
    if (!forced) {
      return { ok: false, error: "This user has no Account assigned." };
    }
  }
  var allowedTabs = allowedTabs_(params, forced);
  if (!allowedTabs.length) {
    return { ok: true, action: "listOrders", count: 0, orders: [] };
  }
  var sheets = ss.getSheets();
  var orders = [];
  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    var name = sheet.getName();
    if (name === "Users") continue;
    if (!sheetMatchesAny_(name, allowedTabs)) continue;
    if (String(sheet.getRange(1, 1).getValue() || "").trim() !== "Order ID") continue;
    var last = sheet.getLastRow();
    if (last < 2) continue;
    var cols = Math.max(sheet.getLastColumn(), 1);
    var values = sheet.getRange(2, 1, last - 1, cols).getValues();
    var fileRich = [];
    try {
      fileRich = sheet.getRange(2, 15, last - 1, 1).getRichTextValues();
    } catch (err) {
      fileRich = [];
    }
    for (var r = 0; r < values.length; r++) {
      var row = values[r];
      while (row.length < HEADERS.length) row.push("");
      var id = String(row[0] || "").trim();
      if (!id) continue;
      if (!rowBelongsToAny_(row, name, allowedTabs)) continue;
      var rich = fileRich[r] && fileRich[r][0];
      orders.push(orderFromRow_(row, name, filesFromCell_(rich, row[14])));
    }
  }
  return { ok: true, action: "listOrders", count: orders.length, orders: orders };
}

function allowedTabs_(params, forced) {
  if (forced) return [forced];
  var raw = String((params && params.tabs) || "");
  if (!raw) return [];
  var parts = raw.split(",");
  var out = [];
  var i;
  for (i = 0; i < parts.length; i++) {
    var name = tabName_(parts[i]);
    if (name) out.push(name);
  }
  return out;
}

function sheetMatchesAny_(sheetName, allowed) {
  if (!allowed || !allowed.length) return false;
  var i;
  for (i = 0; i < allowed.length; i++) {
    if (sheetMatchesAccount_(sheetName, allowed[i])) return true;
  }
  return false;
}

function rowBelongsToAny_(row, tabName, allowed) {
  if (!allowed || !allowed.length) return false;
  var i;
  for (i = 0; i < allowed.length; i++) {
    if (rowBelongsToAccount_(row, tabName, allowed[i])) return true;
  }
  return false;
}

function isoFrom_(datePart, timePart) {
  if (datePart instanceof Date && !isNaN(datePart.getTime())) {
    var combined = new Date(datePart.getTime());
    if (timePart instanceof Date && !isNaN(timePart.getTime())) {
      combined.setHours(timePart.getHours(), timePart.getMinutes(), timePart.getSeconds(), 0);
    }
    return combined.toISOString();
  }
  var dateText = String(datePart || "").trim();
  if (!dateText) return "";
  var timeText = "";
  if (timePart instanceof Date && !isNaN(timePart.getTime())) {
    timeText = Utilities.formatDate(timePart, Session.getScriptTimeZone(), "HH:mm:ss");
  } else {
    timeText = String(timePart || "").trim();
  }
  var parsed = new Date(dateText + (timeText ? " " + timeText : ""));
  return isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

function cellText_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  return String(value == null ? "" : value).trim();
}

function parseFiles_(text) {
  var raw = String(text == null ? "" : text).replace(/\r/g, "").trim();
  if (!raw) return [];
  var chunks = [];
  String(raw).split(/\n|;/).forEach(function (part) {
    var chunk = String(part || "").trim();
    if (chunk) chunks.push(chunk);
  });
  var files = [];
  for (var i = 0; i < chunks.length; i++) {
    var chunk = chunks[i];
    var pipe = chunk.indexOf("|");
    if (pipe >= 0) {
      files.push({
        id: "",
        name: chunk.slice(0, pipe).trim(),
        url: chunk.slice(pipe + 1).trim()
      });
      continue;
    }
    var match = chunk.match(/^(.*)\s+(https?:\/\/\S+)\s*$/i);
    if (match) {
      files.push({ id: "", name: String(match[1] || "").trim(), url: String(match[2] || "").trim() });
    } else {
      files.push({ id: "", name: chunk, url: "" });
    }
  }
  return files.filter(function (file) { return file.name; });
}

function filesFromCell_(rich, fallbackText) {
  if (rich) {
    var runs = [];
    try {
      runs = rich.getRuns() || [];
    } catch (err) {
      runs = [];
    }
    var files = [];
    var buffer = "";
    var bufferUrl = "";
    function flush() {
      var name = String(buffer || "").replace(/\s+/g, " ").trim();
      if (name) files.push({ id: "", name: name, url: bufferUrl || "" });
      buffer = "";
      bufferUrl = "";
    }
    for (var i = 0; i < runs.length; i++) {
      var text = String(runs[i].getText() || "");
      var url = "";
      try {
        url = runs[i].getLinkUrl() || "";
      } catch (err2) {
        url = "";
      }
      if (text === "\n" || text === "\r\n") {
        flush();
        continue;
      }
      if (url && buffer && bufferUrl && url !== bufferUrl) flush();
      buffer += text;
      if (url) bufferUrl = url;
    }
    flush();
    if (files.length) return files;
    try {
      return parseFiles_(rich.getText() || fallbackText);
    } catch (err3) {}
  }
  return parseFiles_(fallbackText);
}

function rememberDriveError_(message) {
  try {
    PropertiesService.getScriptProperties().setProperty("driveLastError", String(message || "").slice(0, 500));
  } catch (err) {}
}

function clearDriveError_() {
  try {
    PropertiesService.getScriptProperties().deleteProperty("driveLastError");
  } catch (err) {}
}

function uploadKey_(id) {
  return "up_" + String(id || "").replace(/[^A-Za-z0-9_\-]/g, "").slice(0, 80);
}

function setUpload_(id, obj) {
  PropertiesService.getScriptProperties().setProperty(uploadKey_(id), JSON.stringify(obj || {}));
}

function getUpload_(params) {
  var id = String((params && (params.uploadId || params.localId)) || "");
  var raw = "";
  try {
    raw = PropertiesService.getScriptProperties().getProperty(uploadKey_(id)) || "";
  } catch (err) {
    raw = "";
  }
  if (!raw) {
    return {
      ok: true,
      action: "getUpload",
      status: "pending",
      uploadId: id,
      driveLastError: PropertiesService.getScriptProperties().getProperty("driveLastError") || ""
    };
  }
  var data = JSON.parse(raw);
  data.ok = data.status !== "error";
  data.action = "getUpload";
  data.uploadId = id;
  return data;
}

function driveStatus_() {
  var folderName = "";
  var folderError = "";
  try {
    folderName = filesFolder_().getName();
  } catch (err) {
    folderError = String(err);
  }
  return {
    ok: !folderError,
    action: "driveStatus",
    folderId: FILES_FOLDER_ID,
    folderName: folderName,
    folderError: folderError,
    lastError: PropertiesService.getScriptProperties().getProperty("driveLastError") || ""
  };
}

function uploadFile_(data) {
  var uploadId = String((data && (data.uploadId || data.localId)) || "");
  if (uploadId) setUpload_(uploadId, { status: "pending" });
  try {
    var saved = saveOneUpload_((data && data.orderId) || "", {
      name: (data && data.name) || "file",
      mimeType: (data && data.mimeType) || "application/octet-stream",
      data: (data && data.data) || ""
    });
    if (!saved) {
      var err = PropertiesService.getScriptProperties().getProperty("driveLastError") || "Drive upload failed.";
      if (uploadId) setUpload_(uploadId, { status: "error", error: err });
      return { ok: false, action: "uploadFile", status: "error", error: err, uploadId: uploadId };
    }
    var result = {
      status: "ok",
      name: saved.name,
      id: saved.id,
      url: saved.url,
      previewUrl: saved.previewUrl
    };
    if (uploadId) setUpload_(uploadId, result);
    result.ok = true;
    result.action = "uploadFile";
    result.uploadId = uploadId;
    return result;
  } catch (err) {
    var message = String(err);
    rememberDriveError_(message);
    if (uploadId) setUpload_(uploadId, { status: "error", error: message });
    return { ok: false, action: "uploadFile", status: "error", error: message, uploadId: uploadId };
  }
}

function filesFolder_() {
  try {
    return DriveApp.getFolderById(FILES_FOLDER_ID);
  } catch (err) {
    rememberDriveError_("Cannot open Images folder " + FILES_FOLDER_ID + ": " + err);
    throw err;
  }
}

function driveUrl_(fileId) {
  return "https://drive.google.com/uc?export=download&id=" + fileId;
}

function drivePreviewUrl_(fileId) {
  return "https://lh3.googleusercontent.com/d/" + fileId + "=w800";
}

function sharePublic_(file) {
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return;
  } catch (err1) {}
  try {
    file.setSharing(DriveApp.Access.ANYONE, DriveApp.Permission.VIEW);
  } catch (err2) {}
}

function savedFileInfo_(originalName, file) {
  var id = file.getId();
  return {
    name: originalName,
    id: id,
    url: driveUrl_(id),
    previewUrl: drivePreviewUrl_(id)
  };
}

function createDriveFile_(folder, blob) {
  try {
    return folder.createFile(blob);
  } catch (errCreate) {
    rememberDriveError_("createFile in Images folder failed: " + errCreate);
    var file = DriveApp.createFile(blob);
    try {
      file.moveTo(folder);
    } catch (errMove) {
      rememberDriveError_("File landed in My Drive; could not move to Images folder: " + errMove + " | first error: " + errCreate);
    }
    return file;
  }
}

function saveOneUpload_(orderId, item) {
  var list = saveUploads_(orderId, [item]);
  return list[0] || null;
}

function saveUploads_(orderId, uploads) {
  var list = uploads || [];
  var saved = [];
  if (!list.length) return saved;
  var folder = filesFolder_();
  var prefix = String(orderId || "order").replace(/[\\/:*?"<>|]+/g, "-").trim() || "order";
  for (var i = 0; i < list.length; i++) {
    try {
      var item = list[i] || {};
      var data = String(item.data || "").replace(/\s+/g, "");
      if (!data) {
        rememberDriveError_("Upload had no file data for " + (item.name || "file"));
        continue;
      }
      var originalName = String(item.name || "file").replace(/[\\/:*?"<>|]+/g, "-") || "file";
      var driveName = originalName.indexOf(prefix + "_") === 0 ? originalName : prefix + "_" + originalName;
      var bytes = Utilities.base64Decode(data);
      var blob = Utilities.newBlob(bytes, item.mimeType || "application/octet-stream", driveName);
      var file = createDriveFile_(folder, blob);
      sharePublic_(file);
      clearDriveError_();
      saved.push(savedFileInfo_(originalName, file));
    } catch (err2) {
      rememberDriveError_("Drive upload failed: " + err2);
    }
  }
  return saved;
}

function testDriveFolder() {
  var folder = filesFolder_();
  var blob = Utilities.newBlob("owlistic-drive-check", "text/plain", "ORD-TEST_drive-check.txt");
  var file = createDriveFile_(folder, blob);
  sharePublic_(file);
  return {
    ok: true,
    folder: folder.getName(),
    folderId: folder.getId(),
    fileId: file.getId(),
    url: driveUrl_(file.getId())
  };
}

function writeFilesCell_(range, files) {
  if (!files || !files.length) {
    range.clearContent();
    return;
  }
  var names = [];
  var links = [];
  var pos = 0;
  for (var i = 0; i < files.length; i++) {
    if (i) {
      names.push("\n");
      pos += 1;
    }
    var name = String(files[i].name || "file");
    names.push(name);
    if (files[i].url) {
      links.push({ start: pos, end: pos + name.length, url: files[i].url });
    }
    pos += name.length;
  }
  var text = names.join("");
  if (!links.length) {
    range.setValue(text);
    return;
  }
  var builder = SpreadsheetApp.newRichTextValue().setText(text);
  for (var j = 0; j < links.length; j++) {
    builder.setLinkUrl(links[j].start, links[j].end, links[j].url);
  }
  range.setRichTextValue(builder.build());
}

function attachUrlToFileName_(segment, name, url) {
  var text = String(segment || "");
  name = String(name || "");
  url = String(url || "");
  if (!name || !url || !text) return text;
  if (text.indexOf(url) >= 0 && text.indexOf(name) >= 0) return text;
  var out = "";
  var i = 0;
  var idx;
  while ((idx = text.indexOf(name, i)) >= 0) {
    var after = text.slice(idx + name.length).replace(/^\s+/, "");
    if (/^https?:\/\//i.test(after) || after.charAt(0) === "|") {
      out += text.slice(i, idx + name.length);
      i = idx + name.length;
      continue;
    }
    out += text.slice(i, idx) + name + " " + url;
    i = idx + name.length;
  }
  return out + text.slice(i);
}

function applySavedUrlsToText_(text, saved) {
  var list = saved || [];
  if (!list.length) return String(text || "");
  return String(text || "").split("\n").map(function (line) {
    var marker = "Files:";
    var pos = 0;
    var out = "";
    var found;
    while ((found = line.indexOf(marker, pos)) >= 0) {
      out += line.slice(pos, found + marker.length);
      var start = found + marker.length;
      var rest = line.slice(start);
      var stop = rest.search(/\s\|\s(?:Buyer|Seller)\b/i);
      var segment = stop >= 0 ? rest.slice(0, stop) : rest;
      var i;
      for (i = 0; i < list.length; i++) {
        segment = attachUrlToFileName_(segment, list[i].name, list[i].url);
      }
      out += segment;
      if (stop < 0) return out;
      pos = start + stop;
    }
    return out + line.slice(pos);
  }).join("\n");
}

function mergeRequirementFiles_(existingRich, existingText, incomingText, saved) {
  var existing = filesFromCell_(existingRich, existingText);
  var incoming = parseFiles_(incomingText);
  saved = (saved || []).slice();
  if (!incoming.length && existing.length && !saved.length) return existing;

  var out = [];
  var savedAt = 0;
  for (var i = 0; i < incoming.length; i++) {
    var file = {
      id: "",
      name: incoming[i].name,
      url: incoming[i].url || ""
    };
    if (!file.url) {
      for (var e = 0; e < existing.length; e++) {
        if (existing[e].name === file.name && existing[e].url) {
          file.url = existing[e].url;
          break;
        }
      }
    }
    if (!file.url && savedAt < saved.length && saved[savedAt].name === file.name) {
      file.url = saved[savedAt].url;
      file.id = saved[savedAt].id;
      savedAt += 1;
    } else if (!file.url) {
      for (var s = savedAt; s < saved.length; s++) {
        if (saved[s].name === file.name) {
          file.url = saved[s].url;
          file.id = saved[s].id;
          saved.splice(s, 1);
          break;
        }
      }
    }
    out.push(file);
  }
  return out;
}

function writeOrderRow_(sheet, rowIndex, row, files) {
  sheet.getRange(rowIndex, 1, 1, HEADERS.length).setValues([row]);
  styleDataRow_(sheet, rowIndex);
  writeFilesCell_(sheet.getRange(rowIndex, 15), files);
  paintRevisionRow_(sheet, rowIndex, row);
  if (files && files.length > 1) {
    sheet.setRowHeight(rowIndex, Math.min(28 + files.length * 16, 96));
  }
}

function paintRevisionRow_(sheet, rowIndex, row) {
  var history = String((row && row[19]) || "");
  var range = sheet.getRange(rowIndex, 1, 1, HEADERS.length);
  if (history.indexOf("[Open]") >= 0) {
    range.setBackground("#fbe7dc");
    return;
  }
  range.setBackground(rowIndex % 2 === 0 ? CREAM : PAPER);
}

function parseRevisionMessages_(rest, createdAt, number) {
  var messages = [];
  var text = String(rest || "").trim();
  if (!text || text === "(empty)") return messages;
  var parts = text.split(/\s*\|\|?\s*(?=(?:Buyer|Seller)\b)/i);
  var i;
  for (i = 0; i < parts.length; i++) {
    var part = String(parts[i] || "").trim();
    if (!part) continue;
    var cleaned = part.replace(/^(Buyer|Seller)(?:\s*\([^)]*\))?\s*—\s*/i, "");
    var files = [];
    var body = cleaned;
    var fileMatch = cleaned.match(/^(.*?)(?:\s*—\s*Files:\s*|\s+\|\s*Files:\s*)(.*)$/);
    if (fileMatch) {
      body = String(fileMatch[1] || "").replace(/^\(no text\)\s*$/i, "").trim();
      files = parseFiles_(fileMatch[2]);
    } else {
      body = body.replace(/^\(no text\)\s*$/i, "").trim();
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

function parseRevisions_(history, revisionCount, createdAt, latestBuyer, latestSeller) {
  var raw = String(history || "").replace(/\r/g, "").trim();
  var rounds = [];
  if (raw) {
    var lines = raw.split(/\n+/);
    var i;
    for (i = 0; i < lines.length; i++) {
      var match = String(lines[i] || "").match(/^Revision\s+(\d+)\s*\[(Completed|Open)\]\s*:?\s*(.*)$/i);
      if (!match) continue;
      var number = Number(match[1]) || (rounds.length + 1);
      rounds.push({
        id: "rev_sheet_" + number,
        number: number,
        createdAt: createdAt,
        completed: String(match[2] || "").toLowerCase() === "completed",
        messages: parseRevisionMessages_(match[3], createdAt, number)
      });
    }
  }
  var count = Math.max(Number(revisionCount) || 0, rounds.length);
  if (!count && (latestBuyer || latestSeller)) count = 1;
  if (!rounds.length && count > 0) {
    var n;
    for (n = 1; n <= count; n++) {
      var messages = [];
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
    var next = rounds.length + 1;
    rounds.push({
      id: "rev_sheet_" + next,
      number: next,
      createdAt: createdAt,
      completed: false,
      messages: []
    });
  }
  rounds.sort(function (a, b) { return (a.number || 0) - (b.number || 0); });
  var r;
  for (r = 0; r < rounds.length; r++) rounds[r].number = r + 1;
  return rounds;
}

function orderFromRow_(row, tabName, files) {
  var paymentText = String(row[9] || "").toLowerCase();
  var paymentStatus = "";
  if (/unpaid/.test(paymentText)) paymentStatus = "unpaid";
  else if (/paid/.test(paymentText)) paymentStatus = "paid";
  var readyText = String(row[23] || "").toLowerCase();
  var readyToApprove = /ready to approve/.test(readyText) && readyText.indexOf("not ready") === -1;
  var typeText = String(row[11] || "").toLowerCase();
  if (!files) files = parseFiles_(row[14]);
  var history = String(row[19] || "").trim();
  var revisionCount = Number(row[18] || 0) || 0;
  var createdAt = isoFrom_(row[1], row[2]);
  var revisions = parseRevisions_(
    history,
    revisionCount,
    createdAt,
    String(row[21] || "").trim(),
    String(row[22] || "").trim()
  );
  return {
    id: String(row[0] || "").trim(),
    accountName: String(row[5] || tabName || "").trim(),
    tabName: tabName,
    whatsapp: String(row[6] || "").trim(),
    name: String(row[7] || "").trim(),
    orderValue: row[8] === "" || row[8] == null ? "" : row[8],
    paymentStatus: paymentStatus,
    searchKeyword: String(row[10] || "").trim(),
    orderTypeCustom: typeText.indexOf("custom") >= 0 || typeText.indexOf("message") >= 0,
    orderTypeDirect: typeText.indexOf("direct") >= 0,
    messageText: String(row[12] || ""),
    directRequirements: String(row[13] || ""),
    requirementFiles: files,
    fiverrId: String(row[15] || "").trim(),
    fiverrGigUrl: String(row[16] || "").trim(),
    reviewText: String(row[17] || ""),
    revisions: revisions,
    readyToApprove: readyToApprove,
    overallStatus: String(row[24] || "").trim(),
    boardStatus: parseBoardStatus_(row[24]),
    businessName: String(row[25] || "").trim(),
    clientName: String(row[26] || "").trim(),
    createdAt: isoFrom_(row[1], row[2]),
    updatedAt: isoFrom_(row[3], row[4]) || isoFrom_(row[1], row[2])
  };
}

function parseBoardStatus_(value) {
  var raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw === "ready-to-approve" || raw === "ready to approve") return "ready-to-approve";
  if (raw === "completed" || raw === "complete") return "completed";
  if (
    raw === "on-revision" ||
    raw === "on revision" ||
    raw === "revision" ||
    raw === "revision-pending" ||
    raw === "revision pending" ||
    raw === "revision needed"
  ) {
    return "on-revision";
  }
  if (raw === "in-progress" || raw === "in progress" || raw === "waiting") return "in-progress";
  if (/ready to approve/.test(raw)) return "ready-to-approve";
  if (/complete/.test(raw)) return "completed";
  if (/revision/.test(raw)) return "on-revision";
  if (/progress/.test(raw)) return "in-progress";
  return "";
}

function cellKey_(value) {
  return String(value == null ? "" : value).replace(/\s+/g, " ").trim().toLowerCase();
}

function recordFingerprint_(row, tabName) {
  return [
    cellKey_(tabName || row[5]),
    String(row[6] == null ? "" : row[6]).replace(/\D+/g, ""),
    cellKey_(row[7]),
    cellKey_(row[8]),
    cellKey_(row[9]),
    cellKey_(row[10]),
    cellKey_(row[11]),
    cellKey_(row[12]),
    cellKey_(row[13]),
    cellKey_(row[15]),
    cellKey_(row[16]),
    cellKey_(row[17])
  ].join("\u0001");
}

function fingerprintHasFields_(fingerprint) {
  var parts = String(fingerprint || "").split("\u0001");
  var meaningful = [1, 2, 3, 5, 7, 8, 9, 10, 11];
  var i;
  for (i = 0; i < meaningful.length; i++) {
    var part = parts[meaningful[i]] || "";
    if (part && part !== "—" && part !== "-") return true;
  }
  return false;
}

function findDuplicateRecord_(ss, row, tabName, excludeOrderId) {
  var wanted = recordFingerprint_(row, tabName);
  if (!fingerprintHasFields_(wanted)) return null;
  var exclude = String(excludeOrderId || "").trim();
  var sheets = ss.getSheets();
  for (var s = 0; s < sheets.length; s++) {
    var sheet = sheets[s];
    var name = sheet.getName();
    if (name === "Users") continue;
    if (tabName && !sheetMatchesAccount_(name, tabName)) continue;
    if (String(sheet.getRange(1, 1).getValue() || "").trim() !== "Order ID") continue;
    var last = sheet.getLastRow();
    if (last < 2) continue;
    var cols = Math.max(sheet.getLastColumn(), HEADERS.length);
    var values = sheet.getRange(2, 1, last - 1, cols).getValues();
    for (var r = 0; r < values.length; r++) {
      var existing = values[r];
      while (existing.length < HEADERS.length) existing.push("");
      var id = String(existing[0] || "").trim();
      if (!id || (exclude && id === exclude)) continue;
      if (recordFingerprint_(existing, name) === wanted) {
        return { sheet: sheet, row: r + 2, orderId: id };
      }
    }
  }
  return null;
}

function upsertOrder_(ss, data) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return upsertOrderLocked_(ss, data);
  } finally {
    try { lock.releaseLock(); } catch (err) {}
  }
}

function upsertOrderLocked_(ss, data) {
  var row = data.row || [];
  var orderId = String(data.orderId || row[0] || "");
  var forced = forcedAccount_(data);
  var wantedName = tabName_(data.tabName || data.accountName || "");
  var target = null;
  if (forced) {
    target = sheetForAccount_(ss, forced);
    if (!target) target = getOrCreateSheet_(ss, forced);
  } else {
    target = wantedName ? getOrCreateSheet_(ss, wantedName) : ss.getSheets()[0];
  }
  ensureOrderSheet_(ss, target);

  var found = findOrderOnSheet_(target, orderId);
  if (!found) found = findOrder_(ss, orderId);
  if (found && forced && !canAccessFound_(found, forced)) {
    return { ok: false, error: "You can only edit orders for " + forced + "." };
  }

  while (row.length < HEADERS.length) {
    row.push("");
  }
  row = row.slice(0, HEADERS.length);
  if (forced) {
    row[5] = target.getName();
  }
  if ("businessName" in data) {
    row[25] = String(data.businessName || "").trim();
  }
  if ("clientName" in data) {
    row[26] = String(data.clientName || "").trim();
  }

  var existingRich = null;
  var existingText = "";
  if (found) {
    existingRich = found.sheet.getRange(found.row, 15).getRichTextValue();
    existingText = found.sheet.getRange(found.row, 15).getDisplayValue();
  }
  var savedUploads = saveUploads_(orderId, data.uploads || data.files || []);
  var files = mergeRequirementFiles_(existingRich, existingText, row[14], savedUploads.slice());
  row[12] = applySavedUrlsToText_(row[12], savedUploads);
  row[19] = applySavedUrlsToText_(row[19], savedUploads);
  row[14] = (files || []).map(function (file) {
    return file.url ? file.name + " | " + file.url : file.name;
  }).join("\n");

  if (found) {
    if (found.sheet.getSheetId() === target.getSheetId()) {
      writeOrderRow_(target, found.row, row, files);
      return { ok: true, updated: true, orderId: orderId, tab: target.getName() };
    }
    target.appendRow(row);
    writeOrderRow_(target, target.getLastRow(), row, files);
    found.sheet.deleteRow(found.row);
    return { ok: true, moved: true, orderId: orderId, tab: target.getName() };
  }

  var duplicate = findDuplicateRecord_(ss, row, target.getName(), orderId);
  if (duplicate) {
    return {
      ok: true,
      duplicate: true,
      created: false,
      orderId: orderId,
      existingOrderId: duplicate.orderId,
      tab: duplicate.sheet.getName()
    };
  }

  target.appendRow(row);
  writeOrderRow_(target, target.getLastRow(), row, files);
  return { ok: true, created: true, orderId: orderId, tab: target.getName() };
}

function deleteOrder_(ss, data) {
  var orderId = String((data && (data.orderId || data.id)) || "").trim();
  if (!orderId) {
    return { ok: false, error: "Order ID is required." };
  }
  var found = findOrder_(ss, orderId);
  if (!found) {
    return { ok: true, action: "deleteOrder", orderId: orderId, missing: true };
  }
  var forced = forcedAccount_(data);
  if (forced && !canAccessFound_(found, forced)) {
    return { ok: false, error: "You can only delete orders for " + forced + "." };
  }
  found.sheet.deleteRow(found.row);
  return { ok: true, action: "deleteOrder", orderId: orderId, tab: found.sheet.getName() };
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
      if (String(ids[i][0] || "").trim() === orderId) {
        return { sheet: sheet, row: i + 2 };
      }
    }
  }
  return null;
}

function findOrderOnSheet_(sheet, orderId) {
  if (!sheet || !orderId) return null;
  var last = sheet.getLastRow();
  if (last < 2) return null;
  var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  var i;
  for (i = 0; i < ids.length; i++) {
    if (String(ids[i][0] || "").trim() === orderId) {
      return { sheet: sheet, row: i + 2 };
    }
  }
  return null;
}

function hasOrder_(params) {
  var orderId = String((params && params.orderId) || "").trim();
  if (!orderId) {
    return { ok: false, action: "hasOrder", found: false, error: "Order ID is required." };
  }
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var tab = tabName_((params && (params.tab || params.userAccount || params.account)) || "");
  var found = null;
  if (tab) {
    var sheet = sheetForAccount_(ss, tab);
    if (sheet) found = findOrderOnSheet_(sheet, orderId);
  } else {
    found = findOrder_(ss, orderId);
  }
  return {
    ok: true,
    action: "hasOrder",
    found: Boolean(found),
    orderId: orderId,
    tab: found ? found.sheet.getName() : tab
  };
}

function getOrder_(params) {
  var orderId = String((params && params.orderId) || "").trim();
  if (!orderId) {
    return { ok: false, action: "getOrder", found: false, error: "Order ID is required." };
  }
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var tab = tabName_((params && (params.tab || params.userAccount || params.account)) || "");
  var found = null;
  if (tab) {
    var sheet = sheetForAccount_(ss, tab);
    if (sheet) found = findOrderOnSheet_(sheet, orderId);
  } else {
    found = findOrder_(ss, orderId);
  }
  if (!found) {
    return { ok: true, action: "getOrder", found: false, orderId: orderId, order: null };
  }
  var cols = Math.max(found.sheet.getLastColumn(), HEADERS.length);
  var row = found.sheet.getRange(found.row, 1, 1, cols).getValues()[0];
  while (row.length < HEADERS.length) row.push("");
  var rich = null;
  try {
    rich = found.sheet.getRange(found.row, 15).getRichTextValue();
  } catch (err) {
    rich = null;
  }
  return {
    ok: true,
    action: "getOrder",
    found: true,
    orderId: orderId,
    tab: found.sheet.getName(),
    order: orderFromRow_(row, found.sheet.getName(), filesFromCell_(rich, row[14]))
  };
}

function ensureOrderSheet_(ss, sheet) {
  if (!sheet) return;
  var first = String(sheet.getRange(1, 1).getValue() || "").trim();
  if (first === "Order ID") return;
  styleSheet_(ss, sheet);
}

function accountKey_(raw) {
  return tabName_(raw).toLowerCase();
}

function sheetMatchesAccount_(sheetName, account) {
  var forced = accountKey_(account);
  var name = accountKey_(sheetName);
  if (!forced || !name) return false;
  if (name === forced) return true;
  return name.indexOf(forced + " ") === 0;
}

function rowBelongsToAccount_(row, tabName, account) {
  var forced = accountKey_(account);
  if (!forced) return true;
  if (sheetMatchesAccount_(tabName, account)) return true;
  var cell = accountKey_(row[5]);
  if (cell === forced || cell.indexOf(forced + " ") === 0) return true;
  return false;
}

function sheetForAccount_(ss, account) {
  var sheets = ss.getSheets();
  var exact = null;
  var prefix = null;
  for (var i = 0; i < sheets.length; i++) {
    var name = sheets[i].getName();
    if (name === "Users") continue;
    if (accountKey_(name) === accountKey_(account)) {
      exact = sheets[i];
      break;
    }
    if (!prefix && sheetMatchesAccount_(name, account)) prefix = sheets[i];
  }
  return exact || prefix;
}

function canAccessFound_(found, forced) {
  if (!forced || !found) return true;
  if (sheetMatchesAccount_(found.sheet.getName(), forced)) return true;
  var cell = "";
  try {
    cell = String(found.sheet.getRange(found.row, 6).getDisplayValue() || "");
  } catch (err) {}
  var key = accountKey_(forced);
  var cellKey = accountKey_(cell);
  return cellKey === key || cellKey.indexOf(key + " ") === 0;
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
    "Uploaded requirement files. Click a file name to download it.",
    "Fiverr username.",
    "Link to the Fiverr gig.",
    "Review or feedback text.",
    "How many revision rounds exist.",
    "Full revision conversation history.",
    "The revision currently in play.",
    "Most recent buyer comment.",
    "Most recent seller reply.",
    "Ready to Approve or Not Ready. Dropdown in each cell.",
    "Overall workflow status. Use In Progress, On Revision, or Completed to match the portal tabs.",
    "Business name entered by hand in the portal.",
    "Client name entered by hand in the portal."
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
  rules.push(chip(25, "Completed", SAGE, SAGE_TEXT));
  rules.push(chip(25, "On Revision", ROSE, ROSE_TEXT));
  rules.push(chip(25, "Complete", SAGE, SAGE_TEXT));
  rules.push(chip(25, "Ready to Approve", GOLD, GOLD_TEXT));
  rules.push(chip(25, "In Progress", SKY, SKY_TEXT));
  rules.push(chip(25, "Waiting", GOLD, GOLD_TEXT));
  rules.push(chip(25, "Revision Pending", GOLD, GOLD_TEXT));
  rules.push(chip(25, "Revision Needed", ROSE, ROSE_TEXT));
  rules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied('=ISNUMBER(SEARCH("[Open]",$T2))')
      .setBackground("#fbe7dc")
      .setRanges([sheet.getRange(2, 1, dataRows, HEADERS.length)])
      .build()
  );

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
      ["In Progress", "On Revision", "Ready to Approve", "Completed", "Revision Pending", "Waiting", "Revision Needed", "Complete"],
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

function upsertUser_(data) {
  setupUsersSheetIfNeeded_();
  var username = String((data && data.username) || "").trim();
  var password = String((data && data.password) || "");
  var account = tabName_((data && (data.account || data.userAccount)) || "");
  var displayName = String((data && (data.displayName || data.name)) || username).trim();
  var active = (data && (data.active === false || data.active === "No" || data.active === "no")) ? "No" : "Yes";
  if (!username) {
    return { ok: false, error: "Username is required." };
  }
  if (!account) {
    return { ok: false, error: "Account is required for a user login." };
  }
  var ss = SpreadsheetApp.openById(USERS_SPREADSHEET_ID);
  var sheet = ss.getSheets()[0];
  var last = Math.max(sheet.getLastRow(), 1);
  var found = 0;
  if (last >= 2) {
    var names = sheet.getRange(2, 1, last - 1, 1).getValues();
    var wanted = username.toLowerCase();
    for (var i = 0; i < names.length; i++) {
      if (String(names[i][0] || "").trim().toLowerCase() === wanted) {
        found = i + 2;
        break;
      }
    }
  }
  if (!found && !password) {
    return { ok: false, error: "Password is required for a new user." };
  }
  if (found) {
    var existing = sheet.getRange(found, 1, 1, USER_HEADERS.length).getValues()[0];
    sheet.getRange(found, 1, 1, USER_HEADERS.length).setValues([[
      username,
      password ? password : existing[1],
      "user",
      account,
      displayName || existing[4] || username,
      active
    ]]);
    return { ok: true, action: "upsertUser", username: username, account: account, updated: true };
  }
  sheet.getRange(last + 1, 1, 1, USER_HEADERS.length).setValues([[
    username,
    password,
    "user",
    account,
    displayName || username,
    active
  ]]);
  return { ok: true, action: "upsertUser", username: username, account: account, created: true };
}
