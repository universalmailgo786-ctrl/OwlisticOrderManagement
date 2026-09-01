var HANIF_DATA_SHEET_NAME = "Hanif Costing Data";
var HANIF_DASHBOARD_SHEET_NAME = "Hanif Costing Dashboard";
var HANIF_LEGACY_SHEET_NAME = "Hanif Costing";
var HANIF_STRUCTURE_MIGRATED_PROP = "HANIF_LEDGER_STRUCTURE_V2";
var HANIF_PKR_RATE_NAMED = "PKR_RATE";
var HANIF_DEFAULT_PKR_RATE = 275;
var HANIF_HEADERS = [
  "Unique Order ID",
  "Created Date",
  "Account",
  "Client Name",
  "Business Name",
  "Order Value (USD)",
  "Hanif Cost (USD)",
  "Fiverr Fee (USD)",
  "Return After Fee (USD)",
  "Total Loss (USD)",
  "Order Status",
  "Payment Status",
  "Paid Amount (USD)",
  "Paid Date",
  "Total Loss (PKR)",
  "Last Updated"
];
var HANIF_COL_WIDTHS = [118, 148, 190, 130, 130, 112, 112, 108, 128, 108, 132, 118, 118, 132, 118, 148];
var HANIF_USD_COLS = [6, 7, 8, 9, 10, 13];
var HANIF_DATE_COLS = [2, 14, 16];
var HANIF_DATA_REF = "'" + HANIF_DATA_SHEET_NAME + "'!";

function isHanifWorkbookSheet_(name) {
  var key = String(name || "").trim().toLowerCase();
  return key === HANIF_DATA_SHEET_NAME.toLowerCase()
    || key === HANIF_DASHBOARD_SHEET_NAME.toLowerCase()
    || key === HANIF_LEGACY_SHEET_NAME.toLowerCase();
}

function hanifCleanText_(value) {
  return String(value == null ? "" : value)
    .replace(/Â·/g, "\u00B7")
    .replace(/\u00c2\u00b7/g, "\u00B7")
    .replace(/\s+/g, " ")
    .trim();
}

function hanifAccountLabel_(account, fiverrId) {
  var text = hanifCleanText_(account);
  var id = hanifCleanText_(fiverrId);
  if (!id) return text;
  if (text && text.indexOf(id) >= 0) return text;
  if (!text) return id;
  return text + " \u00B7 " + id;
}

function hanifDateCell_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  var text = String(value || "").trim();
  if (!text) return "";
  var parsed = new Date(text);
  return isNaN(parsed.getTime()) ? text : parsed;
}

