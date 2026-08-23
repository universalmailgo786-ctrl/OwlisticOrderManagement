(function (global) {
  const URL_KEY = "owlistic.sheetWebAppUrl";
  const SPREADSHEET_ID = "1nZuMePQFJA9lCQ6C48d9MUC3Fwn00ao6Kilap5rbFfQ";
  const DEFAULT_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxc9UyzIdr73zkuzHH-8R2tWxOmr3Rc88ApfrVA2RnKObATD3J8PSCJuwtF9FahSmIq/exec";
  const store = global.OwlisticStore;

  const HEADERS = [
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

  function getWebAppUrl() {
    try {
      return (localStorage.getItem(URL_KEY) || DEFAULT_WEB_APP_URL || "").trim();
    } catch (err) {
      return DEFAULT_WEB_APP_URL;
    }
  }

  function setWebAppUrl(url) {
    localStorage.setItem(URL_KEY, String(url || "").trim());
  }

  function isConfigured() {
    const url = getWebAppUrl();
    return /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec\/?$/.test(url);
  }

  function formatDate(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }

  function formatTime(iso) {
    if (!iso) return "";
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit"
    });
  }

  function formatDateTime(iso) {
    if (!iso) return "";
    return formatDate(iso) + " " + formatTime(iso);
  }

  function fileNames(files) {
    return (files || []).map(function (file) { return file.name; }).filter(Boolean).join(", ");
  }

  function paymentLabel(order) {
    if (order.paymentStatus === "paid" || order.paymentStatus === "paid") return "Paid";
    if (order.paymentStatus === "unpaid" || order.paymentStatus === "unpaid") return "Unpaid";
    return "";
  }

  function latestMessage(rounds, role) {
    for (let i = rounds.length - 1; i >= 0; i -= 1) {
      const messages = rounds[i].messages || [];
      for (let j = messages.length - 1; j >= 0; j -= 1) {
        const message = messages[j];
        const messageRole = message.role === "seller" || message.kind === "seller" ? "seller" : "buyer";
        if (messageRole === role && String(message.text || "").trim()) {
          return message.text.trim();
        }
      }
    }
    return "";
  }

  function revisionHistory(order) {
    const rounds = store.normalizeRevisions(order.revisions || []);
    return rounds.map(function (round) {
      const messages = (round.messages || []).map(function (message) {
        const role = message.role === "seller" || message.kind === "seller" ? "Seller" : "Buyer";
        const stamp = formatDateTime(message.createdAt);
        const parts = [role + (stamp ? " (" + stamp + ")" : ""), (message.text || "").trim() || "(no text)"];
        const files = fileNames(message.files);
        if (files) parts.push("Files: " + files);
        return parts.join(" — ");
      });
      return "Revision " + round.number + (messages.length ? ": " + messages.join(" | ") : ": (empty)");
    }).join("\n");
  }

  function toRow(order) {
    const rounds = store.normalizeRevisions(order.revisions || []);
    const current = store.currentRevision(order);
    const status = store.computeStatus(order);
    return [
      order.id || "",
      formatDate(order.createdAt),
      formatTime(order.createdAt),
      formatDate(order.updatedAt),
      formatTime(order.updatedAt),
      order.accountName || "",
      order.whatsapp || "",
      order.name || "",
      order.orderValue || order.orderValue || "",
      paymentLabel(order),
      order.searchKeyword || order.searchKeyword || "",
      store.orderTypeLabel(order),
      order.messageText || order.messageText || "",
      order.directRequirements || order.directRequirements || "",
      fileNames(order.requirementFiles || order.requirementFiles),
      order.fiverrId || order.fiverrId || "",
      order.fiverrGigUrl || order.fiverrGigUrl || "",
      order.reviewText || order.reviewText || "",
      rounds.length ? String(rounds.length) : "0",
      revisionHistory(order),
      current ? ("Revision " + current.number) : "None",
      latestMessage(rounds, "buyer"),
      latestMessage(rounds, "seller"),
      order.readyToApprove || order.readyToApprove ? "Ready to Approve" : "Not Ready",
      store.statusLabel(status)
    ];
  }

  function scriptSource() {
    return [
      'var SPREADSHEET_ID = "' + SPREADSHEET_ID + '";',
      'var HEADERS = ' + JSON.stringify(HEADERS) + ';',
      'function doGet() { return json_({ ok: true, service: "Ashar Orders Management System" }); }',
      'function doPost(e) {',
      '  try {',
      '    var data = JSON.parse((e.postData && e.postData.contents) || "{}");',
      '    var row = data.row || [];',
      '    var orderId = String(data.orderId || row[0] || "");',
      '    var sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheets()[0];',
      '    ensureHeaders_(sheet);',
      '    while (row.length < HEADERS.length) row.push("");',
      '    var last = sheet.getLastRow();',
      '    if (last > 1 && orderId) {',
      '      var ids = sheet.getRange(2, 1, last - 1, 1).getValues();',
      '      for (var i = 0; i < ids.length; i++) {',
      '        if (String(ids[i][0]) === orderId) {',
      '          sheet.getRange(i + 2, 1, 1, HEADERS.length).setValues([row.slice(0, HEADERS.length)]);',
      '          return json_({ ok: true, updated: true, orderId: orderId });',
      '        }',
      '      }',
      '    }',
      '    sheet.appendRow(row.slice(0, HEADERS.length));',
      '    return json_({ ok: true, created: true, orderId: orderId });',
      '  } catch (err) { return json_({ ok: false, error: String(err) }); }',
      '}',
      'function ensureHeaders_(sheet) {',
      '  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);',
      '  sheet.setFrozenRows(1);',
      '  var header = sheet.getRange(1, 1, 1, HEADERS.length);',
      '  header.setFontWeight("bold");',
      '  header.setWrap(true);',
      '  header.setBackground("#223829");',
      '  header.setFontColor("#ffffff");',
      '  header.setVerticalAlignment("middle");',
      '  sheet.setRowHeight(1, 36);',
      '}',
      'function json_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }'
    ].join("\n");
  }

  function sync(order) {
    if (!isConfigured() || !order) {
      return Promise.resolve({ skipped: true, skipped: true });
    }
    return fetch(getWebAppUrl(), {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        orderId: order.id,
        row: toRow(order)
      })
    }).then(function () {
      return { ok: true };
    });
  }

  global.OwlisticSheet = {
    HEADERS: HEADERS,
    SPREADSHEET_ID: SPREADSHEET_ID,
    sync: sync,
    toRow: toRow,
    isConfigured: isConfigured,
    getWebAppUrl: getWebAppUrl,
    setWebAppUrl: setWebAppUrl,
    get scriptSource() {
      return scriptSource();
    }
  };
})(window);
