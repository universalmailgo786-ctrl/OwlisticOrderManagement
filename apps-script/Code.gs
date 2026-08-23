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
    var row = data.row || [];
    var orderId = String(data.orderId || row[0] || "");
    var sheet = getSheet_();
    ensureHeaders_(sheet);

    while (row.length < HEADERS.length) {
      row.push("");
    }

    var last = sheet.getLastRow();
    if (last > 1 && orderId) {
      var ids = sheet.getRange(2, 1, last - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) {
        if (String(ids[i][0]) === orderId) {
          sheet.getRange(i + 2, 1, 1, HEADERS.length).setValues([row.slice(0, HEADERS.length)]);
          return json_({ ok: true, updated: true, orderId: orderId });
        }
      }
    }

    sheet.appendRow(row.slice(0, HEADERS.length));
    return json_({ ok: true, created: true, orderId: orderId });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function getSheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID).getSheets()[0];
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