function hanifDashboardSheet_(ss) {
  if (!ss) ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(HANIF_DASHBOARD_SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(HANIF_DASHBOARD_SHEET_NAME, 0);
  return sheet;
}

function resolveHanifDataSheet_(ss) {
  if (!ss) ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(HANIF_DATA_SHEET_NAME);
  if (!sheet) {
    sheet = ss.getSheetByName(HANIF_LEGACY_SHEET_NAME);
    if (sheet) {
      try { sheet.setName(HANIF_DATA_SHEET_NAME); } catch (err) {}
    }
  }
  if (!sheet) sheet = ss.insertSheet(HANIF_DATA_SHEET_NAME);
  migrateHanifSheetStructure_(sheet);
  return sheet;
}

function hanifHeaderLooksLegacy_(headers) {
  return String(headers[2] || "").trim() === "Order Number"
    || String(headers[3] || "").indexOf("Fiverr") >= 0
    || String(headers[11] || "").trim() === "PKR Rate";
}

function migrateHanifSheetStructure_(sheet) {
  if (!sheet) return;
  var props = PropertiesService.getScriptProperties();
  var last = sheet.getLastRow();
  var header = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), HANIF_HEADERS.length)).getValues()[0];
  var legacy = hanifHeaderLooksLegacy_(header);
  if (!legacy && props.getProperty(HANIF_STRUCTURE_MIGRATED_PROP) === "1") {
    sheet.getRange(1, 1, 1, HANIF_HEADERS.length).setValues([HANIF_HEADERS]);
    return;
  }
  var rows = [];
  if (last >= 2) {
    var values = sheet.getRange(2, 1, last, Math.max(sheet.getLastColumn(), 18)).getValues();
    var i;
    for (i = 0; i < values.length; i++) {
      var row = values[i];
      if (String(row[0] || "").trim() === "TOTAL") continue;
      if (!String(row[0] || "").trim()) continue;
      if (legacy) {
        rows.push([
          String(row[0] || "").trim(),
          row[1],
          hanifCleanText_(row[3]),
          hanifCleanText_(row[4]),
          hanifCleanText_(row[5]),
          hanifNumber_(row[6]),
          hanifNumber_(row[7]),
          hanifNumber_(row[8]),
          hanifNumber_(row[9]),
          hanifNumber_(row[10]),
          hanifCleanText_(row[13]),
          hanifPaymentStatus_(row[14]),
          hanifNumber_(row[15]),
          row[16],
          hanifNumber_(row[12]),
          row[17]
        ]);
      } else {
        while (row.length < HANIF_HEADERS.length) row.push("");
        row[2] = hanifCleanText_(row[2]);
        rows.push(row.slice(0, HANIF_HEADERS.length));
      }
    }
  }
  sheet.clear();
  sheet.getRange(1, 1, 1, HANIF_HEADERS.length).setValues([HANIF_HEADERS]);
  if (rows.length) sheet.getRange(2, 1, rows.length, HANIF_HEADERS.length).setValues(rows);
  props.setProperty(HANIF_STRUCTURE_MIGRATED_PROP, "1");
}

function hanifPkrRate_(ss) {
  try {
    var dash = hanifDashboardSheet_(ss);
    var rate = hanifNumber_(dash.getRange("B7").getValue());
    if (rate > 0) return rate;
  } catch (err) {}
  return HANIF_DEFAULT_PKR_RATE;
}

