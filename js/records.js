(function () {
  const store = window.OwlisticStore;
  const auth = window.OwlisticAuth;
  const session = auth.requirePage();
  if (!session) return;
  auth.ensureLocalAccount(session);
  auth.bindNav();

  const body = document.getElementById("records-body");
  const headRow = document.getElementById("records-head-row");
  const table = document.querySelector(".records-table");
  const countEl = document.getElementById("records-count");
  const search = document.getElementById("records-search");
  const dateFilter = document.getElementById("filter-date");
  const accountFilter = document.getElementById("filter-account");
  const paymentFilter = document.getElementById("filter-payment");
  const revisionFilter = document.getElementById("filter-revision");
  const readyFilter = document.getElementById("filter-ready");
  const tabButtons = Array.prototype.slice.call(document.querySelectorAll(".records-tab"));
  const scheduleSummary = document.getElementById("schedule-summary");
  const scheduleAccountSummary = document.getElementById("schedule-account-summary");
  const scheduleFilterRow = document.getElementById("schedule-filter-row");
  const placeOnFilter = document.getElementById("filter-place-on");
  const scheduleClearAll = document.getElementById("schedule-clear-all");
  const scheduleModal = document.getElementById("schedule-modal");
  const scheduleDate = document.getElementById("schedule-date");
  const scheduleMode = document.getElementById("schedule-mode");
  const scheduleSave = document.getElementById("schedule-save");
  const scheduleModalOrder = document.getElementById("schedule-modal-order");
  const scheduleModalTitle = document.getElementById("schedule-modal-title");
  const sheetUpgradeBanner = document.getElementById("sheet-upgrade-banner");
  const sheetCopyScriptBtn = document.getElementById("sheet-copy-script");
  const sheetOpenScriptBtn = document.getElementById("sheet-open-script");
  const sheetAuthorizeScriptBtn = document.getElementById("sheet-authorize-script");
  const sheetRecheckScriptBtn = document.getElementById("sheet-recheck-script");
  const SHEET_URL = "https://docs.google.com/spreadsheets/d/1nZuMePQFJA9lCQ6C48d9MUC3Fwn00ao6Kilap5rbFfQ/edit";
  const TAB_LABELS = {
    "in-progress": "New order has to be placed",
    "orders-placed": "Orders Placed",
    "on-revision": "on revision",
    "ready-to-approve": "ready to approve",
    completed: "completed",
    "hanif-costing": "Hanif Costing"
  };
  const COPY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.2" y="8.2" width="11.2" height="11.2" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M5.4 15.4V6.8A1.8 1.8 0 0 1 7.2 5h9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
  const PENCIL_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.4 19.4 7.6 18.6 19 7.2a1.5 1.5 0 0 0 0-2.1L17 3.1a1.5 1.5 0 0 0-2.1 0L4.6 13.4z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M13.6 4.6 17.4 8.4" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>';
  const CAL_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="6" width="16" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8 4v4M16 4v4M4 10h16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';

  let activeTab = "in-progress";
  let scheduleFilter = "";
  let scheduleEditingId = "";
  let openScheduleMenuId = "";

  function refreshSheetUpgradeBanner(caps) {
    if (!sheetUpgradeBanner) return;
    const needsDeploy = caps && caps.needsDeploy;
    sheetUpgradeBanner.hidden = !needsDeploy;
  }

  function bindSheetUpgradeBanner() {
    if (!window.OwlisticSheet) return;
    if (sheetAuthorizeScriptBtn) {
      sheetAuthorizeScriptBtn.addEventListener("click", function () {
        window.open(SHEET_URL, "_blank", "noopener");
        showToast("In the sheet: Extensions → Apps Script → Deploy → Manage deployments → New version → Deploy.");
      });
    }
    if (sheetRecheckScriptBtn) {
      sheetRecheckScriptBtn.addEventListener("click", function () {
        const run = (typeof window.OwlisticSheet.tryMigrateWebApp === "function")
          ? window.OwlisticSheet.tryMigrateWebApp()
          : (typeof window.OwlisticSheet.fetchSheetCapabilities === "function"
            ? window.OwlisticSheet.fetchSheetCapabilities(true)
            : Promise.resolve({ needsDeploy: true }));
        run.then(function (caps) {
          refreshSheetUpgradeBanner(caps);
          if (caps && caps.scheduleSupported) {
            showToast("Schedule sync is ready. Save ORD-003 again.");
            loadFromSheet();
            return;
          }
          showToast("Still waiting for Google Apps Script access.");
        }).catch(function () {
          showToast("Could not verify the Google Apps Script update.");
        });
      });
    }
    if (sheetCopyScriptBtn) {
      sheetCopyScriptBtn.addEventListener("click", function () {
        const source = (window.OwlisticAppsScriptSource || "").trim();
        const copy = (source && navigator.clipboard && navigator.clipboard.writeText)
          ? navigator.clipboard.writeText(source)
          : (typeof window.OwlisticSheet.loadScriptSource === "function"
            ? window.OwlisticSheet.loadScriptSource().then(function (text) {
              return navigator.clipboard.writeText(text || "");
            })
            : Promise.reject());
        Promise.resolve(copy).then(function () {
          showToast("Apps Script copied. Paste in Extensions → Apps Script if needed.");
        }).catch(function () {
          showToast("Could not copy Apps Script automatically.");
        });
      });
    }
    if (sheetOpenScriptBtn) {
      sheetOpenScriptBtn.addEventListener("click", function () {
        window.open(SHEET_URL, "_blank", "noopener");
      });
    }
  }

  function orderNumber(order) {
    const match = String((order && order.id) || "").match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  function badge(status, label) {
    const cls = status === "revision-pending" || status === "on-revision" ? "badge-red"
      : status === "ready-to-approve" ? "badge-gold"
      : status === "completed" || status === "completed" ? "badge-green"
      : status === "paid" ? "badge-green"
      : status === "unpaid" ? "badge-red"
      : "badge-sage";
    return '<span class="badge ' + cls + '">' + label + "</span>";
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatValue(value) {
    if (value === 0 || value === "0") return "0";
    if (value == null || value === "") return "—";
    const number = Number(value);
    if (!isNaN(number)) {
      return number.toLocaleString(undefined, { maximumFractionDigits: 2 });
    }
    return escapeHtml(value);
  }

  function stack(primary, secondary) {
    return '<div class="records-stack"><strong>' + escapeHtml(primary || "—") + "</strong><span>" + escapeHtml(secondary || "—") + "</span></div>";
  }

  function clipText(value) {
    const text = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
    if (!text) return '<span class="muted">—</span>';
    return '<div class="records-clip" title="' + escapeHtml(text) + '">' + escapeHtml(text) + "</div>";
  }

  function normalizeRecordFile(file) {
    if (!file) return null;
    if (typeof file === "string") {
      const parsed = store.parseFileRefs ? store.parseFileRefs(file)[0] : null;
      if (parsed) return normalizeRecordFile(parsed);
      file = { name: file, url: "", id: "" };
    }
    let name = String(file.name || file.fileName || "").trim();
    let url = String(file.url || file.link || "").trim();
    if (!url) {
      const found = name.match(/https?:\/\/\S+/i);
      if (found) {
        url = found[0].replace(/[),.;]+$/, "");
        name = name.replace(found[0], "").replace(/\s*\|\s*$/, "").trim() || name;
      }
    }
    if (/^https?:\/\//i.test(name) && url) {
      const id = (store.driveFileId && store.driveFileId(url)) || "";
      name = id ? "File-" + id.slice(0, 8) : "Download";
    }
    if (!name && url) name = "Download";
    if (!name) return null;
    return {
      name: name,
      url: url,
      id: file.id || "",
      type: file.type || ""
    };
  }

  function requirementFileList(files) {
    if (!files) return [];
    if (typeof files === "string") {
      const parsed = store.parseFileRefs ? store.parseFileRefs(files) : [];
      return parsed.map(normalizeRecordFile).filter(Boolean);
    }
    if (!Array.isArray(files)) return [];
    return files.map(normalizeRecordFile).filter(Boolean);
  }

  function fileDownloadHref(file) {
    return store.fileDownloadUrl ? store.fileDownloadUrl(file) : (file && file.url) || "";
  }

  function fileCardsHtml(files) {
    const list = requirementFileList(files);
    if (!list.length) return "";
    return '<div class="records-files">' + list.map(function (file) {
      const name = escapeHtml(file.name);
      const download = fileDownloadHref(file);
      if (download) {
        return '<div class="records-file-card">' +
          '<a class="records-file-link" href="' + escapeHtml(download) + '" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer" download="' + name + '">' + name + "</a>" +
          "</div>";
      }
      if (file.id) {
        return '<div class="records-file-card">' +
          '<button type="button" class="records-file-link" data-download-file-id="' + escapeHtml(file.id) + '" data-file-name="' + name + '">' + name + "</button>" +
          "</div>";
      }
      return '<div class="records-file-card"><span class="records-file-missing" title="This file was not uploaded to Google Drive. Open the order and re-attach it, then click Save.">' + name + " (not on Drive)</span></div>";
    }).join("") + "</div>";
  }

  function filesCell(files) {
    const html = fileCardsHtml(files);
    return html || '<span class="muted">—</span>';
  }

  function filesCopyText(files) {
    return requirementFileList(files).map(function (file) {
      return file.url ? file.name + " " + file.url : file.name;
    }).join("\n");
  }

  function hasFiles(files) {
    return requirementFileList(files).length > 0;
  }

  function mediaCell(html, copyText, label, filesPresent) {
    return '<td class="records-clip-cell' + (filesPresent ? " records-media-cell" : "") + '">' +
      withCopy(html, copyText, label) +
    "</td>";
  }

  function linkCell(url) {
    const href = String(url == null ? "" : url).trim();
    if (!href) return '<span class="muted">—</span>';
    const safe = /^https?:\/\//i.test(href) ? href : "https://" + href;
    return '<a class="records-link" href="' + escapeHtml(safe) + '" target="_blank" rel="noopener noreferrer" title="' + escapeHtml(href) + '">' + escapeHtml(href) + "</a>";
  }

  function threadPairs(order) {
    const list = store.messageThreadOf ? store.messageThreadOf(order) : (order.messageThread || []);
    if (store.pairMessageThread) return store.pairMessageThread(list);
    return [];
  }

  function repairedMessage(message) {
    if (!message) return null;
    if (store.repairRevisionMessages) {
      return store.repairRevisionMessages([message])[0] || message;
    }
    return message;
  }

  function messageFilled(message) {
    const item = repairedMessage(message);
    if (!item) return false;
    if (String(item.text || "").trim()) return true;
    return hasFiles(item.files);
  }

  function messagePlainText(message) {
    const item = repairedMessage(message);
    return item ? String(item.text || "").replace(/\s+/g, " ").trim() : "";
  }

  function clampText(value, limit) {
    const text = String(value == null ? "" : value).replace(/\s+/g, " ").trim();
    if (!text) return "";
    if (text.length <= limit) return text;
    return text.slice(0, Math.max(0, limit - 1)).trim() + "…";
  }

  function filledPairs(order) {
    return threadPairs(order).filter(function (pair) {
      return messageFilled(pair.buyer) || messageFilled(pair.client);
    }).map(function (pair) {
      return {
        buyer: repairedMessage(pair.buyer),
        client: repairedMessage(pair.client)
      };
    });
  }

  function isImageAttachment(file) {
    if (store.isImageFile) return store.isImageFile(file);
    return /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif)$/i.test(String((file && file.name) || ""));
  }

  function fileExtLabel(file) {
    const name = String((file && file.name) || "");
    const ext = name.indexOf(".") >= 0 ? name.split(".").pop() : "";
    if (ext) return ext.toUpperCase();
    const type = String((file && file.type) || "");
    if (type.indexOf("/") >= 0) return type.split("/")[1].toUpperCase();
    return "FILE";
  }

  function formatBytes(size) {
    const n = Number(size);
    if (!n || n < 0) return "";
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10 * 1024 ? 1 : 0) + " KB";
    return (n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0) + " MB";
  }

  function previewSrc(file) {
    if (store.filePreviewUrl) return store.filePreviewUrl(file) || "";
    return (file && file.url) || "";
  }

  function snippetText(message) {
    const text = clampText(messagePlainText(message), 72);
    if (text) return text;
    if (hasFiles(message && message.files)) return "Sent an attachment";
    return "";
  }

  function chatSummaryHtml(order) {
    const pairs = filledPairs(order);
    if (!pairs.length) {
      return '<div class="records-chat-card is-empty"><p>No conversation yet</p></div>';
    }
    const last = pairs[pairs.length - 1];
    const client = snippetText(last.buyer);
    const seller = snippetText(last.client);
    const round = pairs.length;
    return '<button type="button" class="records-chat-card" data-open-chat="' + escapeHtml(order.id) + '" title="Open full chat" aria-label="Open chat, round ' + round + '">' +
      '<div class="records-chat-mini" aria-hidden="true">' +
        (client
          ? '<div class="records-chat-line is-client"><span class="records-chat-ava">C</span><span class="records-chat-bubble">' + escapeHtml(client) + "</span></div>"
          : "") +
        (seller
          ? '<div class="records-chat-line is-seller"><span class="records-chat-bubble">' + escapeHtml(seller) + '</span><span class="records-chat-ava">S</span></div>'
          : (client ? '<div class="records-chat-line is-wait"><span class="records-chat-bubble">Waiting for seller…</span></div>' : "")) +
      "</div>" +
      '<span class="records-chat-open">Open chat · Round ' + round + "</span>" +
    "</button>";
  }

  function totalChatsHtml(order) {
    const count = filledPairs(order).length;
    if (!count) return '<span class="chat-pairs-pill is-empty">0 chats</span>';
    const label = count === 1 ? "1 chat" : count + " chats";
    return '<span class="chat-pairs-pill">' + escapeHtml(label) + "</span>";
  }

  function attachmentAttrs(file) {
    return ' data-file-name="' + escapeHtml(file.name || "file") + '"' +
      ' data-file-id="' + escapeHtml(file.id || "") + '"' +
      ' data-file-url="' + escapeHtml(fileDownloadHref(file) || "") + '"' +
      ' data-preview-url="' + escapeHtml(previewSrc(file) || fileDownloadHref(file) || "") + '"';
  }

  function shortStamp(iso) {
    if (!iso) return "";
    if (store.formatDateTime) return store.formatDateTime(iso);
    return "";
  }

  function attachmentsHtml(files) {
    const list = requirementFileList(files);
    if (!list.length) return "";
    return '<div class="live-chat-files">' + list.map(function (file) {
      const download = fileDownloadHref(file);
      const missing = !download && !file.id;
      const size = formatBytes(file.size);
      if (isImageAttachment(file)) {
        const src = previewSrc(file) || download;
        return '<div class="live-chat-file is-image">' +
          '<button type="button" class="live-chat-thumb"' + attachmentAttrs(file) + ' data-open-preview title="View image">' +
            (src
              ? '<img class="chat-thumb" alt="' + escapeHtml(file.name) + '" src="' + escapeHtml(src) + '"' + (file.id ? ' data-local-file-id="' + escapeHtml(file.id) + '"' : "") + ">"
              : '<span class="live-chat-file-fallback">IMG</span>') +
          "</button>" +
          '<div class="live-chat-file-copy">' +
            '<p>' + escapeHtml(file.name) + "</p>" +
            (missing
              ? '<span class="records-file-missing">Not on Drive</span>'
              : '<span class="live-chat-file-actions">' +
                  '<button type="button" class="live-chat-file-btn" data-save-file' + attachmentAttrs(file) + ">Download</button>" +
                "</span>") +
          "</div>" +
        "</div>";
      }
      return '<div class="live-chat-file">' +
        '<span class="live-chat-file-fallback" aria-hidden="true">' + escapeHtml(fileExtLabel(file)) + "</span>" +
        '<div class="live-chat-file-copy">' +
          '<p>' + escapeHtml(file.name) + "</p>" +
          '<span>' + escapeHtml(fileExtLabel(file) + (size ? " · " + size : "")) + "</span>" +
          (missing
            ? '<span class="records-file-missing">Not on Drive</span>'
            : '<span class="live-chat-file-actions">' +
                '<button type="button" class="live-chat-file-btn" data-open-file' + attachmentAttrs(file) + ">Open</button>" +
                '<button type="button" class="live-chat-file-btn" data-save-file' + attachmentAttrs(file) + ">Download</button>" +
              "</span>") +
        "</div>" +
      "</div>";
    }).join("") + "</div>";
  }

  function chatMessageBlock(message, roleClass, who) {
    const item = repairedMessage(message);
    const text = item ? String(item.text || "").trim() : "";
    const files = item && item.files;
    const empty = !text && !hasFiles(files);
    const stamp = shortStamp(item && item.createdAt);
    const initial = roleClass === "is-seller" ? "S" : "C";
    if (empty) {
      return '<div class="live-chat-row ' + roleClass + ' is-empty">' +
        '<span class="live-chat-avatar" aria-hidden="true">' + initial + "</span>" +
        '<div class="live-chat-bubble"><p class="live-chat-pending">' + (roleClass === "is-seller" ? "No seller reply yet" : "No client message yet") + "</p></div>" +
      "</div>";
    }
    return '<div class="live-chat-row ' + roleClass + '">' +
      '<span class="live-chat-avatar" aria-hidden="true">' + initial + "</span>" +
      '<div class="live-chat-bubble">' +
        '<div class="live-chat-meta"><span>' + escapeHtml(who) + "</span>" + (stamp ? "<time>" + escapeHtml(stamp) + "</time>" : "") + "</div>" +
        (text ? '<p class="live-chat-text">' + escapeHtml(text) + "</p>" : "") +
        attachmentsHtml(files) +
      "</div>" +
    "</div>";
  }

  function messageCopy(message) {
    if (!message) return "";
    const text = String(message.text || "").trim();
    const files = filesCopyText(message.files);
    if (text && files) return text + "\n" + files;
    return text || files;
  }

  function messageCellHtml(message) {
    if (!message) return '<span class="muted">—</span>';
    if (store.repairRevisionMessages) {
      message = store.repairRevisionMessages([message])[0] || message;
    }
    const text = String(message.text || "").trim();
    const filesHtml = fileCardsHtml(message.files);
    if (!text && !filesHtml) return '<span class="muted">—</span>';
    const textHtml = text ? '<div class="records-clip" title="' + escapeHtml(text) + '">' + escapeHtml(text) + "</div>" : "";
    return '<div class="records-message-cell">' + textHtml + filesHtml + "</div>";
  }

  function maxMessagePairs(orders) {
    let max = 2;
    (orders || []).forEach(function (order) {
      const count = threadPairs(order).length;
      if (count > max) max = count;
    });
    return max;
  }

  function copyButton(text, label) {
    return '<button type="button" class="records-copy-btn" data-copy="' + escapeHtml(text || "") + '" title="Copy ' + escapeHtml(label || "") + '" aria-label="Copy ' + escapeHtml(label || "value") + '">' + COPY_ICON + "</button>";
  }

  function withCopy(html, text, label, extraClass) {
    const title = text ? ' title="' + escapeHtml(text) + '"' : "";
    return '<div class="records-cell-with-copy' + (extraClass ? " " + extraClass : "") + '">' +
      '<div class="records-cell-value"' + title + ">" + html + "</div>" +
      copyButton(text, label) +
    "</div>";
  }

  function editableNameCell(order, field, placeholder, label) {
    const value = String(order[field] || "").trim();
    const display = value
      ? '<span class="records-clip" title="' + escapeHtml(value) + '">' + escapeHtml(value) + "</span>"
      : '<span class="muted records-name-placeholder">' + escapeHtml(placeholder) + "</span>";
    return '<div class="records-cell-with-copy records-editable">' +
      '<div class="records-cell-value" title="' + escapeHtml(value) + '">' + display + "</div>" +
      '<button type="button" class="records-edit-btn" data-edit-field="' + field + '" data-edit-order="' + escapeHtml(order.id) + '" title="Edit ' + escapeHtml(label) + '" aria-label="Edit ' + escapeHtml(label) + '">' + PENCIL_ICON + "</button>" +
      copyButton(value, label) +
    "</div>";
  }

  function tabOf(order) {
    if (typeof store.boardStatusOf === "function") {
      return store.boardStatusOf(order) || "in-progress";
    }
    if (typeof store.recordTab === "function") {
      return store.recordTab(order) || "in-progress";
    }
    const status = store.computeStatus(order);
    if (status === "completed") return "completed";
    if (status === "ready-to-approve") return "ready-to-approve";
    if (status === "revision-pending") return "on-revision";
    return "in-progress";
  }

  function statusSelect(order) {
    const tab = tabOf(order);
    const options = [
      ["in-progress", "New order has to be placed"],
      ["orders-placed", "Orders Placed"],
      ["on-revision", "On Revision"],
      ["ready-to-approve", "Ready to Approve"],
      ["completed", "Completed"]
    ];
    return '<select class="records-status is-' + tab + '" data-status-order="' + escapeHtml(order.id) + '" aria-label="Order status">' +
      options.map(function (item) {
        return '<option value="' + item[0] + '"' + (item[0] === tab ? " selected" : "") + ">" + item[1] + "</option>";
      }).join("") +
      "</select>";
  }

  function statusCopyLabel(order) {
    const tab = tabOf(order);
    if (tab === "in-progress") return "New order has to be placed";
    if (tab === "orders-placed") return "Orders Placed";
    if (tab === "on-revision") return "On Revision";
    if (tab === "ready-to-approve") return "Ready to Approve";
    if (tab === "completed") return "Completed";
    return tab;
  }

  function paymentCopyLabel(order) {
    if (order.paymentStatus === "paid") return "Paid";
    if (order.paymentStatus === "unpaid") return "Unpaid";
    return "";
  }

  function revisionRounds(order) {
    return store.normalizeRevisions((order && order.revisions) || []);
  }

  function revisionRoleText(round, role) {
    const wanted = role === "seller" || role === "client" ? "seller" : "buyer";
    return ((round && round.messages) || []).map(function (message) {
      const messageRole = message && (message.role === "seller" || message.kind === "seller" || message.role === "client")
        ? "seller"
        : "buyer";
      if (messageRole !== wanted) return "";
      return messageCopy(message);
    }).filter(Boolean).join("\n\n");
  }

  function revisionRoleMessages(round, role) {
    const wanted = role === "seller" || role === "client" ? "seller" : "buyer";
    return ((round && round.messages) || []).filter(function (message) {
      const messageRole = message && (message.role === "seller" || message.kind === "seller" || message.role === "client")
        ? "seller"
        : "buyer";
      return messageRole === wanted;
    });
  }

  function revisionRoleHtml(round, role) {
    const messages = revisionRoleMessages(round, role);
    if (!messages.length) return '<span class="muted">—</span>';
    return messages.map(function (message) { return messageCellHtml(message); }).join("");
  }

  function revisionRoleHasFiles(round, role) {
    return revisionRoleMessages(round, role).some(function (message) {
      return hasFiles(message.files);
    });
  }

  function revisionPairs(round) {
    const messages = (round && round.messages) || [];
    if (store.pairMessageThread) return store.pairMessageThread(messages);
    return [];
  }

  function latestRoleSnippet(round, role) {
    const messages = revisionRoleMessages(round, role);
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const text = messagePlainText(messages[i]);
      if (text) return text;
      if (hasFiles(messages[i] && messages[i].files)) return "Sent an attachment";
    }
    return "";
  }

  function revisionStepStates(rounds) {
    let currentSeen = false;
    return (rounds || []).map(function (round, index) {
      const number = round.number || index + 1;
      if (round.completed) return { round: round, number: number, state: "completed" };
      if (!currentSeen) {
        currentSeen = true;
        return { round: round, number: number, state: "current" };
      }
      return { round: round, number: number, state: "pending" };
    });
  }

  function currentRevisionStep(rounds) {
    const steps = revisionStepStates(rounds);
    return steps.filter(function (step) { return step.state === "current"; })[0] || null;
  }

  function revisionProgressHtml(order) {
    const rounds = revisionRounds(order);
    if (!rounds.length) {
      return '<div class="rev-progress is-empty"><span class="rev-step is-wait">No revisions</span></div>';
    }
    const steps = revisionStepStates(rounds);
    return '<div class="rev-progress" aria-label="Revision progress">' + steps.map(function (step, index) {
      const connector = index ? '<span class="rev-progress-line" aria-hidden="true"></span>' : "";
      if (step.state === "completed") {
        return connector +
          '<span class="rev-step is-done" title="Revision ' + step.number + ' completed">' +
            '<span class="rev-step-mark" aria-hidden="true">✓</span>' +
            "R" + step.number + " Completed" +
          "</span>";
      }
      if (step.state === "current") {
        return connector +
          '<button type="button" class="rev-step is-now" data-mark-revision="' + escapeHtml(order.id) + '" data-revision-id="' + escapeHtml(step.round.id) + '" data-revision-number="' + step.number + '" title="Mark Revision ' + step.number + ' as completed">' +
            '<span class="rev-step-mark" aria-hidden="true"></span>' +
            "R" + step.number + " Current" +
          "</button>";
      }
      return connector +
        '<span class="rev-step is-wait" data-pending-revision="' + step.number + '" data-blocked-by="' + (step.number - 1) + '" title="Complete Revision ' + (step.number - 1) + " before Revision " + step.number + '">' +
          "R" + step.number + " Pending" +
        "</span>";
    }).join("") + "</div>";
  }

  function latestRevisionDetailsHtml(order) {
    const rounds = revisionRounds(order);
    if (!rounds.length) {
      return '<div class="rev-latest is-empty"><p>No revision details yet</p></div>';
    }
    const current = currentRevisionStep(rounds);
    const allDone = !current;
    const focus = current ? current.round : rounds[rounds.length - 1];
    const number = current ? current.number : (focus.number || rounds.length);
    const buyer = latestRoleSnippet(focus, "buyer");
    const seller = latestRoleSnippet(focus, "seller");
    const stats = typeof store.subRevisionStats === "function" ? store.subRevisionStats(focus) : { total: 0, completed: 0 };
    const subSummary = stats.total
      ? '<p class="rev-latest-line rev-latest-subcount"><span>Sub revisions</span> ' + stats.completed + "/" + stats.total + " completed</p>"
      : "";
    const latestAt = focus.updatedAt || focus.createdAt || "";
    const latestLine = latestAt
      ? '<p class="rev-latest-meta">Latest update: ' + escapeHtml(shortStamp(latestAt)) + "</p>"
      : "";
    return '<div class="rev-latest">' +
      '<span class="rev-latest-badge' + (allDone ? " is-done" : "") + '">Revision ' + number + "</span>" +
      subSummary +
      '<p class="rev-latest-line"><span>Buyer revision</span> ' + escapeHtml(buyer || "—") + "</p>" +
      '<p class="rev-latest-line"><span>Seller reply</span> ' + escapeHtml(seller || "—") + "</p>" +
      latestLine +
      '<button type="button" class="rev-history-link" data-open-rev-history="' + escapeHtml(order.id) + '">View full revision history</button>' +
    "</div>";
  }

  function maxRevisionCount(orders) {
    let max = 0;
    (orders || []).forEach(function (order) {
      const count = revisionRounds(order).length;
      if (count > max) max = count;
    });
    return max;
  }

  function columnCount(revisionCount) {
    if (activeTab === "on-revision") return 10;
    if (activeTab === "ready-to-approve") return 8;
    if (activeTab === "completed") return 7;
    if (activeTab === "in-progress") return 20;
    if (activeTab === "orders-placed") return 17;
    return 17 + (revisionCount * 2);
  }

  function renderHead(revisionCount) {
    if (activeTab === "on-revision") {
      headRow.innerHTML =
        "<th>Order</th>" +
        "<th>Fiverr ID Name</th>" +
        "<th>Client Name</th>" +
        "<th>Business Name</th>" +
        "<th>Value</th>" +
        "<th>Total Revisions</th>" +
        "<th>Revision Progress</th>" +
        "<th>Latest Revision Details</th>" +
        "<th>Status</th>" +
        "<th>Actions</th>";
      if (table) {
        table.classList.add("is-revision-board");
        table.classList.remove("is-ready-board");
        table.classList.remove("is-completed-board");
        table.style.minWidth = "1240px";
      }
      return;
    }
    if (activeTab === "ready-to-approve") {
      headRow.innerHTML =
        "<th>Order</th>" +
        "<th>Fiverr ID Name</th>" +
        "<th>Client Name</th>" +
        "<th>Business Name</th>" +
        "<th>Value</th>" +
        "<th>Review Text (Feedback)</th>" +
        "<th>Status</th>" +
        "<th>Actions</th>";
      if (table) {
        table.classList.remove("is-revision-board");
        table.classList.add("is-ready-board");
        table.classList.remove("is-completed-board");
        table.style.minWidth = "1080px";
      }
      return;
    }
    if (activeTab === "completed") {
      headRow.innerHTML =
        "<th>Order</th>" +
        "<th>Fiverr ID Name</th>" +
        "<th>Client Name</th>" +
        "<th>Business Name</th>" +
        "<th>Value</th>" +
        "<th>Status</th>" +
        "<th>Actions</th>";
      if (table) {
        table.classList.remove("is-revision-board");
        table.classList.remove("is-ready-board");
        table.classList.add("is-completed-board");
        table.style.minWidth = "920px";
      }
      return;
    }
    if (table) {
      table.classList.remove("is-revision-board");
      table.classList.remove("is-ready-board");
      table.classList.remove("is-completed-board");
    }
    const hideRevisionColumns = activeTab === "in-progress" || activeTab === "orders-placed";
    const showScheduleColumns = activeTab === "in-progress";
    const revisionHeads = [];
    if (!hideRevisionColumns) {
      for (let i = 1; i <= revisionCount; i += 1) {
        revisionHeads.push("<th>Revision " + i + " Buyer</th>");
        revisionHeads.push("<th>Revision " + i + " Seller</th>");
      }
    }
    headRow.innerHTML =
      "<th>Order</th>" +
      "<th>WhatsApp Number</th>" +
      "<th>Name</th>" +
      "<th>Fiverr ID Name</th>" +
      "<th>Fiverr GIG URL</th>" +
      "<th>Client Name</th>" +
      "<th>Business Name</th>" +
      "<th>Value</th>" +
      "<th>Type</th>" +
      "<th>Chat Summary</th>" +
      "<th>Total Chats</th>" +
      "<th>Direct Order Requirements</th>" +
      "<th>Requirement Files</th>" +
      "<th>Review Text (Feedback)</th>" +
      revisionHeads.join("") +
      "<th>Payment</th>" +
      "<th>Status</th>" +
      (showScheduleColumns ? "<th>Place On</th><th>Placement Status</th><th>Action</th>" : "") +
      "<th>Actions</th>";
    if (table) table.style.minWidth = String((hideRevisionColumns ? (showScheduleColumns ? 2180 : 1760) : 1760) + (hideRevisionColumns ? 0 : revisionCount * 360)) + "px";
  }

  function renderAccountFilter() {
    const previous = accountFilter.value;
    accountFilter.innerHTML = '<option value="">All accounts</option>';
    const accounts = auth.visibleAccounts();
    accounts.forEach(function (account) {
      const option = document.createElement("option");
      option.value = account.id;
      option.textContent = store.accountLabel(account);
      accountFilter.appendChild(option);
    });
    if (!auth.isSuperAdmin()) {
      const field = document.getElementById("filter-account-field");
      if (field) field.hidden = true;
      accountFilter.value = "";
    } else if (previous) {
      accountFilter.value = previous;
    }
  }

  function scheduleActor() {
    const current = (auth.getSession && auth.getSession()) || session;
    if (!current) return "";
    return String(current.name || current.username || "").trim();
  }

  function placeOnLabel(order) {
    const status = store.placementStatusOf ? store.placementStatusOf(order) : (order.placementStatus || "Unscheduled");
    if (status === "On Hold" || status === "Unscheduled" || !order.placeOn) return "—";
    return store.formatPlaceOn ? store.formatPlaceOn(order.placeOn) : order.placeOn;
  }

  function placementPill(order) {
    const status = store.placementStatusOf ? store.placementStatusOf(order) : (order.placementStatus || "Unscheduled");
    const cls = status === "Place Today" ? "is-today"
      : status === "Scheduled" ? "is-scheduled"
      : status === "Later" ? "is-later"
      : status === "On Hold" ? "is-hold"
      : status === "Overdue" ? "is-overdue"
      : status === "Placed" ? "is-placed"
      : "is-unscheduled";
    return '<span class="placement-pill ' + cls + '"><i></i>' + escapeHtml(status) + "</span>";
  }

  function placeOnCell(order) {
    return '<button type="button" class="schedule-place-btn" data-schedule-do="open" data-schedule-order="' + escapeHtml(order.id) + '">' +
      CAL_ICON + escapeHtml(placeOnLabel(order)) +
    "</button>";
  }

  function scheduleActionHtml(order) {
    const status = store.placementStatusOf ? store.placementStatusOf(order) : (order.placementStatus || "Unscheduled");
    let primaryLabel = "Schedule";
    let primaryAction = "open";
    if (status !== "Unscheduled") {
      primaryLabel = "Edit Schedule";
      primaryAction = "open";
    }
    const open = openScheduleMenuId === order.id;
    return '<div class="schedule-action-wrap">' +
      '<button type="button" class="schedule-action-btn' + (status === "Placed" ? " is-placed" : "") + '" data-schedule-do="' + primaryAction + '" data-schedule-order="' + escapeHtml(order.id) + '">' +
        escapeHtml(primaryLabel) +
      "</button>" +
      '<button type="button" class="schedule-action-btn is-menu" data-toggle-schedule-menu="' + escapeHtml(order.id) + '" aria-label="More schedule actions">▾</button>' +
      '<div class="schedule-menu"' + (open ? "" : " hidden") + ' data-schedule-menu="' + escapeHtml(order.id) + '">' +
        '<button type="button" data-schedule-do="open" data-schedule-order="' + escapeHtml(order.id) + '">Schedule Order</button>' +
        '<button type="button" data-schedule-do="open" data-schedule-order="' + escapeHtml(order.id) + '">Edit Schedule</button>' +
        '<button type="button" data-schedule-do="clear" data-schedule-order="' + escapeHtml(order.id) + '">Remove Schedule</button>' +
        '<button type="button" data-schedule-do="hold" data-schedule-order="' + escapeHtml(order.id) + '">Put On Hold</button>' +
        '<button type="button" data-schedule-do="placed" data-schedule-order="' + escapeHtml(order.id) + '">Mark Placed</button>' +
      "</div>" +
    "</div>";
  }

  function scheduleRowClass(order, status, extra) {
    let cls = "records-row is-" + status;
    if (extra) cls += " " + extra;
    if (activeTab === "in-progress" && store.isScheduleOverdue && store.isScheduleOverdue(order)) {
      cls += " is-schedule-overdue";
    }
    return cls;
  }

  function scheduleCells(order) {
    return "<td>" + placeOnCell(order) + "</td>" +
      "<td>" + placementPill(order) + "</td>" +
      "<td>" + scheduleActionHtml(order) + "</td>";
  }

  function matchesBaseFilters(order) {
    const query = (search.value || "").trim().toLowerCase();
    const created = order.createdAt ? order.createdAt.slice(0, 10) : "";
    if (dateFilter.value && created !== dateFilter.value) return false;
    if (accountFilter.value && order.accountId !== accountFilter.value) return false;
    if (paymentFilter.value && order.paymentStatus !== paymentFilter.value) return false;
    const revisionRounds = store.normalizeRevisions(order.revisions || []);
    const hasRevisions = revisionRounds.length > 0;
    if (revisionFilter.value === "pending" && !hasRevisions) return false;
    if (revisionFilter.value === "completed" && !hasRevisions) return false;
    if (revisionFilter.value === "none" && hasRevisions) return false;
    if (readyFilter.value === "yes" && !order.readyToApprove) return false;
    if (readyFilter.value === "no" && order.readyToApprove) return false;
    if (!query) return true;
    const messages = threadPairs(order).map(function (pair) {
      return messageCopy(pair.buyer) + " " + messageCopy(pair.client);
    }).join(" ");
    const haystack = [
      order.id,
      order.fiverrId,
      order.name,
      order.businessName,
      order.clientName,
      order.whatsapp,
      order.accountName,
      order.messageText,
      messages,
      revisionRounds.map(function (round) {
        return revisionRoleText(round, "buyer") + " " + revisionRoleText(round, "seller");
      }).join(" "),
      order.directRequirements,
      order.fiverrGigUrl,
      order.reviewText,
      order.placeOn,
      store.placementStatusOf ? store.placementStatusOf(order) : (order.placementStatus || ""),
      requirementFileList(order.requirementFiles).map(function (file) { return file.name; }).join(" ")
    ]
      .join(" ")
      .toLowerCase();
    return haystack.indexOf(query) !== -1;
  }

  function matchesFilters(order) {
    if (!matchesBaseFilters(order)) return false;
    if (activeTab !== "in-progress") return true;
    const placeOnValue = placeOnFilter && placeOnFilter.value ? placeOnFilter.value : "";
    const date = store.ymd ? store.ymd(order.placeOn) : String(order.placeOn || "").slice(0, 10);
    if (placeOnValue && date !== placeOnValue) return false;
    if (scheduleFilter) {
      const bucket = store.placementBucket ? store.placementBucket(order) : "";
      if (bucket !== scheduleFilter) return false;
    }
    return true;
  }

  function setActiveTab(tab) {
    activeTab = tab;
    tabButtons.forEach(function (button) {
      const selected = button.getAttribute("data-tab") === tab;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-selected", selected ? "true" : "false");
    });
    if (tab === "hanif-costing") {
      if (window.OwlisticHanifCosting) {
        window.OwlisticHanifCosting.onTabActivated(store.getOrders ? store.getOrders() : auth.visibleOrders());
      }
      return;
    }
    if (window.OwlisticHanifCosting) window.OwlisticHanifCosting.onTabDeactivated();
    render();
  }

  function updateTabCounts(all) {
    const counts = { "in-progress": 0, "orders-placed": 0, "on-revision": 0, "ready-to-approve": 0, completed: 0 };
    all.forEach(function (order) {
      const tab = tabOf(order);
      if (counts[tab] != null) counts[tab] += 1;
    });
    document.querySelectorAll("[data-tab-count]").forEach(function (el) {
      const key = el.getAttribute("data-tab-count");
      el.textContent = String(counts[key] || 0);
    });
    if (window.OwlisticHanifCosting) {
      window.OwlisticHanifCosting.onOrdersLoaded(all);
    }
  }

  function updateAccountSummary(inProgress) {
    if (!scheduleAccountSummary) return;
    if (activeTab !== "in-progress" || !accountFilter.value) {
      scheduleAccountSummary.hidden = true;
      scheduleAccountSummary.textContent = "";
      return;
    }
    const account = (auth.visibleAccounts() || []).find(function (item) {
      return item.id === accountFilter.value;
    });
    const label = account ? store.accountLabel(account) : accountFilter.options[accountFilter.selectedIndex].text;
    const scoped = (inProgress || []).filter(function (order) {
      return order.accountId === accountFilter.value;
    });
    const counts = { today: 0, tomorrow: 0, later: 0, unscheduled: 0, hold: 0 };
    scoped.forEach(function (order) {
      const bucket = store.placementBucket ? store.placementBucket(order) : "unscheduled";
      if (counts[bucket] != null) counts[bucket] += 1;
    });
    scheduleAccountSummary.hidden = false;
    scheduleAccountSummary.textContent = label + " — " +
      counts.today + " scheduled today · " +
      counts.tomorrow + " tomorrow · " +
      counts.later + " later · " +
      counts.unscheduled + " unscheduled · " +
      counts.hold + " on hold";
  }

  function updateScheduleChrome(all, shown) {
    const show = activeTab === "in-progress";
    if (scheduleSummary) scheduleSummary.hidden = !show;
    if (scheduleFilterRow) scheduleFilterRow.hidden = !show;
    document.querySelectorAll("[data-schedule-filter]").forEach(function (el) {
      el.classList.toggle("is-active", show && scheduleFilter && el.getAttribute("data-schedule-filter") === scheduleFilter);
    });
    if (!show) {
      if (scheduleAccountSummary) {
        scheduleAccountSummary.hidden = true;
        scheduleAccountSummary.textContent = "";
      }
      return;
    }
    const inProgress = (all || []).filter(function (order) {
      return tabOf(order) === "in-progress" && matchesBaseFilters(order);
    });
    const counts = { today: 0, tomorrow: 0, later: 0, unscheduled: 0, hold: 0 };
    inProgress.forEach(function (order) {
      const bucket = store.placementBucket ? store.placementBucket(order) : "unscheduled";
      if (counts[bucket] != null) counts[bucket] += 1;
    });
    document.querySelectorAll("[data-schedule-count]").forEach(function (el) {
      const key = el.getAttribute("data-schedule-count");
      el.textContent = String(counts[key] || 0);
    });
    const totalEl = document.getElementById("schedule-total-count");
    const showingEl = document.getElementById("schedule-showing-copy");
    if (totalEl) totalEl.textContent = String(inProgress.length);
    if (showingEl) showingEl.textContent = "Showing " + (shown || []).length + " of " + inProgress.length;
    updateAccountSummary(inProgress);
  }

  function markFilterFields() {
    const fields = [
      [search, "search"],
      [dateFilter, "date"],
      [accountFilter, "account"],
      [paymentFilter, "payment"],
      [revisionFilter, "revision"],
      [readyFilter, "ready"],
      [placeOnFilter, "placeOn"]
    ];
    let active = Boolean(scheduleFilter);
    fields.forEach(function (item) {
      const input = item[0];
      if (!input) return;
      const filled = Boolean(String(input.value || "").trim());
      const wrap = input.closest(".records-field");
      if (wrap) wrap.classList.toggle("is-filled", filled);
      if (filled) active = true;
    });
    if (scheduleClearAll) scheduleClearAll.classList.toggle("is-active", active);
  }

  function orderActionCells(order) {
    return '<td class="records-actions">' +
      '<a class="open-link" href="view-order.html?order=' + encodeURIComponent(order.id) + '">View</a>' +
      '<a class="open-link" href="index.html?order=' + encodeURIComponent(order.id) + '">Edit</a>' +
      '<button type="button" class="ghost-btn is-danger" data-delete-order="' + escapeHtml(order.id) + '">Delete</button>' +
    "</td>";
  }

  function render() {
    if (activeTab === "hanif-costing") return;
    const all = auth.visibleOrders();
    updateTabCounts(all);
    closeCompletePop();
    const revisionCount = maxRevisionCount(all);
    renderHead(revisionCount);
    const orders = all.slice().sort(function (a, b) {
      const na = orderNumber(a);
      const nb = orderNumber(b);
      if (na !== nb) return na - nb;
      return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
    }).filter(function (order) {
      return tabOf(order) === activeTab && matchesFilters(order);
    });
    updateScheduleChrome(all, orders);
    markFilterFields();

    const noun = orders.length === 1 ? "order" : "orders";
    countEl.textContent = orders.length + " " + noun;

    if (!orders.length) {
      const tabLabel = TAB_LABELS[activeTab] || activeTab;
      body.innerHTML =
        '<tr><td colspan="' + columnCount(revisionCount) + '"><div class="empty-state">' +
          "<strong>No " + escapeHtml(tabLabel) + " orders</strong>" +
          "<p>Orders in this category will appear here. Try another tab, or clear a filter.</p>" +
        "</div></td></tr>";
      return;
    }

    body.innerHTML = orders.map(function (order) {
      const status = store.computeStatus(order);
      const rounds = revisionRounds(order);
      const paymentLabel = paymentCopyLabel(order);
      const typeLabel = store.orderTypeLabel(order);
      const statusLabel = statusCopyLabel(order);
      const actions = orderActionCells(order);
      if (activeTab === "ready-to-approve") {
        return '<tr class="records-row is-' + status + '">' +
          "<td>" + withCopy(stack(order.id, store.formatDate(order.createdAt)), order.id || "", "order ID") + "</td>" +
          "<td>" + withCopy(escapeHtml(order.fiverrId || "—"), order.fiverrId || "", "Fiverr ID name") + "</td>" +
          "<td>" + editableNameCell(order, "clientName", "Add client name", "client name") + "</td>" +
          "<td>" + editableNameCell(order, "businessName", "Add business name", "business name") + "</td>" +
          '<td class="records-value">' + withCopy(formatValue(order.orderValue), order.orderValue == null ? "" : String(order.orderValue), "value") + "</td>" +
          '<td class="records-clip-cell">' + withCopy(clipText(order.reviewText), order.reviewText || "", "review text") + "</td>" +
          "<td>" + withCopy(statusSelect(order), statusLabel, "status") + "</td>" +
          actions +
        "</tr>";
      }
      if (activeTab === "completed") {
        return '<tr class="records-row is-' + status + '">' +
          "<td>" + withCopy(stack(order.id, store.formatDate(order.createdAt)), order.id || "", "order ID") + "</td>" +
          "<td>" + withCopy(escapeHtml(order.fiverrId || "—"), order.fiverrId || "", "Fiverr ID name") + "</td>" +
          "<td>" + editableNameCell(order, "clientName", "Add client name", "client name") + "</td>" +
          "<td>" + editableNameCell(order, "businessName", "Add business name", "business name") + "</td>" +
          '<td class="records-value">' + withCopy(formatValue(order.orderValue), order.orderValue == null ? "" : String(order.orderValue), "value") + "</td>" +
          "<td>" + withCopy(statusSelect(order), statusLabel, "status") + "</td>" +
          actions +
        "</tr>";
      }
      if (activeTab === "on-revision") {
        return '<tr class="records-row is-' + status + ' is-revision-board">' +
          "<td>" + withCopy(stack(order.id, store.formatDate(order.createdAt)), order.id || "", "order ID") + "</td>" +
          "<td>" + withCopy(escapeHtml(order.fiverrId || "—"), order.fiverrId || "", "Fiverr ID name") + "</td>" +
          "<td>" + editableNameCell(order, "clientName", "Add client name", "client name") + "</td>" +
          "<td>" + editableNameCell(order, "businessName", "Add business name", "business name") + "</td>" +
          '<td class="records-value">' + withCopy(formatValue(order.orderValue), order.orderValue == null ? "" : String(order.orderValue), "value") + "</td>" +
          '<td class="records-rev-total">' + withCopy(String(rounds.length), String(rounds.length), "total revisions") + "</td>" +
          '<td class="records-rev-progress-cell">' + revisionProgressHtml(order) + "</td>" +
          '<td class="records-rev-latest-cell">' + latestRevisionDetailsHtml(order) + "</td>" +
          "<td>" + withCopy(statusSelect(order), statusLabel, "status") + "</td>" +
          actions +
        "</tr>";
      }
      let revisionCells = "";
      if (activeTab !== "in-progress" && activeTab !== "orders-placed") {
        for (let r = 0; r < revisionCount; r += 1) {
          const round = rounds[r];
          const buyerText = revisionRoleText(round, "buyer");
          const sellerText = revisionRoleText(round, "seller");
          const revLabel = "Revision " + (r + 1);
          revisionCells +=
            mediaCell(revisionRoleHtml(round, "buyer"), buyerText, revLabel + " buyer", revisionRoleHasFiles(round, "buyer")) +
            mediaCell(revisionRoleHtml(round, "seller"), sellerText, revLabel + " seller", revisionRoleHasFiles(round, "seller"));
        }
      }
      return '<tr class="' + scheduleRowClass(order, status, "") + '">' +
        "<td>" + withCopy(stack(order.id, store.formatDate(order.createdAt)), order.id || "", "order ID") + "</td>" +
        "<td>" + withCopy(escapeHtml(order.whatsapp || "—"), order.whatsapp || "", "WhatsApp number") + "</td>" +
        "<td>" + withCopy(escapeHtml(order.name || "—"), order.name || "", "name") + "</td>" +
        "<td>" + withCopy(escapeHtml(order.fiverrId || "—"), order.fiverrId || "", "Fiverr ID name") + "</td>" +
        '<td class="records-clip-cell">' + withCopy(linkCell(order.fiverrGigUrl), order.fiverrGigUrl || "", "Fiverr GIG URL") + "</td>" +
        "<td>" + editableNameCell(order, "clientName", "Add client name", "client name") + "</td>" +
        "<td>" + editableNameCell(order, "businessName", "Add business name", "business name") + "</td>" +
        '<td class="records-value">' + withCopy(formatValue(order.orderValue), order.orderValue == null ? "" : String(order.orderValue), "value") + "</td>" +
        "<td>" + withCopy(escapeHtml(typeLabel || "—"), typeLabel || "", "type") + "</td>" +
        '<td class="records-chat-cell">' + chatSummaryHtml(order) + "</td>" +
        '<td class="records-chat-cell records-chat-total">' + totalChatsHtml(order) + "</td>" +
        '<td class="records-clip-cell">' + withCopy(clipText(order.directRequirements), order.directRequirements || "", "direct order requirements") + "</td>" +
        mediaCell(filesCell(order.requirementFiles), filesCopyText(order.requirementFiles), "requirement files", hasFiles(order.requirementFiles)) +
        '<td class="records-clip-cell">' + withCopy(clipText(order.reviewText), order.reviewText || "", "review text") + "</td>" +
        revisionCells +
        "<td>" + withCopy(badge(order.paymentStatus || "in-progress", paymentLabel || "—"), paymentLabel, "payment") + "</td>" +
        "<td>" + withCopy(statusSelect(order), statusLabel, "status") + "</td>" +
        (activeTab === "in-progress" ? scheduleCells(order) : "") +
        actions +
      "</tr>";
    }).join("");
    bindLocalFileDownloads();
  }

  function bindLocalFileDownloads() {
    document.querySelectorAll("[data-download-file-id]").forEach(function (button) {
      if (button.tagName !== "BUTTON" || button.getAttribute("data-bound") === "1") return;
      button.setAttribute("data-bound", "1");
      button.addEventListener("click", function () {
        const id = button.getAttribute("data-download-file-id");
        if (!id || typeof store.getFile !== "function") return;
        store.getFile(id).then(function (record) {
          const blob = record && record.blob;
          if (!blob) return;
          const link = document.createElement("a");
          link.href = URL.createObjectURL(blob);
          link.download = button.getAttribute("data-file-name") || (record && record.name) || "file";
          document.body.appendChild(link);
          link.click();
          link.remove();
        });
      });
    });
  }

  const chatDrawer = document.getElementById("chat-drawer");
  const chatDrawerBody = document.getElementById("chat-drawer-body");
  const chatDrawerTitle = document.getElementById("chat-drawer-title");
  const chatDrawerSub = document.getElementById("chat-drawer-sub");
  const revHistoryDrawer = document.getElementById("rev-history-drawer");
  const revHistoryBody = document.getElementById("rev-history-body");
  const revHistoryTitle = document.getElementById("rev-history-title");
  const revHistorySub = document.getElementById("rev-history-sub");
  const revCompletePop = document.getElementById("rev-complete-pop");
  const revCompleteCopy = document.getElementById("rev-complete-copy");
  const chatLightbox = document.getElementById("chat-lightbox");
  const chatLightboxImage = document.getElementById("chat-lightbox-image");
  const chatLightboxName = document.getElementById("chat-lightbox-name");
  let lightboxFile = null;
  let pendingComplete = null;

  function fileFromButton(el) {
    if (!el) return null;
    return {
      name: el.getAttribute("data-file-name") || "file",
      id: el.getAttribute("data-file-id") || "",
      url: el.getAttribute("data-file-url") || "",
      previewUrl: el.getAttribute("data-preview-url") || ""
    };
  }

  function saveBlob(blob, name) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name || "file";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(link.href); }, 1500);
  }

  function downloadAttachment(file) {
    if (!file) return;
    const name = file.name || "file";
    const href = fileDownloadHref(file) || file.url || file.previewUrl || "";
    function fallback() {
      if (!href) {
        showToast("This file is not on Drive. Re-attach it on the order form.");
        return;
      }
      const link = document.createElement("a");
      link.href = href;
      link.download = name;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      link.remove();
    }
    if (file.id && typeof store.getFile === "function") {
      store.getFile(file.id).then(function (record) {
        if (record && record.blob) {
          saveBlob(record.blob, record.name || name);
          return;
        }
        if (!href) {
          fallback();
          return;
        }
        return fetch(href, { mode: "cors", credentials: "omit" }).then(function (response) {
          if (!response.ok) throw new Error("download");
          return response.blob();
        }).then(function (blob) {
          saveBlob(blob, name);
        }).catch(fallback);
      }).catch(fallback);
      return;
    }
    if (href) {
      fetch(href, { mode: "cors", credentials: "omit" }).then(function (response) {
        if (!response.ok) throw new Error("download");
        return response.blob();
      }).then(function (blob) {
        saveBlob(blob, name);
      }).catch(fallback);
      return;
    }
    fallback();
  }

  function openAttachment(file) {
    if (!file) return;
    const href = fileDownloadHref(file) || file.url || file.previewUrl || "";
    if (file.id && typeof store.getFile === "function") {
      store.getFile(file.id).then(function (record) {
        if (record && record.blob) {
          window.open(URL.createObjectURL(record.blob), "_blank", "noopener");
          return;
        }
        if (href) window.open(href, "_blank", "noopener");
        else showToast("This file is not on Drive. Re-attach it on the order form.");
      }).catch(function () {
        if (href) window.open(href, "_blank", "noopener");
      });
      return;
    }
    if (href) window.open(href, "_blank", "noopener");
    else showToast("This file is not on Drive. Re-attach it on the order form.");
  }

  function hydrateLocalThumbs(root) {
    if (!root || typeof store.getFile !== "function") return;
    root.querySelectorAll("img[data-local-file-id]").forEach(function (img) {
      const id = img.getAttribute("data-local-file-id");
      if (!id) return;
      store.getFile(id).then(function (record) {
        if (!record || !record.blob) return;
        img.src = URL.createObjectURL(record.blob);
      }).catch(function () {});
    });
  }

  function closeLightbox() {
    if (chatLightbox) chatLightbox.hidden = true;
    lightboxFile = null;
    if (chatLightboxImage) chatLightboxImage.removeAttribute("src");
  }

  function openLightbox(file) {
    if (!file || !chatLightbox) return;
    lightboxFile = file;
    const src = file.previewUrl || fileDownloadHref(file) || file.url || "";
    if (chatLightboxName) chatLightboxName.textContent = file.name || "Image";
    if (chatLightboxImage) {
      chatLightboxImage.alt = file.name || "Image preview";
      chatLightboxImage.src = src;
    }
    chatLightbox.hidden = false;
    if (file.id && typeof store.getFile === "function") {
      store.getFile(file.id).then(function (record) {
        if (record && record.blob && chatLightboxImage) {
          chatLightboxImage.src = URL.createObjectURL(record.blob);
        }
      }).catch(function () {});
    }
  }

  function closeChat() {
    if (chatDrawer) chatDrawer.hidden = true;
    if (!revHistoryDrawer || revHistoryDrawer.hidden) document.body.classList.remove("modal-open");
    closeLightbox();
  }

  function closeRevHistory() {
    if (window.OwlisticRevisionSub && typeof window.OwlisticRevisionSub.closeDrawer === "function") {
      window.OwlisticRevisionSub.closeDrawer();
    } else if (revHistoryDrawer) {
      revHistoryDrawer.hidden = true;
    }
    if (!chatDrawer || chatDrawer.hidden) document.body.classList.remove("modal-open");
    closeLightbox();
  }

  function closeCompletePop() {
    pendingComplete = null;
    if (revCompletePop) revCompletePop.hidden = true;
  }

  function historyMessageHtml(message, role, label) {
    const item = repairedMessage(message);
    const text = item ? String(item.text || "").trim() : "";
    const files = item && item.files;
    const empty = !text && !hasFiles(files);
    return '<div class="rev-history-msg is-' + role + '">' +
      "<h4>" + escapeHtml(label) + "</h4>" +
      (empty
        ? '<p class="rev-history-empty">No message yet</p>'
        : (text ? "<p>" + escapeHtml(text) + "</p>" : "")) +
      attachmentsHtml(files) +
    "</div>";
  }

  function openRevHistory(orderId) {
    if (window.OwlisticRevisionSub && typeof window.OwlisticRevisionSub.openDrawer === "function") {
      window.OwlisticRevisionSub.openDrawer(orderId);
      return;
    }
    const order = store.getOrder(orderId);
    if (!order || !revHistoryDrawer || !revHistoryBody) return;
    closeChat();
    closeCompletePop();
    const rounds = revisionRounds(order);
    const steps = revisionStepStates(rounds);
    const who = order.clientName || order.name || "Client";
    if (revHistoryTitle) revHistoryTitle.textContent = order.id;
    if (revHistorySub) {
      revHistorySub.textContent = who + " · " + (rounds.length === 1 ? "1 revision" : rounds.length + " revisions");
    }
    if (!rounds.length) {
      revHistoryBody.innerHTML = '<p class="live-chat-empty">No revisions on this order yet.</p>';
    } else {
      revHistoryBody.innerHTML = steps.map(function (step) {
        const pairs = revisionPairs(step.round);
        const statusLabel = step.state === "completed" ? "Completed" : step.state === "current" ? "Current" : "Pending";
        const body = pairs.length
          ? pairs.map(function (pair, index) {
              return '<div class="rev-history-pair">' +
                (pairs.length > 1 ? '<p class="rev-history-pair-label">Message ' + (index + 1) + "</p>" : "") +
                historyMessageHtml(pair.buyer, "buyer", "Buyer revision") +
                historyMessageHtml(pair.client, "seller", "Seller reply") +
              "</div>";
            }).join("")
          : historyMessageHtml(null, "buyer", "Buyer revision") + historyMessageHtml(null, "seller", "Seller reply");
        return '<section class="rev-history-round is-' + step.state + '">' +
          '<header class="rev-history-round-head">' +
            "<h3>Revision " + step.number + "</h3>" +
            '<span class="rev-history-status is-' + step.state + '">' + statusLabel + "</span>" +
          "</header>" +
          body +
        "</section>";
      }).join("");
    }
    revHistoryDrawer.hidden = false;
    document.body.classList.add("modal-open");
    hydrateLocalThumbs(revHistoryBody);
    revHistoryBody.querySelectorAll("img.chat-thumb").forEach(function (img) {
      img.addEventListener("error", function () {
        const fallback = document.createElement("span");
        fallback.className = "live-chat-file-fallback";
        fallback.textContent = "IMG";
        img.replaceWith(fallback);
      });
    });
  }

  function openCompletePop(button) {
    const orderId = button.getAttribute("data-mark-revision");
    const revisionId = button.getAttribute("data-revision-id");
    const number = button.getAttribute("data-revision-number") || "1";
    pendingComplete = { orderId: orderId, revisionId: revisionId, number: number };
    if (revCompleteCopy) revCompleteCopy.textContent = "Mark Revision " + number + " as Completed?";
    if (!revCompletePop) return;
    revCompletePop.hidden = false;
    const inDrawer = button.closest("#rev-history-drawer");
    if (inDrawer) {
      revCompletePop.style.left = Math.max(12, (window.innerWidth - 260) / 2) + "px";
      revCompletePop.style.top = Math.max(12, (window.innerHeight - 140) / 2) + "px";
      return;
    }
    const rect = button.getBoundingClientRect();
    const left = Math.min(Math.max(12, rect.left), window.innerWidth - 280);
    const top = Math.min(rect.bottom + 8, window.innerHeight - 140);
    revCompletePop.style.left = left + "px";
    revCompletePop.style.top = top + "px";
  }

  function applyRevisionCompleted(order, revisionId, completed, revisionNumber) {
    const canSee = auth.canSeeOrder;
    if (!order || (typeof canSee === "function" && !canSee.call(auth, order))) return;
    const rounds = revisionRounds(order);
    let index = rounds.findIndex(function (round) { return String(round.id) === String(revisionId); });
    if (index < 0 && revisionNumber) {
      index = rounds.findIndex(function (round) { return Number(round.number) === Number(revisionNumber); });
    }
    if (completed) {
      if (index < 0) {
        showToast("Could not find the revision to complete.");
        return;
      }
      const previousOpen = rounds.slice(0, index).some(function (round) { return !round.completed; });
      if (previousOpen) {
        showToast("Complete Revision " + index + " first.");
        return;
      }
    }
    let saved = false;
    if (typeof store.setRevisionCompleted === "function") {
      saved = store.setRevisionCompleted(order, revisionId, completed, revisionNumber);
    } else {
      (order.revisions || []).forEach(function (round) {
        if (String(round.id) === String(revisionId) || (revisionNumber && Number(round.number) === Number(revisionNumber))) {
          round.completed = completed;
          saved = true;
        }
      });
    }
    if (!saved) {
      showToast("Could not find the revision to complete.");
      return;
    }
    store.upsertOrder(order);
    const remaining = revisionRounds(order).filter(function (item) { return !item.completed; }).length;
    closeCompletePop();
    render();
    const finish = function () {
      render();
      if (revHistoryDrawer && !revHistoryDrawer.hidden && order && window.OwlisticRevisionSub) {
        window.OwlisticRevisionSub.openDrawer(order.id);
      }
      if (!completed) {
        showToast("Revision marked open");
      } else if (remaining) {
        showToast("Revision completed. The next revision is now current.");
      } else {
        showToast("All revisions complete. Set status to Ready to Approve when it is ready.");
      }
    };
    const sheet = window.OwlisticSheet;
    if (sheet && typeof sheet.syncRevisionsData === "function") {
      sheet.syncRevisionsData(order).then(finish).catch(finish);
      return;
    }
    if (sheet && typeof sheet.sync === "function") {
      sheet.sync(order, { skipUploads: true }).then(finish).catch(finish);
      return;
    }
    finish();
  }

  function openChat(orderId) {
    const order = store.getOrder(orderId);
    if (!order || !chatDrawer || !chatDrawerBody) return;
    closeRevHistory();
    closeCompletePop();
    const pairs = filledPairs(order);
    const who = order.clientName || order.name || "Client";
    if (chatDrawerTitle) chatDrawerTitle.textContent = order.id;
    if (chatDrawerSub) {
      chatDrawerSub.textContent = who + (pairs.length
        ? " · " + pairs.length + (pairs.length === 1 ? " round" : " rounds")
        : " · No messages yet");
    }
    if (!pairs.length) {
      chatDrawerBody.innerHTML = '<div class="live-chat"><p class="live-chat-empty">No messages on this order yet.</p></div>';
    } else {
      chatDrawerBody.innerHTML = '<div class="live-chat">' + pairs.map(function (pair, index) {
        const number = index + 1;
        const current = index === pairs.length - 1;
        return '<section class="live-chat-round">' +
          '<p class="live-chat-divider"><span>Round ' + number + (current ? " · Now" : "") + "</span></p>" +
          chatMessageBlock(pair.buyer, "is-client", "Client") +
          chatMessageBlock(pair.client, "is-seller", "Seller") +
        "</section>";
      }).join("") + "</div>";
    }
    chatDrawer.hidden = false;
    document.body.classList.add("modal-open");
    hydrateLocalThumbs(chatDrawerBody);
    if (chatDrawerBody.scrollHeight) chatDrawerBody.scrollTop = chatDrawerBody.scrollHeight;
    chatDrawerBody.querySelectorAll("img.chat-thumb").forEach(function (img) {
      img.addEventListener("error", function () {
        const fallback = document.createElement("span");
        fallback.className = "live-chat-file-fallback";
        fallback.textContent = "IMG";
        img.replaceWith(fallback);
      });
    });
  }

  function applySheetOrders(result) {
    if (!result || result.skipped) return;
    const list = result.orders || [];
    const repairBefore = {};
    list.forEach(function (order) {
      if (!order || !order.id) return;
      repairBefore[order.id] = {
        fiverrId: order.fiverrId || "",
        fiverrGigUrl: order.fiverrGigUrl || "",
        whatsapp: order.whatsapp || "",
        name: order.name || "",
        paymentStatus: order.paymentStatus || ""
      };
    });
    if (result.ok && typeof store.replaceOrders === "function") {
      store.replaceOrders(list);
      if (window.OwlisticSheet && typeof window.OwlisticSheet.sync === "function") {
        store.getOrders().forEach(function (order) {
          const before = repairBefore[order.id];
          const needsRepair = store.orderNeedsProfileRepair
            ? store.orderNeedsProfileRepair(before, order)
            : (!String(before.fiverrId || "").trim() && String(order.fiverrId || "").trim());
          if (needsRepair) {
            window.OwlisticSheet.sync(order, { skipUploads: true }).catch(function () {});
          }
        });
      }
      return;
    }
    if (list.length && typeof store.importOrders === "function") {
      store.importOrders(list);
    }
  }

  function loadFromSheet() {
    if (!window.OwlisticSheet || typeof window.OwlisticSheet.fetchOrders !== "function") {
      render();
      return;
    }
    const cachedOrders = auth.visibleOrders();
    if (cachedOrders.length) {
      renderAccountFilter();
      render();
      countEl.textContent = "Refreshing…";
    } else {
      countEl.textContent = "Loading…";
      body.innerHTML =
        '<tr><td colspan="' + columnCount(0) + '"><div class="empty-state"><strong>Loading orders from Google Sheet</strong></div></td></tr>';
    }
    const preloadTasks = [];
    if (auth.fetchUserProfile) preloadTasks.push(auth.fetchUserProfile());
    if (window.OwlisticSheet && typeof window.OwlisticSheet.fetchAccounts === "function") {
      preloadTasks.push(window.OwlisticSheet.fetchAccounts());
    }
    const preload = preloadTasks.length ? Promise.all(preloadTasks) : Promise.resolve();
    const ordersPromise = window.OwlisticSheet.fetchOrders();
    if (window.OwlisticSheet.ensureScheduleColumns) {
      window.OwlisticSheet.ensureScheduleColumns().then(function (ensureResult) {
        refreshSheetUpgradeBanner(ensureResult);
      }).catch(function () {});
    }
    Promise.all([preload, ordersPromise]).then(function (results) {
      const result = results[1];
      applySheetOrders(result);
      renderAccountFilter();
      render();
      if (result && result.error && !auth.visibleOrders().length) {
        body.innerHTML =
          '<tr><td colspan="' + columnCount(0) + '"><div class="empty-state">' +
            "<strong>Could not load sheet orders</strong>" +
            "<p>" + escapeHtml(result.error) + "</p>" +
          "</div></td></tr>";
      }
    }).catch(function () {
      render();
    });
  }

  function showToast(message) {
    let toast = document.getElementById("toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "toast";
      toast.id = "toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(function () {
      toast.hidden = true;
    }, 2800);
  }

  function closeScheduleMenus() {
    openScheduleMenuId = "";
    document.querySelectorAll("[data-schedule-menu]").forEach(function (menu) {
      menu.hidden = true;
    });
  }

  function closeScheduleModal() {
    scheduleEditingId = "";
    if (scheduleModal) scheduleModal.hidden = true;
  }

  function openScheduleModal(order) {
    if (!order || !scheduleModal) return;
    closeScheduleMenus();
    scheduleEditingId = order.id;
    const status = store.placementStatusOf ? store.placementStatusOf(order) : (order.placementStatus || "");
    if (scheduleModalTitle) {
      scheduleModalTitle.textContent = !status || status === "Unscheduled" ? "Schedule order" : "Edit schedule";
    }
    if (scheduleModalOrder) {
      scheduleModalOrder.textContent = order.id + (order.fiverrId ? " · " + order.fiverrId : "");
    }
    if (scheduleDate) {
      scheduleDate.value = store.ymd ? store.ymd(order.placeOn) : String(order.placeOn || "").slice(0, 10);
    }
    if (scheduleMode) scheduleMode.value = status === "On Hold" ? "hold" : "scheduled";
    scheduleModal.hidden = false;
    if (scheduleDate && status !== "On Hold") scheduleDate.focus();
  }

  function persistBoardStatus(order, label) {
    const sheet = window.OwlisticSheet;
    const finish = function (result) {
      render();
      if (result && result.skipped) {
        showToast("Status set to " + label);
        return;
      }
      if (result && result.ok === false) {
        showToast(result.error || "Status updated here, but not on the Google Sheet.");
        return;
      }
      showToast("Status set to " + label + " and saved to Google Sheet");
    };
    if (!sheet || typeof sheet.updateOrderStatus !== "function") {
      finish({ skipped: true });
      return;
    }
    sheet.updateOrderStatus(order).then(finish).catch(function () {
      finish({ ok: false, error: "Status updated here, but not on the Google Sheet." });
    });
  }

  function persistSchedule(order, message, options) {
    options = options || {};
    store.upsertOrder(order);
    closeScheduleModal();
    closeScheduleMenus();
    if (options.movedToPlaced) {
      setActiveTab("orders-placed");
    } else {
      render();
    }
    const sheet = window.OwlisticSheet;
    const send = sheet && (typeof sheet.updateOrderSchedule === "function"
      ? sheet.updateOrderSchedule
      : (typeof sheet.sync === "function" ? function (item) { return sheet.sync(item, { skipUploads: true }); } : null));
    const finish = function (okMessage) {
      showToast(okMessage || message || "Schedule saved");
    };
    const fail = function (err) {
      showToast(err || "Schedule saved here, but not on the Google Sheet.");
    };
    if (!send) {
      finish(message || (options.movedToPlaced ? "Order moved to Orders Placed" : "Schedule saved"));
      return;
    }
    send.call(sheet, order).then(function (result) {
      if (result && result.skipped) {
        finish(message || (options.movedToPlaced ? "Order moved to Orders Placed" : "Schedule saved"));
        return;
      }
      if (result && result.needsDeploy) {
        refreshSheetUpgradeBanner({ needsDeploy: true });
        fail(result.error || "Schedule saved here, but not on the Google Sheet yet. Allow the updated script, then save again.");
        return;
      }
      if (result && result.ok === false && sheet.sync) {
        return sheet.sync(order, { skipUploads: true }).then(function (retry) {
          if (retry && retry.ok === false) {
            fail(retry.error || result.error);
            return;
          }
          finish(message || (options.movedToPlaced ? "Order moved to Orders Placed" : "Schedule saved"));
        }).catch(function () {
          fail(result.error);
        });
      }
      if (result && result.ok === false) {
        fail(result.error);
        return;
      }
      finish(message || (options.movedToPlaced ? "Order moved to Orders Placed" : "Schedule saved"));
    }).catch(function () {
      if (sheet && sheet.sync) {
        sheet.sync(order, { skipUploads: true }).then(function (retry) {
          if (retry && retry.ok === false) {
            fail(retry.error);
            return;
          }
          finish(message || (options.movedToPlaced ? "Order moved to Orders Placed" : "Schedule saved"));
        }).catch(function () {
          fail("Schedule saved here, but not on the Google Sheet.");
        });
        return;
      }
      fail("Schedule saved here, but not on the Google Sheet.");
    });
  }

  function applyScheduleAction(orderId, action) {
    const order = store.getOrder(orderId);
    if (!order) return;
    if (typeof auth.canSeeOrder === "function" && !auth.canSeeOrder(order)) {
      showToast("You can only schedule orders for your account.");
      return;
    }
    if (action === "open") {
      openScheduleModal(order);
      return;
    }
    if (!store.applyManualSchedule) return;
    if (action === "placed") {
      store.applyManualSchedule(order, { placed: true }, scheduleActor());
      persistSchedule(order, "Order moved to Orders Placed", { movedToPlaced: true });
      return;
    }
    if (action === "hold") {
      store.applyManualSchedule(order, { hold: true }, scheduleActor());
      persistSchedule(order, "Schedule saved");
      return;
    }
    if (action === "clear") {
      store.applyManualSchedule(order, { clear: true }, scheduleActor());
      persistSchedule(order, "Schedule saved");
    }
  }

  function saveScheduleModal() {
    const order = store.getOrder(scheduleEditingId);
    if (!order) return;
    if (!store.applyManualSchedule) return;
    const mode = scheduleMode ? scheduleMode.value : "scheduled";
    if (mode === "hold") {
      store.applyManualSchedule(order, { hold: true }, scheduleActor());
      persistSchedule(order, "Schedule saved");
      return;
    }
    const date = scheduleDate ? String(scheduleDate.value || "").trim() : "";
    if (!date) {
      showToast("Choose a Place On date, or set status to On Hold.");
      return;
    }
    store.applyManualSchedule(order, { placeOn: date }, scheduleActor());
    persistSchedule(order, "Schedule saved");
  }

  function copyText(text) {
    const value = String(text == null ? "" : text);
    if (!value) {
      showToast("Nothing to copy");
      return;
    }
    const done = function () {
      showToast("Copied");
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(value).then(done).catch(function () {
        fallbackCopy(value);
        done();
      });
      return;
    }
    fallbackCopy(value);
    done();
  }

  function fallbackCopy(value) {
    const field = document.createElement("textarea");
    field.value = value;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.left = "-9999px";
    document.body.appendChild(field);
    field.select();
    try {
      document.execCommand("copy");
    } catch (err) {}
    document.body.removeChild(field);
  }

  function saveNameField(orderId, field, value) {
    const order = store.getOrder(orderId);
    if (!order) return;
    const canSee = auth.canSeeOrder || auth.canSeeOrder;
    if (typeof canSee === "function" && !canSee.call(auth, order)) return;
    const next = String(value || "").trim();
    if (field === "clientName") order.clientName = next;
    if (field === "businessName") order.businessName = next;
    store.upsertOrder(order);
    render();
    const sheet = window.OwlisticSheet;
    const send = sheet && (typeof sheet.updateOrderNames === "function"
      ? sheet.updateOrderNames
      : (typeof sheet.sync === "function" ? function (item) { return sheet.sync(item, { skipUploads: true }); } : null));
    if (!send) {
      showToast(field === "clientName" ? "Client name saved" : "Business name saved");
      return;
    }
    send.call(sheet, order).then(function (result) {
      if (result && result.skipped) {
        showToast(field === "clientName" ? "Client name saved" : "Business name saved");
        return;
      }
      if (result && result.ok === false) {
        showToast(result.error || "Name saved here, but not on the Google Sheet.");
        return;
      }
      showToast(field === "clientName" ? "Client name saved to Google Sheet" : "Business name saved to Google Sheet");
    }).catch(function () {
      showToast("Name saved here, but not on the Google Sheet.");
    });
  }

  function startNameEdit(button) {
    const orderId = button.getAttribute("data-edit-order");
    const field = button.getAttribute("data-edit-field");
    const order = store.getOrder(orderId);
    if (!order) return;
    const cell = button.closest("td");
    if (!cell) return;
    const placeholder = field === "clientName" ? "Add client name" : "Add business name";
    const current = String(order[field] || "");
    cell.innerHTML = '<input class="records-inline-input" data-name-input data-edit-order="' + escapeHtml(orderId) + '" data-edit-field="' + field + '" value="' + escapeHtml(current) + '" placeholder="' + escapeHtml(placeholder) + '" />';
    const input = cell.querySelector("[data-name-input]");
    if (!input) return;
    input.focus();
    input.select();
  }

  body.addEventListener("click", function (event) {
    const openChatBtn = event.target.closest("[data-open-chat]");
    if (openChatBtn) {
      event.preventDefault();
      openChat(openChatBtn.getAttribute("data-open-chat"));
      return;
    }

    const historyBtn = event.target.closest("[data-open-rev-history]");
    if (historyBtn) {
      event.preventDefault();
      openRevHistory(historyBtn.getAttribute("data-open-rev-history"));
      return;
    }

    const markBtn = event.target.closest("[data-mark-revision]");
    if (markBtn) {
      event.preventDefault();
      event.stopPropagation();
      openCompletePop(markBtn);
      return;
    }

    const pendingStep = event.target.closest("[data-pending-revision]");
    if (pendingStep) {
      event.preventDefault();
      const number = pendingStep.getAttribute("data-pending-revision");
      const blocked = pendingStep.getAttribute("data-blocked-by");
      showToast("Complete Revision " + blocked + " before Revision " + number + ".");
      return;
    }

    const copyBtn = event.target.closest("[data-copy]");
    if (copyBtn) {
      event.preventDefault();
      copyText(copyBtn.getAttribute("data-copy"));
      return;
    }

    const editBtn = event.target.closest("[data-edit-field]");
    if (editBtn && !editBtn.hasAttribute("data-name-input")) {
      event.preventDefault();
      startNameEdit(editBtn);
      return;
    }

    const toggleMenu = event.target.closest("[data-toggle-schedule-menu]");
    if (toggleMenu) {
      event.preventDefault();
      event.stopPropagation();
      const id = toggleMenu.getAttribute("data-toggle-schedule-menu");
      const willOpen = openScheduleMenuId !== id;
      closeScheduleMenus();
      if (willOpen) {
        openScheduleMenuId = id;
        const menu = body.querySelector('[data-schedule-menu="' + id + '"]');
        if (menu) menu.hidden = false;
      }
      return;
    }

    const scheduleDo = event.target.closest("[data-schedule-do]");
    if (scheduleDo) {
      event.preventDefault();
      applyScheduleAction(scheduleDo.getAttribute("data-schedule-order"), scheduleDo.getAttribute("data-schedule-do"));
      return;
    }

    const addBtn = event.target.closest("[data-add-revision]");
    if (addBtn) {
      const id = addBtn.getAttribute("data-add-revision");
      const order = store.getOrder(id) || store.getOrder(id);
      const canSee = auth.canSeeOrder || auth.canSeeOrder;
      if (!order || (typeof canSee === "function" && !canSee.call(auth, order))) return;
      if (typeof store.addRevision === "function") store.addRevision(order);
      else if (typeof store.addRevision === "function") store.addRevision(order);
      store.upsertOrder(order);
      const finishAdd = function () {
        render();
        showToast("Revision " + (order.revisions && order.revisions.length ? order.revisions.length : 1) + " added");
      };
      const sheet = window.OwlisticSheet;
      render();
      if (sheet && typeof sheet.sync === "function") {
        addBtn.disabled = true;
        sheet.sync(order).then(function () {
          showToast("Revision " + (order.revisions && order.revisions.length ? order.revisions.length : 1) + " added");
        }).catch(function () {
          showToast("Revision " + (order.revisions && order.revisions.length ? order.revisions.length : 1) + " added");
        });
        return;
      }
      finishAdd();
      return;
    }
    const button = event.target.closest("[data-delete-order]");
    if (!button) return;
    const id = button.getAttribute("data-delete-order");
    const session = auth.getSession && auth.getSession();
    const order = store.getOrder(id) || {
      id: id,
      accountName: (session && session.account) || "",
      tabName: (session && session.account) || ""
    };
    const canSee = auth.canSeeOrder;
    if (store.getOrder(id) && typeof canSee === "function" && !canSee.call(auth, store.getOrder(id))) {
      showToast("You can only delete orders for your account.");
      return;
    }
    const sheet = window.OwlisticSheet;
    if (sheet && typeof sheet.confirmDelete === "function") {
      if (!sheet.confirmDelete(order)) return;
    } else if (!window.confirm("Do you wish to delete order " + id + "?\n\nThis will remove it from the portal and from the Google Sheet.")) {
      return;
    }
    button.disabled = true;
    const finish = function (result) {
      if (store.deleteOrder) store.deleteOrder(id);
      if (window.OwlisticHanifCosting) window.OwlisticHanifCosting.onOrderDeleted(id);
      render();
      if (result && result.sheetRemaining) {
        showToast("Deleted from the portal. The Google Sheet row is still there. Try Delete again.");
      } else {
        showToast("Order " + id + " deleted");
      }
    };
    if (sheet && typeof sheet.removeOrder === "function") {
      sheet.removeOrder(order).then(finish).catch(function () {
        if (store.deleteOrder) store.deleteOrder(id);
        if (window.OwlisticHanifCosting) window.OwlisticHanifCosting.onOrderDeleted(id);
        render();
        showToast("Order " + id + " deleted from the portal");
      });
      return;
    }
    if (store.deleteOrder) store.deleteOrder(id);
    if (sheet && typeof sheet.deleteOrder === "function") sheet.deleteOrder(order);
    render();
    showToast("Order " + id + " deleted");
  });

  body.addEventListener("focusout", function (event) {
    const input = event.target.closest("[data-name-input]");
    if (!input) return;
    if (input.getAttribute("data-cancel") === "1") return;
    const orderId = input.getAttribute("data-edit-order");
    const field = input.getAttribute("data-edit-field");
    const value = input.value;
    window.setTimeout(function () {
      saveNameField(orderId, field, value);
    }, 0);
  });

  body.addEventListener("keydown", function (event) {
    const input = event.target.closest("[data-name-input]");
    if (!input) return;
    if (event.key === "Enter") {
      event.preventDefault();
      input.blur();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      input.setAttribute("data-cancel", "1");
      render();
    }
  });

  body.addEventListener("change", function (event) {
    const box = event.target.closest("[data-revision-complete]");
    if (box) {
      const id = box.getAttribute("data-revision-complete");
      const revisionId = box.getAttribute("data-revision-id");
      const order = store.getOrder(id);
      if (!order) return;
      applyRevisionCompleted(order, revisionId, box.checked);
      return;
    }
    const select = event.target.closest("[data-status-order]");
    if (!select) return;
    const id = select.getAttribute("data-status-order");
    const order = store.getOrder(id);
    if (!order) return;
    const canSee = auth.canSeeOrder || auth.canSeeOrder;
    if (typeof canSee === "function" && !canSee.call(auth, order)) return;
    const nextTab = select.value;
    if (typeof store.setBoardStatus === "function") store.setBoardStatus(order, nextTab);
    else {
      order.boardStatus = nextTab;
      order.overallStatus = (store.boardStatusLabel && store.boardStatusLabel(nextTab)) || nextTab;
      order.readyToApprove = nextTab === "completed" || nextTab === "ready-to-approve";
    }
    if (nextTab === "orders-placed") {
      order.placementPlaced = true;
      order.placedAt = order.placedAt || (store.nowIso ? store.nowIso() : new Date().toISOString());
      order.placementHold = false;
    } else if (order.placementPlaced) {
      order.placementPlaced = false;
      order.placedAt = "";
    }
    if (store.normalizeSchedule) store.normalizeSchedule(order);
    store.upsertOrder(order);
    const label = (store.boardStatusLabel && store.boardStatusLabel(nextTab)) || select.options[select.selectedIndex].text;
    setActiveTab(tabOf(order));
    persistBoardStatus(order, label);
  });
  [search, dateFilter, accountFilter, paymentFilter, revisionFilter, readyFilter, placeOnFilter].forEach(function (input) {
    if (!input) return;
    input.addEventListener("input", render);
    input.addEventListener("change", render);
  });
  if (scheduleSave) {
    scheduleSave.addEventListener("click", function () {
      saveScheduleModal();
    });
  }
  if (scheduleClearAll) {
    scheduleClearAll.addEventListener("click", function () {
      scheduleFilter = "";
      if (search) search.value = "";
      if (dateFilter) dateFilter.value = "";
      if (accountFilter) accountFilter.value = "";
      if (paymentFilter) paymentFilter.value = "";
      if (revisionFilter) revisionFilter.value = "";
      if (readyFilter) readyFilter.value = "";
      if (placeOnFilter) placeOnFilter.value = "";
      render();
    });
  }

  document.addEventListener("click", function (event) {
    if (event.target.closest("[data-close-schedule]")) {
      closeScheduleModal();
      return;
    }
    const filterBtn = event.target.closest("[data-schedule-filter]");
    if (filterBtn) {
      event.preventDefault();
      const next = filterBtn.getAttribute("data-schedule-filter") || "";
      scheduleFilter = scheduleFilter === next ? "" : next;
      render();
      return;
    }
    if (!event.target.closest(".schedule-action-wrap")) {
      closeScheduleMenus();
    }
    if (event.target.closest("[data-close-chat]")) {
      closeChat();
      return;
    }
    if (event.target.closest("[data-close-rev-history]")) {
      closeRevHistory();
      return;
    }
    if (event.target.closest("[data-close-complete-pop]")) {
      closeCompletePop();
      return;
    }
    const markBtn = event.target.closest("[data-mark-revision]");
    if (markBtn) {
      event.preventDefault();
      event.stopPropagation();
      openCompletePop(markBtn);
      return;
    }
    if (event.target.closest("#rev-complete-yes")) {
      event.preventDefault();
      if (!pendingComplete) return;
      const order = store.getOrder(pendingComplete.orderId);
      if (!order) {
        closeCompletePop();
        return;
      }
      applyRevisionCompleted(order, pendingComplete.revisionId, true, pendingComplete.number);
      return;
    }
    if (revCompletePop && !revCompletePop.hidden && !event.target.closest("#rev-complete-pop") && !event.target.closest("[data-mark-revision]")) {
      closeCompletePop();
    }
    if (event.target.closest("[data-close-lightbox]")) {
      closeLightbox();
      return;
    }
    const saveLightbox = event.target.closest("#chat-lightbox-save");
    if (saveLightbox) {
      event.preventDefault();
      downloadAttachment(lightboxFile);
      return;
    }
    const previewBtn = event.target.closest("[data-open-preview]");
    if (previewBtn) {
      event.preventDefault();
      openLightbox(fileFromButton(previewBtn));
      return;
    }
    const saveBtn = event.target.closest("[data-save-file]");
    if (saveBtn) {
      event.preventDefault();
      downloadAttachment(fileFromButton(saveBtn));
      return;
    }
    const openBtn = event.target.closest("[data-open-file]");
    if (openBtn) {
      event.preventDefault();
      openAttachment(fileFromButton(openBtn));
    }
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    if (scheduleModal && !scheduleModal.hidden) {
      closeScheduleModal();
      return;
    }
    if (chatLightbox && !chatLightbox.hidden) {
      closeLightbox();
      return;
    }
    if (revCompletePop && !revCompletePop.hidden) {
      closeCompletePop();
      return;
    }
    if (revHistoryDrawer && !revHistoryDrawer.hidden) {
      closeRevHistory();
      return;
    }
    if (chatDrawer && !chatDrawer.hidden) closeChat();
  });

  renderAccountFilter();
  tabButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      setActiveTab(button.getAttribute("data-tab"));
    });
  });
  bindSheetUpgradeBanner();
  if (window.OwlisticRevisionSub) {
    window.OwlisticRevisionSub.mount({
      escapeHtml: escapeHtml,
      render: render,
      showToast: showToast,
      canEditOrder: function (order) {
        return typeof auth.canSeeOrder === "function" ? auth.canSeeOrder(order) : true;
      },
      revisionRounds: revisionRounds,
      revisionStepStates: revisionStepStates,
      findRevisionRound: function (order, id) {
        return typeof store.findRevisionRound === "function" ? store.findRevisionRound(order, id) : null;
      },
      closeChat: closeChat,
      closeCompletePop: closeCompletePop,
      hydrateLocalThumbs: hydrateLocalThumbs,
      openLightbox: openLightbox
    });
  }
  if (auth.isSuperAdmin() && window.OwlisticHanifCosting) {
    window.OwlisticHanifCosting.mount({ showToast: showToast });
  }
  loadFromSheet();
})();
