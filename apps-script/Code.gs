var SPREADSHEET_ID = "1nZuMePQFJA9lCQ6C48d9MUC3Fwn00ao6Kilap5rbFfQ";
var USERS_SPREADSHEET_ID = "1WMIorEpqZk20VuzJ3NaB2x66xHlLh_6dh84h-yTW0Zc";
var ACCOUNTS_SPREADSHEET_ID = "19hiEAgjNTcfDwEU1NsKJ2as90thmaIMzAXpHBWXKRrc";
var USER_HEADERS = [
  "Username",
  "Password",
  "Role",
  "Account",
  "Display Name",
  "Active",
  "WhatsApp Number",
  "Fiverr ID Name",
  "Fiverr GIG URL",
  "Payment Status"
];
var PROFILE_HEADERS = [
  "Username",
  "Account",
  "WhatsApp Number",
  "Your Name",
  "Fiverr ID Name",
  "Fiverr GIG URL",
  "Payment Status"
];
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
  "Client Name",
  "Place On",
  "Placement Status",
  "Scheduled By",
  "Schedule Updated At",
  "Placed At"
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
var COL_WIDTHS = [118, 122, 108, 140, 128, 150, 150, 150, 108, 132, 140, 150, 240, 220, 220, 140, 200, 200, 92, 260, 140, 220, 220, 168, 168, 160, 160, 132, 140, 140, 168, 150];
var FILES_FOLDER_ID = "1feJrckxiyjHzCe9Rz_w-L879BWjpExdB";
var TAB_COLORS = ["#9baa86", "#c4a574", "#4e91b1", "#e98a5f", "#708b55", "#8b6b4a"];
var FORMAT_ROWS = 300;