function ensureHanifDashboard_(ss) {
  var dash = hanifDashboardSheet_(ss);
  var dataRef = HANIF_DATA_REF;
  var existingRate = "";
  try { existingRate = dash.getRange("B7").getValue(); } catch (err) {}
  dash.clear();
  dash.setHiddenGridlines(true);
  dash.getRange("A1:H1").merge().setValue("HANIF COSTING LEDGER")
    .setFontFamily("Google Sans").setFontSize(18).setFontWeight("bold")
    .setFontColor(FOREST).setBackground(PAPER).setHorizontalAlignment("left").setVerticalAlignment("middle");
  dash.setRowHeight(1, 42);

  dash.getRange(3, 1, 1, 4).setValues([["Total Orders", "Total Order Value (USD)", "Total Hanif Cost (USD)", "Total Fiverr Fee (USD)"]])
    .setFontSize(10).setFontColor(MUTED).setFontWeight("bold").setBackground(SAGE);
  dash.getRange(4, 1).setFormula("=COUNTA(" + dataRef + "A2:A)");
  dash.getRange(4, 2).setFormula("=IFERROR(SUM(" + dataRef + "F2:F),0)");
  dash.getRange(4, 3).setFormula("=IFERROR(SUM(" + dataRef + "G2:G),0)");
  dash.getRange(4, 4).setFormula("=IFERROR(SUM(" + dataRef + "H2:H),0)");

  dash.getRange(5, 1, 1, 4).setValues([["Return After Fiverr Fee (USD)", "Total Loss (USD)", "Total Paid (USD)", "Total Unpaid (USD)"]])
    .setFontSize(10).setFontColor(MUTED).setFontWeight("bold").setBackground(SAGE);
  dash.getRange(6, 1).setFormula("=IFERROR(SUM(" + dataRef + "I2:I),0)");
  dash.getRange(6, 2).setFormula("=IFERROR(SUM(" + dataRef + "J2:J),0)");
  dash.getRange(6, 3).setFormula("=IFERROR(SUMIF(" + dataRef + "L2:L,\"Paid\"," + dataRef + "M2:M),0)");
  dash.getRange(6, 4).setFormula(
    "=IFERROR(SUMIF(" + dataRef + "L2:L,\"Unpaid\"," + dataRef + "G2:G),0)" +
    "+IFERROR(SUMIFS(" + dataRef + "G2:G," + dataRef + "L2:L,\"Paid\"," + dataRef + "M2:M,\"<\"&" + dataRef + "G2:G),0)"
  );

  dash.getRange(7, 1).setValue("PKR Rate").setFontWeight("bold").setBackground(GOLD).setFontColor(GOLD_TEXT);
  var rateCell = dash.getRange("B7");
  rateCell.setValue(existingRate || HANIF_DEFAULT_PKR_RATE);
  rateCell.setBackground(GOLD).setFontWeight("bold").setFontColor(INK).setNumberFormat("0");
  try {
    ss.setNamedRange(HANIF_PKR_RATE_NAMED, dash.getRange("B7"));
  } catch (err) {}
  dash.getRange(7, 3).setValue("Total Loss (PKR)").setFontWeight("bold").setBackground(SAGE).setFontColor(SAGE_TEXT);
  dash.getRange(7, 4).setFormula("=IFERROR(SUM(" + dataRef + "O2:O),0)").setNumberFormat('"PKR "#,##0');

  dash.getRange(4, 2, 3, 3).setNumberFormat("$#,##0.00");
  dash.getRange(4, 1, 3, 4).setFontFamily("Google Sans").setFontSize(12).setFontWeight("bold").setBackground(PAPER).setFontColor(INK);
  dash.getRange(4, 1).setNumberFormat("0");

  dash.getRange(9, 1).setValue("ORDER STATUS LEGEND").setFontWeight("bold").setFontColor(FOREST);
  dash.getRange(10, 1, 1, 5).setValues([["In Progress", "Orders Placed", "On Revision", "Ready to Approve", "Completed"]])
    .setBackground(SKY).setFontColor(SKY_TEXT).setFontWeight("bold");
  dash.getRange(11, 1).setValue("PAYMENT STATUS").setFontWeight("bold").setFontColor(FOREST);
  dash.getRange(12, 1, 1, 2).setValues([["Paid", "Unpaid"]])
    .setBackground(ROSE).setFontColor(ROSE_TEXT).setFontWeight("bold");

  dash.getRange(14, 1).setValue("NOTES").setFontWeight("bold").setFontColor(FOREST);
  dash.getRange(15, 1, 6, 1).setValues([
    ["\u2022 Hanif Cost is automatically calculated from Order Value."],
    ["\u2022 Payment Status is separate from Order Status."],
    ["\u2022 Records sync using Unique Order ID."],
    ["\u2022 Moving an order between tabs does not create a duplicate Hanif record."],
    ["\u2022 Deleting the original order removes the Hanif record."],
    ["\u2022 PKR Rate in cell B7 is editable by Superadmin."]
  ]).setFontColor(MUTED).setWrap(true).setVerticalAlignment("top");

  dash.setColumnWidths(1, 8, 150);
  dash.setColumnWidth(1, 220);
  dash.setColumnWidth(6, 180);
  return dash;
}

function hanifDataLastRow_(sheet) {
  var last = sheet.getLastRow();
  if (last >= 2 && String(sheet.getRange(last, 1).getValue() || "").trim() === "TOTAL") return last - 1;
  return last;
}

function updateHanifTotalsRow_(sheet) {
  if (!sheet) return;
  var last = sheet.getLastRow();
  if (last >= 2 && String(sheet.getRange(last, 1).getValue() || "").trim() === "TOTAL") {
    sheet.deleteRow(last);
    last = sheet.getLastRow();
  }
  if (last < 2) return;
  var totalRow = last + 1;
  sheet.getRange(totalRow, 1).setValue("TOTAL").setFontWeight("bold");
  var cols = ["F", "G", "H", "I", "J", "M", "O"];
  var i;
  for (i = 0; i < cols.length; i++) {
    sheet.getRange(totalRow, sheet.getRange(cols[i] + "1").getColumn())
      .setFormula("=IFERROR(SUM(" + cols[i] + "2:" + cols[i] + last + "),0)")
      .setFontWeight("bold");
  }
  sheet.getRange(totalRow, 1, 1, HANIF_HEADERS.length)
    .setBackground(SAGE)
    .setFontColor(SAGE_TEXT)
    .setFontWeight("bold");
  sheet.getRange(totalRow, 1, 1, 1).setBorder(true, null, null, null, null, null, FOREST, SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
}

function appendHanifRow_(sheet, row) {
  var last = hanifDataLastRow_(sheet);
  if (last < 1) last = 1;
  sheet.insertRowAfter(last);
  sheet.getRange(last + 1, 1, 1, row.length).setValues([row]);
}

function formatHanifDataSheet_(sheet) {
  if (!sheet) return;
  sheet.getRange(1, 1, 1, HANIF_HEADERS.length).setValues([HANIF_HEADERS]);
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(1);
  try { sheet.setHiddenGridlines(true); } catch (err) {}

  var header = sheet.getRange(1, 1, 1, HANIF_HEADERS.length);
  header.setFontFamily("Google Sans").setFontWeight("bold").setFontSize(10)
    .setFontColor("#ffffff").setBackground(FOREST)
    .setHorizontalAlignment("center").setVerticalAlignment("middle").setWrap(true);
  sheet.setRowHeight(1, 42);

  var i;
  for (i = 0; i < HANIF_COL_WIDTHS.length; i++) sheet.setColumnWidth(i + 1, HANIF_COL_WIDTHS[i]);

  var last = hanifDataLastRow_(sheet);
  if (last >= 2) {
    var body = sheet.getRange(2, 1, last - 1, HANIF_HEADERS.length);
    body.setFontFamily("Google Sans").setFontSize(10).setFontColor(INK).setVerticalAlignment("middle");
    sheet.getRange(2, 6, last - 1, 5).setNumberFormat("$#,##0.00");
    sheet.getRange(2, 13, last - 1, 1).setNumberFormat("$#,##0.00");
    sheet.getRange(2, 15, last - 1, 1).setNumberFormat('"PKR "#,##0');
    sheet.getRange(2, 2, last - 1, 1).setNumberFormat("dd mmm yyyy, hh:mm AM/PM");
    sheet.getRange(2, 14, last - 1, 1).setNumberFormat("dd mmm yyyy");
    sheet.getRange(2, 16, last - 1, 1).setNumberFormat("dd mmm yyyy, hh:mm AM/PM");
    try {
      var filter = sheet.getFilter();
      if (filter) filter.remove();
      sheet.getRange(1, 1, last, HANIF_HEADERS.length).createFilter();
    } catch (err2) {}
    try {
      var paymentRule = SpreadsheetApp.newDataValidation()
        .requireValueInList(["Paid", "Unpaid"], true)
        .setAllowInvalid(false)
        .build();
      sheet.getRange(2, 12, last - 1, 1).setDataValidation(paymentRule);
    } catch (err3) {}
    sheet.getRange(2, 1, last - 1, HANIF_HEADERS.length)
      .applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);
  }

  applyHanifConditionalFormats_(sheet, last);
  updateHanifTotalsRow_(sheet);
  sheet.getRange(1, 1).setNote("Synced Hanif ledger data. Unique Order ID is the sync key.");
}