function doGet(e) {
  var params = (e && e.parameter) || {};
  var action = String(params.action || "");
  if (action === "login") {
    return json_(login_(params.username, params.password));
  }
  if (action === "getUserProfile") {
    return json_(getUserProfile_(params));
  }
  if (action === "listAccounts") {
    return json_(listAccountProfiles_(params));
  }
  if (action === "getAccountProfile") {
    return json_(getAccountProfile_(params));
  }
  if (action === "setupAccounts") {
    return json_(setupAccountProfiles_());
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
  if (action === "nextOrderId") {
    return json_(nextOrderId_(params));
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
  if (action === "updateOrderNames") {
    return json_(updateOrderNames_(SpreadsheetApp.openById(SPREADSHEET_ID), params));
  }
  if (action === "updateOrderStatus") {
    return json_(updateOrderStatus_(SpreadsheetApp.openById(SPREADSHEET_ID), params));
  }
  if (action === "updateOrderSchedule") {
    return json_(updateOrderSchedule_(SpreadsheetApp.openById(SPREADSHEET_ID), params));
  }
  if (action === "ensureScheduleColumns") {
    return json_(ensureAllScheduleColumns_(SpreadsheetApp.openById(SPREADSHEET_ID)));
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
    if (data.action === "upsertAccountProfile") {
      if (isRestrictedUser_(data)) {
        return json_({ ok: false, error: "Only Super Admin can edit account profiles." });
      }
      return json_(upsertAccountProfile_(data));
    }
    if (data.action === "setupAccounts") {
      if (isRestrictedUser_(data)) {
        return json_({ ok: false, error: "Only Super Admin can set up account tabs." });
      }
      return json_(setupAccountProfiles_());
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
    if (data.action === "updateOrderNames") {
      return json_(updateOrderNames_(ss, data));
    }
    if (data.action === "updateOrderSchedule") {
      return json_(updateOrderSchedule_(ss, data));
    }
    if (data.action === "ensureScheduleColumns") {
      return json_(ensureAllScheduleColumns_(ss));
    }
    if (data.action === "updateOrderStatus") {
      return json_(updateOrderStatus_(ss, data));
    }

    return json_(upsertOrder_(ss, data));
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function installScheduleColumns() {
  return ensureAllScheduleColumns_(SpreadsheetApp.openById(SPREADSHEET_ID));
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
    ensureScheduleColumns_(sheet);
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
  return { ok: true, action: "listOrders", count: orders.length, orders: orders, sheetColumns: HEADERS.length };
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

function readUpload_(id) {
  if (!id) return null;
  try {
    var raw = PropertiesService.getScriptProperties().getProperty(uploadKey_(id)) || "";
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
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
  var existing = readUpload_(uploadId);
  if (existing && existing.status === "ok" && existing.url) {
    existing.ok = true;
    existing.action = "uploadFile";
    existing.uploadId = uploadId;
    return existing;
  }
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

function findDriveFileByName_(folder, driveName) {
  if (!folder || !driveName) return null;
  try {
    var files = folder.getFilesByName(driveName);
    if (files.hasNext()) return files.next();
  } catch (err) {}
  return null;
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
      var existingFile = findDriveFileByName_(folder, driveName);
      if (existingFile) {
        sharePublic_(existingFile);
        clearDriveError_();
        saved.push(savedFileInfo_(originalName, existingFile));
        continue;
      }
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
  try { styleDataRow_(sheet, rowIndex); } catch (err) {}
  try { writeFilesCell_(sheet.getRange(rowIndex, 15), files); } catch (err2) {}
  try { paintRevisionRow_(sheet, rowIndex, row); } catch (err3) {}
  try { fitOrderRowHeight_(sheet, rowIndex, files); } catch (err4) {}
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
    var fileMatch = cleaned.match(/^([\s\S]*?)(?:\s*—\s*Files:\s*|\s+\|\s*Files:\s*)([\s\S]*)$/);
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
    var re = /^Revision\s+(\d+)\s*\[(Completed|Open)\]\s*:?\s*/gim;
    var matches = [];
    var m;
    while ((m = re.exec(raw)) !== null) {
      matches.push({
        index: m.index,
        end: m.index + m[0].length,
        number: Number(m[1]) || 0,
        status: m[2]
      });
    }
    var i;
    for (i = 0; i < matches.length; i++) {
      var number = matches[i].number || (rounds.length + 1);
      var restEnd = i + 1 < matches.length ? matches[i + 1].index : raw.length;
      var rest = String(raw.slice(matches[i].end, restEnd) || "").trim();
      rounds.push({
        id: "rev_sheet_" + number,
        number: number,
        createdAt: createdAt,
        completed: String(matches[i].status || "").toLowerCase() === "completed",
        messages: parseRevisionMessages_(rest, createdAt, number)
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
    placeOn: String(row[27] || "").trim(),
    placementStatus: String(row[28] || "").trim(),
    scheduledBy: String(row[29] || "").trim(),
    scheduleUpdatedAt: String(row[30] || "").trim(),
    placedAt: String(row[31] || "").trim(),
    placementHold: /on hold/i.test(String(row[28] || "")),
    placementPlaced: /^placed$/i.test(String(row[28] || "").trim()),
    createdAt: isoFrom_(row[1], row[2]),
    updatedAt: isoFrom_(row[3], row[4]) || isoFrom_(row[1], row[2])
  };
}

function rowUpdatedAt_(row) {
  if (!row) return 0;
  var dateVal = row[3];
  var timeVal = row[4];
  if (dateVal instanceof Date && !isNaN(dateVal.getTime()) && timeVal instanceof Date && !isNaN(timeVal.getTime())) {
    return new Date(
      dateVal.getFullYear(),
      dateVal.getMonth(),
      dateVal.getDate(),
      timeVal.getHours(),
      timeVal.getMinutes(),
      timeVal.getSeconds()
    ).getTime();
  }
  if (dateVal instanceof Date && !isNaN(dateVal.getTime())) return dateVal.getTime();
  var combined = String(dateVal || "").trim() + " " + String(timeVal || "").trim();
  var parsed = Date.parse(combined);
  return isNaN(parsed) ? 0 : parsed;
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
  if (
    raw === "orders-placed" ||
    raw === "orders placed" ||
    raw === "order placed" ||
    raw === "placed"
  ) {
    return "orders-placed";
  }
  if (
    raw === "in-progress" ||
    raw === "in progress" ||
    raw === "waiting" ||
    raw === "new order has to be placed"
  ) {
    return "in-progress";
  }
  if (/ready\s*to\s*approve/.test(raw)) return "ready-to-approve";
  if (/^completed$|^complete$/.test(raw)) return "completed";
  if (/on\s*revision|revision\s*pending|revision\s*needed/.test(raw)) return "on-revision";
  if (/orders\s*placed|^placed$/.test(raw)) return "orders-placed";
  if (/in\s*progress|new order/.test(raw)) return "in-progress";
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

function padOrderId_(n) {
  var s = String(n || 0);
  while (s.length < 3) s = "0" + s;
  return "ORD-" + s;
}

function orderIdNumber_(value) {
  var match = String(value || "").match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function nextGlobalOrderId_(ss) {
  var max = 0;
  var sheets = ss.getSheets();
  var s;
  for (s = 0; s < sheets.length; s++) {
    var sheet = sheets[s];
    var name = sheet.getName();
    if (name === "Users") continue;
    if (String(sheet.getRange(1, 1).getValue() || "").trim() !== "Order ID") continue;
    var last = sheet.getLastRow();
    if (last < 2) continue;
    var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
    var i;
    for (i = 0; i < ids.length; i++) {
      var n = orderIdNumber_(ids[i][0]);
      if (n > max) max = n;
    }
  }
  return padOrderId_(max + 1);
}

function nextOrderId_(params) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  return {
    ok: true,
    action: "nextOrderId",
    orderId: nextGlobalOrderId_(ss)
  };
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
    found = null;
    orderId = "";
  }

  var existingRow = null;
  if (found) {
    existingRow = found.sheet.getRange(found.row, 1, 1, HEADERS.length).getValues()[0];
    while (existingRow.length < HEADERS.length) existingRow.push("");
  }

  while (row.length < HEADERS.length) {
    row.push("");
  }
  row = row.slice(0, HEADERS.length);
  if (!orderId) orderId = nextGlobalOrderId_(ss);
  row[0] = orderId;
  if (forced) {
    row[5] = target.getName();
  }
  if ("businessName" in data) {
    row[25] = String(data.businessName || "").trim();
  }
  if ("clientName" in data) {
    row[26] = String(data.clientName || "").trim();
  }
  if (existingRow) {
    if (!String(row[25] || "").trim()) row[25] = String(existingRow[25] || "").trim();
    if (!String(row[26] || "").trim()) row[26] = String(existingRow[26] || "").trim();
    if (!String(row[30] || "").trim() && (String(existingRow[27] || "").trim() || String(existingRow[28] || "").trim() || String(existingRow[29] || "").trim() || String(existingRow[31] || "").trim())) {
      row[27] = existingRow[27];
      row[28] = existingRow[28];
      row[29] = existingRow[29];
      row[30] = existingRow[30];
      row[31] = existingRow[31];
    }
    if (!String(row[24] || "").trim()) {
      row[23] = existingRow[23];
      row[24] = existingRow[24];
    } else {
      var incomingTs = rowUpdatedAt_(row);
      var existingTs = rowUpdatedAt_(existingRow);
      if (existingTs && incomingTs && incomingTs < existingTs) {
        row[23] = existingRow[23];
        row[24] = existingRow[24];
      }
    }
  }
  var hasSchedule = ("placeOn" in data) || ("placeon" in data) || ("placementStatus" in data) || ("placementstatus" in data) || ("placedAt" in data) || ("placedat" in data);
  if (hasSchedule) {
    var placeOn = data.placeOn != null ? data.placeOn : data.placeon;
    var placementStatus = data.placementStatus != null ? data.placementStatus : data.placementstatus;
    var scheduledBy = data.scheduledBy != null ? data.scheduledBy : data.scheduledby;
    var scheduleUpdatedAt = data.scheduleUpdatedAt != null ? data.scheduleUpdatedAt : data.scheduleupdatedat;
    var placedAt = data.placedAt != null ? data.placedAt : data.placedat;
    if (placeOn != null) row[27] = placeOnCellValue_(placeOn);
    if (placementStatus != null) row[28] = String(placementStatus);
    if (scheduledBy != null) row[29] = String(scheduledBy);
    if (scheduleUpdatedAt != null) row[30] = String(scheduleUpdatedAt);
    if (placedAt != null) row[31] = String(placedAt);
  } else {
    row[27] = placeOnCellValue_(row[27]);
  }
  ensureNameColumns_(target);

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

function orderLookup_(params) {
  var orderId = String((params && params.orderId) || "").trim();
  var role = String((params && params.role) || "").toLowerCase().replace(/\s+/g, "");
  var forced = (role === "user" || role === "account")
    ? tabName_((params && (params.userAccount || params.account)) || "")
    : "";
  var tab = tabName_((params && params.tab) || "") || forced;
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var found = null;
  if (tab) {
    var sheet = sheetForAccount_(ss, tab);
    if (sheet) found = findOrderOnSheet_(sheet, orderId);
  }
  if (!found) found = findOrder_(ss, orderId);
  if (found && forced && !canAccessFound_(found, forced)) {
    return { orderId: orderId, found: null, denied: true, forced: forced, tab: tab };
  }
  return { orderId: orderId, found: found, denied: false, forced: forced, tab: tab };
}

function hasOrder_(params) {
  var orderId = String((params && params.orderId) || "").trim();
  if (!orderId) {
    return { ok: false, action: "hasOrder", found: false, error: "Order ID is required." };
  }
  var lookup = orderLookup_(params);
  if (lookup.denied) {
    return { ok: false, action: "hasOrder", found: false, orderId: orderId, error: "You can only open orders for " + lookup.forced + "." };
  }
  return {
    ok: true,
    action: "hasOrder",
    found: Boolean(lookup.found),
    orderId: orderId,
    tab: lookup.found ? lookup.found.sheet.getName() : lookup.tab
  };
}

function getOrder_(params) {
  var orderId = String((params && params.orderId) || "").trim();
  if (!orderId) {
    return { ok: false, action: "getOrder", found: false, error: "Order ID is required." };
  }
  var lookup = orderLookup_(params);
  if (lookup.denied) {
    return { ok: false, action: "getOrder", found: false, orderId: orderId, order: null, error: "You can only open orders for " + lookup.forced + "." };
  }
  var found = lookup.found;
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

function placeOnCellValue_(raw) {
  if (raw instanceof Date && !isNaN(raw.getTime())) return raw;
  var text = String(raw || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    var parts = text.slice(0, 10).split("-");
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }
  return text;
}

function ensureAllScheduleColumns_(ss) {
  if (!ss) ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheets = ss.getSheets();
  var tabs = [];
  var i;
  for (i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    if (sheet.getName() === "Users") continue;
    if (String(sheet.getRange(1, 1).getValue() || "").trim() !== "Order ID") continue;
    ensureScheduleColumns_(sheet);
    tabs.push(sheet.getName());
  }
  return { ok: true, action: "ensureScheduleColumns", sheetColumns: HEADERS.length, tabs: tabs };
}

function ensureNameColumns_(sheet) {
  if (!sheet) return;
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var bizHeader = lastCol >= 26 ? String(sheet.getRange(1, 26).getValue() || "").trim() : "";
  var clientHeader = lastCol >= 27 ? String(sheet.getRange(1, 27).getValue() || "").trim() : "";
  if (bizHeader !== "Business Name") sheet.getRange(1, 26).setValue("Business Name");
  if (clientHeader !== "Client Name") sheet.getRange(1, 27).setValue("Client Name");
  ensureScheduleColumns_(sheet);
}

function ensureScheduleColumns_(sheet) {
  if (!sheet) return;
  try {
    sheet.getRange(1, 28, 1, HEADERS.length).setValues([HEADERS.slice(27)]);
  } catch (err) {}
  var widths = [132, 140, 140, 168, 150];
  var i;
  for (i = 0; i < widths.length; i++) {
    try { sheet.setColumnWidth(28 + i, widths[i]); } catch (err2) {}
  }
}

function updateOrderSchedule_(ss, data) {
  var orderId = String((data && (data.orderId || data.orderid)) || "").trim();
  if (!orderId) {
    return { ok: false, action: "updateOrderSchedule", error: "Order ID is required." };
  }
  var forced = forcedAccount_(data);
  var wantedName = tabName_(data.tabName || data.tab || data.accountName || "");
  var found = null;
  if (wantedName) {
    var sheet = sheetForAccount_(ss, wantedName);
    if (sheet) found = findOrderOnSheet_(sheet, orderId);
  }
  if (!found) found = findOrder_(ss, orderId);
  if (!found) {
    return { ok: false, action: "updateOrderSchedule", found: false, error: "Order " + orderId + " was not found on the Google Sheet." };
  }
  if (forced && !canAccessFound_(found, forced)) {
    return { ok: false, action: "updateOrderSchedule", error: "You can only edit orders for " + forced + "." };
  }
  ensureScheduleColumns_(found.sheet);
  var placementStatus = String((data.placementStatus != null ? data.placementStatus : data.placementstatus) || "Unscheduled");
  found.sheet.getRange(found.row, 28).setValue(placeOnCellValue_((data.placeOn != null ? data.placeOn : data.placeon) || ""));
  found.sheet.getRange(found.row, 29).setValue(placementStatus);
  found.sheet.getRange(found.row, 30).setValue(String((data.scheduledBy != null ? data.scheduledBy : data.scheduledby) || ""));
  found.sheet.getRange(found.row, 31).setValue(String((data.scheduleUpdatedAt != null ? data.scheduleUpdatedAt : data.scheduleupdatedat) || ""));
  found.sheet.getRange(found.row, 32).setValue(String((data.placedAt != null ? data.placedAt : data.placedat) || ""));
  var boardTab = parseBoardStatus_(data.boardStatus || data.status || "");
  if (!boardTab && /^placed$/i.test(placementStatus)) boardTab = "orders-placed";
  if (boardTab) {
    var statusLabel = String((data.statusLabel != null ? data.statusLabel : data.statuslabel) || "").trim();
    if (!statusLabel) {
      statusLabel = boardTab === "completed" ? "Completed"
        : boardTab === "ready-to-approve" ? "Ready to Approve"
        : boardTab === "on-revision" ? "On Revision"
        : boardTab === "orders-placed" ? "Orders Placed"
        : "In Progress";
    }
    var ready = (boardTab === "completed" || boardTab === "ready-to-approve") ? "Ready to Approve" : "Not Ready";
    found.sheet.getRange(found.row, 24).setValue(ready);
    found.sheet.getRange(found.row, 25).setValue(statusLabel);
  }
  found.sheet.getRange(found.row, 4).setValue(new Date());
  found.sheet.getRange(found.row, 5).setValue(new Date());
  return {
    ok: true,
    action: "updateOrderSchedule",
    updated: true,
    orderId: orderId,
    tab: found.sheet.getName()
  };
}

function updateOrderNames_(ss, data) {
  var orderId = String((data && (data.orderId || data.orderid)) || "").trim();
  if (!orderId) {
    return { ok: false, action: "updateOrderNames", error: "Order ID is required." };
  }
  var forced = forcedAccount_(data);
  var wantedName = tabName_(data.tabName || data.tab || data.accountName || "");
  var found = null;
  if (wantedName) {
    var sheet = sheetForAccount_(ss, wantedName);
    if (sheet) found = findOrderOnSheet_(sheet, orderId);
  }
  if (!found) found = findOrder_(ss, orderId);
  if (!found) {
    return { ok: false, action: "updateOrderNames", found: false, error: "Order " + orderId + " was not found on the Google Sheet." };
  }
  if (forced && !canAccessFound_(found, forced)) {
    return { ok: false, action: "updateOrderNames", error: "You can only edit orders for " + forced + "." };
  }
  ensureNameColumns_(found.sheet);
  var biz = String((data.businessName != null ? data.businessName : data.businessname) || "").trim();
  var client = String((data.clientName != null ? data.clientName : data.clientname) || "").trim();
  found.sheet.getRange(found.row, 26).setValue(biz);
  found.sheet.getRange(found.row, 27).setValue(client);
  return {
    ok: true,
    action: "updateOrderNames",
    updated: true,
    orderId: orderId,
    tab: found.sheet.getName(),
    businessName: biz,
    clientName: client
  };
}

function updateOrderStatus_(ss, data) {
  var orderId = String((data && (data.orderId || data.orderid)) || "").trim();
  if (!orderId) {
    return { ok: false, action: "updateOrderStatus", error: "Order ID is required." };
  }
  var forced = forcedAccount_(data);
  var wantedName = tabName_(data.tabName || data.tab || data.accountName || "");
  var found = null;
  if (wantedName) {
    var sheet = sheetForAccount_(ss, wantedName);
    if (sheet) found = findOrderOnSheet_(sheet, orderId);
  }
  if (!found) found = findOrder_(ss, orderId);
  if (!found) {
    return { ok: false, action: "updateOrderStatus", found: false, error: "Order " + orderId + " was not found on the Google Sheet." };
  }
  if (forced && !canAccessFound_(found, forced)) {
    return { ok: false, action: "updateOrderStatus", error: "You can only edit orders for " + forced + "." };
  }
  var tab = parseBoardStatus_(data.status || data.statusLabel || data.overallStatus || data.boardStatus) || "in-progress";
  var label = String((data.statusLabel != null ? data.statusLabel : data.statuslabel) || "").trim();
  if (!label) {
    label = tab === "completed" ? "Completed"
      : tab === "ready-to-approve" ? "Ready to Approve"
      : tab === "on-revision" ? "On Revision"
      : tab === "orders-placed" ? "Orders Placed"
      : "In Progress";
  }
  var ready = (tab === "completed" || tab === "ready-to-approve") ? "Ready to Approve" : "Not Ready";
  var now = new Date();
  ensureScheduleColumns_(found.sheet);
  found.sheet.getRange(found.row, 4).setValue(now);
  found.sheet.getRange(found.row, 5).setValue(now);
  found.sheet.getRange(found.row, 24).setValue(ready);
  found.sheet.getRange(found.row, 25).setValue(label);
  if ("placeOn" in data || "placeon" in data || "placementStatus" in data || "placementstatus" in data) {
    found.sheet.getRange(found.row, 28).setValue(placeOnCellValue_((data.placeOn != null ? data.placeOn : data.placeon) || ""));
    found.sheet.getRange(found.row, 29).setValue(String((data.placementStatus != null ? data.placementStatus : data.placementstatus) || ""));
    found.sheet.getRange(found.row, 30).setValue(String((data.scheduledBy != null ? data.scheduledBy : data.scheduledby) || ""));
    found.sheet.getRange(found.row, 31).setValue(String((data.scheduleUpdatedAt != null ? data.scheduleUpdatedAt : data.scheduleupdatedat) || ""));
    found.sheet.getRange(found.row, 32).setValue(String((data.placedAt != null ? data.placedAt : data.placedat) || ""));
  }
  return {
    ok: true,
    action: "updateOrderStatus",
    updated: true,
    orderId: orderId,
    tab: found.sheet.getName(),
    status: tab,
    statusLabel: label,
    readyToApprove: ready
  };
}

function ensureOrderSheet_(ss, sheet) {
  if (!sheet) return;
  var first = String(sheet.getRange(1, 1).getValue() || "").trim();
  if (first === "Order ID") {
    ensureNameColumns_(sheet);
    return;
  }
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
    "Overall workflow status. Use In Progress, Orders Placed, On Revision, Ready to Approve, or Completed to match the portal tabs.",
    "Business name entered by hand in the portal.",
    "Client name entered by hand in the portal.",
    "Manually chosen date to place this order.",
    "Unscheduled, Place Today, Scheduled, Later, On Hold, or Placed.",
    "Who last set the schedule.",
    "When the schedule was last saved.",
    "When the order was marked Placed."
  ]]);

  var dataRows = Math.max(lastRow - 1, FORMAT_ROWS - 1);
  var body = sheet.getRange(2, 1, dataRows, cols);
  body.setFontFamily("Google Sans");
  body.setFontSize(10);
  body.setFontColor(INK);
  body.setVerticalAlignment("middle");
  body.setWrap(true);

  var longCols = [13, 14, 18, 20, 21, 22, 23];
  var lc;
  for (lc = 0; lc < longCols.length; lc++) {
    try {
      sheet.getRange(2, longCols[lc], dataRows, 1).setWrap(true).setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
    } catch (errW) {
      sheet.getRange(2, longCols[lc], dataRows, 1).setWrap(true);
    }
  }

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
  if (sheet.getLastRow() >= 2) {
    try { sheet.autoResizeRows(2, sheet.getLastRow()); } catch (errH) {}
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
  wrapLongTextCells_(sheet, row);
}

function wrapLongTextCells_(sheet, row) {
  var cols = [13, 14, 18, 20, 21, 22, 23];
  var i;
  for (i = 0; i < cols.length; i++) {
    try {
      sheet.getRange(row, cols[i]).setWrap(true).setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
    } catch (err) {
      sheet.getRange(row, cols[i]).setWrap(true);
    }
  }
}

function fitOrderRowHeight_(sheet, rowIndex, files) {
  try {
    sheet.autoResizeRows(rowIndex, rowIndex);
  } catch (err) {}
  var height = 32;
  try {
    height = sheet.getRowHeight(rowIndex);
  } catch (err2) {}
  if (height < 32) height = 32;
  if (files && files.length > 1) {
    var fileH = Math.min(28 + files.length * 16, 96);
    if (fileH > height) height = fileH;
  }
  if (height > 409) height = 409;
  sheet.setRowHeight(rowIndex, height);
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
      ["superadmin", "ChangeMeAdmin", "superadmin", "", "Super Admin", "Yes", "", "", "", ""],
      ["block", "ChangeMeBlock", "user", "Block", "Block", "Yes", "", "", "", ""]
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
  var widths = [140, 140, 120, 160, 180, 90, 160, 150, 220, 130];
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
  var cols = Math.max(sheet.getLastColumn(), USER_HEADERS.length);
  var values = sheet.getRange(2, 1, last - 1, cols).getValues();
  for (var i = 0; i < values.length; i++) {
    var row = padUserRow_(values[i]);
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
    var profile = userProfileFromRow_(row);
    var fromAccounts = findAccountProfile_({
      username: String(row[0] || "").trim(),
      account: account
    });
    if (fromAccounts) {
      if (fromAccounts.whatsapp) profile.whatsapp = fromAccounts.whatsapp;
      if (fromAccounts.personName) profile.personName = fromAccounts.personName;
      if (fromAccounts.fiverrId) profile.fiverrId = fromAccounts.fiverrId;
      if (fromAccounts.fiverrGigUrl) profile.fiverrGigUrl = fromAccounts.fiverrGigUrl;
      if (fromAccounts.paymentStatus) profile.paymentStatus = fromAccounts.paymentStatus;
    }
    return {
      ok: true,
      username: String(row[0] || "").trim(),
      role: role === "superadmin" ? "superadmin" : "user",
      account: account,
      name: profile.personName || String(row[0] || "").trim(),
      whatsapp: profile.whatsapp,
      personName: profile.personName,
      fiverrId: profile.fiverrId,
      fiverrGigUrl: profile.fiverrGigUrl,
      paymentStatus: profile.paymentStatus
    };
  }
  return { ok: false, error: "Wrong username or password." };
}

function setupUsersSheetIfNeeded_() {
  var ss = SpreadsheetApp.openById(USERS_SPREADSHEET_ID);
  var sheet = ss.getSheets()[0];
  var first = String(sheet.getRange(1, 1).getValue() || "").trim().toLowerCase();
  if (first !== "username") setupUsersSheet_();
  ensureUserProfileColumns_(sheet);
}

function ensureUserProfileColumns_(sheet) {
  if (!sheet) {
    sheet = SpreadsheetApp.openById(USERS_SPREADSHEET_ID).getSheets()[0];
  }
  sheet.getRange(1, 1, 1, USER_HEADERS.length).setValues([USER_HEADERS]);
  var widths = [140, 140, 120, 160, 180, 90, 160, 150, 220, 130];
  var i;
  for (i = 0; i < widths.length; i++) sheet.setColumnWidth(i + 1, widths[i]);
}

function userProfileFromRow_(row) {
  var payment = String(row[9] || "").trim();
  if (/unpaid/i.test(payment)) payment = "unpaid";
  else if (/paid/i.test(payment)) payment = "paid";
  else payment = "";
  return {
    whatsapp: String(row[6] || "").trim(),
    personName: String(row[4] || "").trim(),
    fiverrId: String(row[7] || "").trim(),
    fiverrGigUrl: String(row[8] || "").trim(),
    paymentStatus: payment
  };
}

function padUserRow_(row) {
  var next = (row || []).slice();
  while (next.length < USER_HEADERS.length) next.push("");
  return next.slice(0, USER_HEADERS.length);
}

function getUserProfile_(params) {
  setupUsersSheetIfNeeded_();
  var wantedUser = String((params && params.username) || "").trim().toLowerCase();
  if (!wantedUser) {
    return { ok: false, action: "getUserProfile", error: "Username is required." };
  }
  var ss = SpreadsheetApp.openById(USERS_SPREADSHEET_ID);
  var sheet = ss.getSheets()[0];
  var last = Math.max(sheet.getLastRow(), 1);
  if (last < 2) {
    return { ok: false, action: "getUserProfile", error: "No users in the login sheet yet." };
  }
  var cols = Math.max(sheet.getLastColumn(), USER_HEADERS.length);
  var values = sheet.getRange(2, 1, last - 1, cols).getValues();
  var i;
  for (i = 0; i < values.length; i++) {
    var row = padUserRow_(values[i]);
    if (String(row[0] || "").trim().toLowerCase() !== wantedUser) continue;
    var role = String(row[2] || "user").trim().toLowerCase().replace(/\s+/g, "");
    if (role === "super admin" || role === "admin") role = "superadmin";
    var forced = "";
    var reqRole = String((params && params.role) || "").toLowerCase().replace(/\s+/g, "");
    if (reqRole === "user" || reqRole === "account") {
      forced = tabName_((params && (params.userAccount || params.account)) || "");
      var account = tabName_(row[3] || "");
      if (forced && account && account.toLowerCase() !== forced.toLowerCase()) {
        return { ok: false, action: "getUserProfile", error: "You can only load your own account profile." };
      }
    }
    var profile = userProfileFromRow_(row);
    var fromAccounts = findAccountProfile_({
      username: String(row[0] || "").trim(),
      account: tabName_(row[3] || "")
    });
    if (fromAccounts) {
      if (fromAccounts.whatsapp) profile.whatsapp = fromAccounts.whatsapp;
      if (fromAccounts.personName) profile.personName = fromAccounts.personName;
      if (fromAccounts.fiverrId) profile.fiverrId = fromAccounts.fiverrId;
      if (fromAccounts.fiverrGigUrl) profile.fiverrGigUrl = fromAccounts.fiverrGigUrl;
      if (fromAccounts.paymentStatus) profile.paymentStatus = fromAccounts.paymentStatus;
    }
    return {
      ok: true,
      action: "getUserProfile",
      username: String(row[0] || "").trim(),
      role: role === "superadmin" ? "superadmin" : "user",
      account: tabName_(row[3] || ""),
      name: profile.personName || String(row[0] || "").trim(),
      whatsapp: profile.whatsapp,
      personName: profile.personName,
      fiverrId: profile.fiverrId,
      fiverrGigUrl: profile.fiverrGigUrl,
      paymentStatus: profile.paymentStatus
    };
  }
  return { ok: false, action: "getUserProfile", error: "User was not found." };
}

function upsertUser_(data) {
  setupUsersSheetIfNeeded_();
  var username = String((data && data.username) || "").trim();
  var password = String((data && data.password) || "");
  var account = tabName_((data && (data.account || data.userAccount)) || "");
  var displayName = String((data && (data.displayName || data.personName || data.name)) || username).trim();
  var whatsapp = String((data && data.whatsapp) || "").trim();
  var fiverrId = String((data && (data.fiverrId || data.fiverrid)) || "").trim();
  var fiverrGigUrl = String((data && (data.fiverrGigUrl || data.fiverrgigurl)) || "").trim();
  var paymentStatus = String((data && (data.paymentStatus || data.paymentstatus)) || "").trim();
  if (/unpaid/i.test(paymentStatus)) paymentStatus = "Unpaid";
  else if (/paid/i.test(paymentStatus)) paymentStatus = "Paid";
  else paymentStatus = "";
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
    var existing = padUserRow_(sheet.getRange(found, 1, 1, Math.max(sheet.getLastColumn(), USER_HEADERS.length)).getValues()[0]);
    sheet.getRange(found, 1, 1, USER_HEADERS.length).setValues([[
      username,
      password ? password : existing[1],
      "user",
      account,
      displayName || existing[4] || username,
      active,
      whatsapp || existing[6] || "",
      fiverrId || existing[7] || "",
      fiverrGigUrl || existing[8] || "",
      paymentStatus || existing[9] || ""
    ]]);
    upsertAccountProfile_(data);
    ensureOrderTabForAccount_(account);
    return { ok: true, action: "upsertUser", username: username, account: account, updated: true };
  }
  sheet.getRange(last + 1, 1, 1, USER_HEADERS.length).setValues([[
    username,
    password,
    "user",
    account,
    displayName || username,
    active,
    whatsapp,
    fiverrId,
    fiverrGigUrl,
    paymentStatus
  ]]);
  upsertAccountProfile_(data);
  ensureOrderTabForAccount_(account);
  return { ok: true, action: "upsertUser", username: username, account: account, created: true };
}

function accountsSpreadsheet_() {
  return SpreadsheetApp.openById(ACCOUNTS_SPREADSHEET_ID);
}

function paymentStatusLabel_(value) {
  var raw = String(value || "").trim();
  if (/unpaid/i.test(raw)) return "Unpaid";
  if (/paid/i.test(raw)) return "Paid";
  return "";
}

function paymentStatusValue_(value) {
  var raw = String(value || "").trim().toLowerCase();
  if (raw.indexOf("unpaid") >= 0) return "unpaid";
  if (raw.indexOf("paid") >= 0) return "paid";
  return "";
}

function profileObject_(username, account, whatsapp, personName, fiverrId, fiverrGigUrl, paymentStatus) {
  return {
    username: String(username || "").trim(),
    name: tabName_(account || username || ""),
    account: tabName_(account || username || ""),
    personName: String(personName || "").trim(),
    whatsapp: String(whatsapp || "").trim(),
    fiverrId: String(fiverrId || "").trim(),
    fiverrGigUrl: String(fiverrGigUrl || "").trim(),
    paymentStatus: paymentStatusValue_(paymentStatus)
  };
}

function profileFromProfileRow_(row) {
  var next = row || [];
  while (next.length < PROFILE_HEADERS.length) next.push("");
  return profileObject_(next[0], next[1], next[2], next[3], next[4], next[5], next[6]);
}

function profileRow_(profile) {
  var item = profile || {};
  return [
    String(item.username || "").trim(),
    tabName_(item.account || item.name || item.username || ""),
    String(item.whatsapp || "").trim(),
    String(item.personName || item.displayName || "").trim(),
    String(item.fiverrId || "").trim(),
    String(item.fiverrGigUrl || "").trim(),
    paymentStatusLabel_(item.paymentStatus)
  ];
}

function styleProfileSheet_(sheet) {
  if (!sheet) return;
  var cols = PROFILE_HEADERS.length;
  var lastRow = Math.max(sheet.getLastRow(), 12);
  sheet.getRange(1, 1, 1, cols).setValues([PROFILE_HEADERS]);
  sheet.setFrozenRows(1);
  try { sheet.setHiddenGridlines(true); } catch (err) {}
  var header = sheet.getRange(1, 1, 1, cols);
  header.setFontFamily("Google Sans");
  header.setFontWeight("bold");
  header.setFontSize(10);
  header.setFontColor("#ffffff");
  header.setBackground(FOREST);
  header.setHorizontalAlignment("center");
  header.setVerticalAlignment("middle");
  sheet.setRowHeight(1, 42);
  var body = sheet.getRange(2, 1, lastRow, cols);
  body.setFontFamily("Google Sans");
  body.setFontSize(10);
  body.setFontColor(INK);
  body.setVerticalAlignment("middle");
  body.setWrap(true);
  var widths = [140, 150, 170, 160, 160, 280, 130];
  var i;
  for (i = 0; i < widths.length; i++) sheet.setColumnWidth(i + 1, widths[i]);
  var filter = sheet.getFilter();
  if (filter) filter.remove();
  sheet.getRange(1, 1, lastRow, cols).createFilter();
}

function usersDirectorySheet_(ss) {
  var sheets = ss.getSheets();
  var i;
  for (i = 0; i < sheets.length; i++) {
    var name = String(sheets[i].getName() || "").trim().toLowerCase();
    if (name === "users" || name === "directory") return sheets[i];
  }
  var first = sheets[0];
  if (first && /^(sheet1|untitled)$/i.test(String(first.getName() || "").trim())) {
    first.setName("Users");
    return first;
  }
  return ss.insertSheet("Users", 0);
}

function writeProfileTab_(ss, profile) {
  var account = tabName_((profile && (profile.account || profile.name)) || "");
  if (!account) return;
  var sheet = getOrCreateSheet_(ss, account);
  styleProfileSheet_(sheet);
  sheet.getRange(2, 1, 1, PROFILE_HEADERS.length).setValues([profileRow_(profile)]);
}

function seedAccountProfiles_() {
  return [
    profileObject_("block", "Block", "+923001110000", "Block User", "blockfiverr", "https://www.fiverr.com/block", "Paid"),
    profileObject_("artistic", "Artistic", "+9233333323248", "Ashar", "Artistic_maha", "https://www.fiverr.com/artistic_maha", "Paid")
  ];
}

function setupAccountProfiles_() {
  var ss = accountsSpreadsheet_();
  var directory = usersDirectorySheet_(ss);
  styleProfileSheet_(directory);
  var existing = listAccountProfilesFromSheet_(directory);
  var byKey = {};
  var i;
  for (i = 0; i < existing.length; i++) {
    var item = existing[i];
    byKey[String(item.username || "").toLowerCase()] = item;
    byKey[String(item.account || "").toLowerCase()] = item;
  }
  var seeds = seedAccountProfiles_();
  for (i = 0; i < seeds.length; i++) {
    var seed = seeds[i];
    var prev = byKey[String(seed.username || "").toLowerCase()] || byKey[String(seed.account || "").toLowerCase()];
    var next = prev ? {
      username: prev.username || seed.username,
      account: prev.account || seed.account,
      name: prev.account || seed.account,
      personName: prev.personName || seed.personName,
      whatsapp: prev.whatsapp || seed.whatsapp,
      fiverrId: prev.fiverrId || seed.fiverrId,
      fiverrGigUrl: prev.fiverrGigUrl || seed.fiverrGigUrl,
      paymentStatus: prev.paymentStatus || seed.paymentStatus
    } : seed;
    upsertAccountProfileRow_(directory, next);
    writeProfileTab_(ss, next);
    ensureOrderTabForAccount_(next.account);
  }
  return { ok: true, action: "setupAccounts", sheet: directory.getName(), count: listAccountProfilesFromSheet_(directory).length };
}

function listAccountProfilesFromSheet_(sheet) {
  var out = [];
  if (!sheet) return out;
  var last = sheet.getLastRow();
  if (last < 2) return out;
  var cols = Math.max(sheet.getLastColumn(), PROFILE_HEADERS.length);
  var values = sheet.getRange(2, 1, last - 1, cols).getValues();
  var r;
  for (r = 0; r < values.length; r++) {
    var profile = profileFromProfileRow_(values[r]);
    if (!profile.username && !profile.account) continue;
    out.push(profile);
  }
  return out;
}

function listAccountProfiles_(params) {
  var ss = accountsSpreadsheet_();
  var directory = usersDirectorySheet_(ss);
  if (listAccountProfilesFromSheet_(directory).length < 1) {
    setupAccountProfiles_();
    directory = usersDirectorySheet_(ss);
  }
  var accounts = listAccountProfilesFromSheet_(directory);
  var forced = "";
  var role = String((params && params.role) || "").toLowerCase().replace(/\s+/g, "");
  if (role === "user" || role === "account") {
    forced = tabName_((params && (params.userAccount || params.account)) || "");
    var username = String((params && params.username) || "").trim().toLowerCase();
    accounts = accounts.filter(function (item) {
      if (forced && String(item.account || "").toLowerCase() === forced.toLowerCase()) return true;
      if (username && String(item.username || "").toLowerCase() === username) return true;
      return false;
    });
  }
  return { ok: true, action: "listAccounts", count: accounts.length, accounts: accounts };
}

function findAccountProfile_(query) {
  var wantedUser = String((query && query.username) || "").trim().toLowerCase();
  var wantedAccount = tabName_((query && (query.account || query.name || query.tab)) || "").toLowerCase();
  try {
    var ss = accountsSpreadsheet_();
    var directory = usersDirectorySheet_(ss);
    var accounts = listAccountProfilesFromSheet_(directory);
    var i;
    for (i = 0; i < accounts.length; i++) {
      var item = accounts[i];
      if (wantedUser && String(item.username || "").toLowerCase() === wantedUser) return item;
      if (wantedAccount && String(item.account || "").toLowerCase() === wantedAccount) return item;
    }
    if (wantedAccount) {
      var tab = sheetForAccount_(ss, wantedAccount);
      if (tab && String(tab.getName() || "").toLowerCase() !== "users") {
        var last = tab.getLastRow();
        if (last >= 2) {
          var row = tab.getRange(2, 1, 1, PROFILE_HEADERS.length).getValues()[0];
          var fromTab = profileFromProfileRow_(row);
          if (fromTab.username || fromTab.account || fromTab.whatsapp || fromTab.fiverrId) return fromTab;
        }
      }
    }
  } catch (err) {
    return null;
  }
  return null;
}

function getAccountProfile_(params) {
  var profile = findAccountProfile_(params);
  if (!profile) {
    setupAccountProfiles_();
    profile = findAccountProfile_(params);
  }
  if (!profile) {
    return { ok: false, action: "getAccountProfile", error: "Account profile was not found." };
  }
  var forced = "";
  var role = String((params && params.role) || "").toLowerCase().replace(/\s+/g, "");
  if (role === "user" || role === "account") {
    forced = tabName_((params && (params.userAccount || params.account)) || "");
    if (forced && String(profile.account || "").toLowerCase() !== forced.toLowerCase()) {
      return { ok: false, action: "getAccountProfile", error: "You can only load your own account profile." };
    }
  }
  profile.ok = true;
  profile.action = "getAccountProfile";
  return profile;
}

function upsertAccountProfileRow_(sheet, profile) {
  var row = profileRow_(profile);
  var username = String(row[0] || "").toLowerCase();
  var account = String(row[1] || "").toLowerCase();
  var last = Math.max(sheet.getLastRow(), 1);
  var found = 0;
  if (last >= 2) {
    var values = sheet.getRange(2, 1, last - 1, 2).getValues();
    var i;
    for (i = 0; i < values.length; i++) {
      var existingUser = String(values[i][0] || "").trim().toLowerCase();
      var existingAccount = String(values[i][1] || "").trim().toLowerCase();
      if ((username && existingUser === username) || (account && existingAccount === account)) {
        found = i + 2;
        break;
      }
    }
  }
  if (found) {
    var existing = sheet.getRange(found, 1, 1, PROFILE_HEADERS.length).getValues()[0];
    var merged = [
      row[0] || existing[0],
      row[1] || existing[1],
      row[2] || existing[2],
      row[3] || existing[3],
      row[4] || existing[4],
      row[5] || existing[5],
      row[6] || existing[6]
    ];
    sheet.getRange(found, 1, 1, PROFILE_HEADERS.length).setValues([merged]);
    return profileFromProfileRow_(merged);
  }
  sheet.getRange(last + 1, 1, 1, PROFILE_HEADERS.length).setValues([row]);
  return profileFromProfileRow_(row);
}

function upsertAccountProfile_(data) {
  setupAccountProfiles_();
  var ss = accountsSpreadsheet_();
  var directory = usersDirectorySheet_(ss);
  var profile = profileObject_(
    data && (data.username || data.user),
    data && (data.account || data.name || data.tabName),
    data && data.whatsapp,
    data && (data.personName || data.displayName),
    data && data.fiverrId,
    data && data.fiverrGigUrl,
    data && data.paymentStatus
  );
  if (!profile.username && !profile.account) {
    return { ok: false, action: "upsertAccountProfile", error: "Account name is required." };
  }
  if (!profile.username) profile.username = profile.account;
  if (!profile.account) profile.account = tabName_(profile.username);
  var saved = upsertAccountProfileRow_(directory, profile);
  writeProfileTab_(ss, saved);
  ensureOrderTabForAccount_(saved.account);
  saved.ok = true;
  saved.action = "upsertAccountProfile";
  return saved;
}

function ensureOrderTabForAccount_(account) {
  var name = tabName_(account);
  if (!name) return;
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = getOrCreateSheet_(ss, name);
  styleSheet_(ss, sheet);
}

function setupAccounts() {
  return setupAccountProfiles_();
}