function applyHanifConditionalFormats_(sheet, last) {
  if (!sheet || last < 2) return;
  var rules = [];
  var dataRange = sheet.getRange(2, 1, last - 1, HANIF_HEADERS.length);
  var paymentRange = sheet.getRange(2, 12, last - 1, 1);
  var statusRange = sheet.getRange(2, 11, last - 1, 1);
  var paidAmountRange = sheet.getRange(2, 13, last - 1, 1);
  var hanifCostRange = sheet.getRange(2, 7, last - 1, 1);
  var orderValueRange = sheet.getRange(2, 6, last - 1, 1);

  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo("Paid").setBackground("#e7efe0").setFontColor("#3d5a2c").setRanges([paymentRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo("Unpaid").setBackground("#fbe7dc").setFontColor("#8a3d22").setRanges([paymentRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($K2="Completed",$L2="Unpaid")').setBackground("#fdebd2").setRanges([dataRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($L2="Paid",$M2<$G2)').setBackground("#fff4e5").setRanges([dataRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=AND($F2>0,$G2=0)').setBackground("#fff8f3").setRanges([dataRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains("In Progress").setBackground("#e4eef4").setFontColor("#1f4f66").setRanges([statusRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains("Orders Placed").setBackground("#e4eef4").setFontColor("#1f4f66").setRanges([statusRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains("On Revision").setBackground("#fdebd2").setFontColor("#8a3d22").setRanges([statusRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains("Ready to Approve").setBackground("#eadeea").setFontColor("#5c3f66").setRanges([statusRange]).build());
  rules.push(SpreadsheetApp.newConditionalFormatRule()
    .whenTextContains("Completed").setBackground("#e7efe0").setFontColor("#3d5a2c").setRanges([statusRange]).build());

  sheet.setConditionalFormatRules(rules);
}

function refreshHanifLedger_(ss) {
  if (!ss) ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = resolveHanifDataSheet_(ss);
  ensureHanifDashboard_(ss);
  formatHanifDataSheet_(sheet);
}

function hanifRecordFromRow_(row) {
  while (row.length < HANIF_HEADERS.length) row.push("");
  var rate = hanifPkrRate_(SpreadsheetApp.openById(SPREADSHEET_ID));
  return {
    orderId: String(row[0] || "").trim(),
    createdDate: String(row[1] || "").trim(),
    orderNumber: orderIdNumber_(row[0]),
    account: hanifCleanText_(row[2]),
    clientName: hanifCleanText_(row[3]),
    businessName: hanifCleanText_(row[4]),
    orderValue: hanifNumber_(row[5]),
    hanifCost: hanifNumber_(row[6]),
    fiverrFee: hanifNumber_(row[7]),
    returnAfterFee: hanifNumber_(row[8]),
    totalLoss: hanifNumber_(row[9]),
    pkrRate: rate,
    totalLossPkr: hanifNumber_(row[14]) || Math.round(hanifNumber_(row[9]) * rate),
    orderStatus: hanifCleanText_(row[10]),
    hanifPaymentStatus: hanifPaymentStatus_(row[11]).toLowerCase(),
    paidAmount: hanifNumber_(row[12]),
    paidAt: String(row[13] || "").trim(),
    updatedAt: String(row[15] || "").trim()
  };
}

function hanifRowFromRecord_(record, ss) {
  var rate = hanifPkrRate_(ss || SpreadsheetApp.openById(SPREADSHEET_ID));
  var totalLoss = hanifNumber_(record.totalLoss);
  return [
    String(record.orderId || ""),
    hanifDateCell_(record.createdDate || ""),
    hanifCleanText_(record.account || ""),
    hanifCleanText_(record.clientName || ""),
    hanifCleanText_(record.businessName || ""),
    hanifNumber_(record.orderValue),
    hanifNumber_(record.hanifCost),
    hanifNumber_(record.fiverrFee),
    hanifNumber_(record.returnAfterFee),
    totalLoss,
    hanifCleanText_(record.orderStatus || ""),
    hanifPaymentStatus_(record.hanifPaymentStatus),
    hanifNumber_(record.paidAmount),
    record.paidAt ? hanifDateCell_(record.paidAt) : "",
    Math.round(totalLoss * rate),
    hanifDateCell_(record.updatedAt || new Date().toISOString())
  ];
}
