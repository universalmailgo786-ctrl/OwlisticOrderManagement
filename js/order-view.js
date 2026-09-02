(function () {
  const store = window.OwlisticStore;
  const auth = window.OwlisticAuth;
  const titleEl = document.getElementById("order-view-title");
  const metaEl = document.getElementById("order-view-meta");
  const bodyEl = document.getElementById("order-view-body");
  const editLink = document.getElementById("order-view-edit");
  const pdfBtn = document.getElementById("order-view-pdf");
  const printRoot = document.getElementById("order-view-print");

  let currentOrder = null;
  const scriptCache = {};

  const ICONS = {
    overview: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
    message: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
    requirements: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
    files: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>',
    review: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    revisions: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',
    schedule: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
    money: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    buyer: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    seller: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
    calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
  };

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function display(value) {
    const text = String(value == null ? "" : value).trim();
    return text ? escapeHtml(text) : '<span class="ov-empty">—</span>';
  }

  function formatMoney(value) {
    if (value == null || value === "") return "—";
    const num = Number(String(value).replace(/[^0-9.\-]/g, ""));
    if (!isNaN(num) && String(value).trim() !== "") {
      return "$" + num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    }
    return escapeHtml(value);
  }

  function formatBytes(size) {
    const n = Number(size);
    if (!n || n < 0) return "";
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10 * 1024 ? 1 : 0) + " KB";
    return (n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0) + " MB";
  }

  function formatStamp(iso) {
    if (!iso || !store || !store.formatDateTime) return "";
    return store.formatDateTime(iso);
  }

  function paymentLabel(order) {
    const raw = String((order && order.paymentStatus) || "").trim().toLowerCase();
    if (raw === "paid") return "Paid";
    if (raw === "unpaid") return "Unpaid";
    return "";
  }

  function boardLabel(order) {
    if (store && typeof store.boardStatusLabel === "function") {
      const tab = store.boardStatusOf ? store.boardStatusOf(order) : order.boardStatus;
      return store.boardStatusLabel(tab) || order.overallStatus || "";
    }
    return order.overallStatus || order.boardStatus || "";
  }

  function orderTypeTags(order) {
    const tags = [];
    if (order.orderTypeCustom) tags.push({ label: "Custom (Message)", kind: "custom" });
    if (order.orderTypeDirect) tags.push({ label: "Direct", kind: "direct" });
    const status = boardLabel(order);
    if (status) tags.push({ label: status, kind: "status" });
    const payment = paymentLabel(order);
    if (payment) tags.push({ label: payment, kind: payment === "Paid" ? "paid" : "unpaid" });
    return tags;
  }

  function placementLabel(order) {
    if (store && typeof store.placementStatusOf === "function") {
      return store.placementStatusOf(order) || order.placementStatus || "";
    }
    return order.placementStatus || "";
  }

  function formatPlaceOn(order) {
    if (store && typeof store.formatPlaceOn === "function") {
      return store.formatPlaceOn(order.placeOn) || "";
    }
    return order.placeOn || "";
  }

  function sectionCard(iconKey, title, hint, inner) {
    return '<section class="ov-card">' +
      '<header class="ov-card-head">' +
        '<span class="ov-card-icon">' + (ICONS[iconKey] || ICONS.overview) + "</span>" +
        "<h2>" + escapeHtml(title) + "</h2>" +
        (hint ? '<span class="ov-card-hint">' + escapeHtml(hint) + "</span>" : "") +
      "</header>" +
      '<div class="ov-card-body">' + inner + "</div>" +
    "</section>";
  }

  function overviewItem(iconKey, label, valueHtml) {
    return '<div class="ov-overview-item">' +
      '<span class="ov-overview-icon">' + (ICONS[iconKey] || ICONS.overview) + "</span>" +
      '<div class="ov-overview-copy">' +
        '<span class="ov-overview-label">' + escapeHtml(label) + "</span>" +
        '<span class="ov-overview-value">' + valueHtml + "</span>" +
      "</div>" +
    "</div>";
  }

  function linkValue(url) {
    const text = String(url || "").trim();
    if (!text) return display("");
    const safe = escapeHtml(text);
    if (/^https?:\/\//i.test(text)) {
      return '<a class="ov-link" href="' + safe + '" target="_blank" rel="noopener noreferrer">' + safe + "</a>";
    }
    return safe;
  }

  function multiline(value) {
    const text = String(value || "").trim();
    if (!text) return '<p class="ov-empty-block">Nothing entered yet.</p>';
    return '<div class="ov-multiline">' + escapeHtml(text).replace(/\n/g, "<br>") + "</div>";
  }

  function threadPairs(order) {
    if (store && typeof store.pairMessageThread === "function") {
      const thread = store.messageThreadOf ? store.messageThreadOf(order) : (order.messageThread || []);
      return store.pairMessageThread(thread);
    }
    return [];
  }

  function repairMessage(message) {
    if (!message) return null;
    if (store && store.repairRevisionMessages) {
      return store.repairRevisionMessages([message])[0] || message;
    }
    return message;
  }

  function normalizeViewFile(file) {
    if (!file) return null;
    const name = String(file.fileName || file.name || "file").trim();
    const url = String(file.imageUrl || file.url || file.previewUrl || "").trim();
    if (!name && !url && !file.id) return null;
    return {
      id: file.id || "",
      name: name || "file",
      url: url,
      type: file.mimeType || file.type || "",
      size: file.fileSize || file.size || 0,
      previewUrl: String(file.thumbnailUrl || file.previewUrl || "").trim()
    };
  }

  function viewFilesList(files) {
    return (files || []).map(normalizeViewFile).filter(Boolean);
  }

  function fileDownloadHref(file) {
    if (store && store.fileDownloadUrl) return store.fileDownloadUrl(file) || "";
    return (file && file.url) || "";
  }

  function filePreviewSrc(file) {
    if (file && file.previewUrl) return file.previewUrl;
    if (store && store.filePreviewUrl) return store.filePreviewUrl(file) || "";
    return (file && file.url) || "";
  }

  function flattenMessages(order) {
    const pairs = threadPairs(order);
    const items = [];
    pairs.forEach(function (pair, pairIndex) {
      const buyer = repairMessage(pair.buyer);
      const seller = repairMessage(pair.client || pair.seller);
      if (buyer) {
        const text = String(buyer.text || "").trim();
        const files = viewFilesList(buyer.files);
        if (text || files.length) {
          items.push({ role: "buyer", text: text, files: files, stamp: buyer.createdAt, round: pairIndex + 1 });
        }
      }
      if (seller) {
        const text = String(seller.text || "").trim();
        const files = viewFilesList(seller.files);
        if (text || files.length) {
          items.push({ role: "seller", text: text, files: files, stamp: seller.createdAt, round: pairIndex + 1 });
        }
      }
    });
    if (!items.length) {
      const fallback = repairMessage({ text: order.messageText || "", files: [] });
      const text = String((fallback && fallback.text) || "").trim();
      const files = viewFilesList(fallback && fallback.files);
      if (text || files.length) {
        items.push({ role: "buyer", text: text, files: files, stamp: "", round: 1 });
      }
    }
    return items;
  }

  function renderMessageTimeline(order) {
    const messages = flattenMessages(order);
    if (!messages.length) {
      return '<p class="ov-empty-block">No buyer messages yet.</p>';
    }
    return '<div class="ov-timeline">' + messages.map(function (msg, index) {
      const isBuyer = msg.role === "buyer";
      const roleLabel = isBuyer ? "Buyer Message" : "Seller Reply";
      const stamp = formatStamp(msg.stamp);
      return '<article class="ov-timeline-item ' + (isBuyer ? "is-buyer" : "is-seller") + '">' +
        '<span class="ov-timeline-num" aria-hidden="true">' + (index + 1) + "</span>" +
        '<div class="ov-timeline-bubble">' +
          '<header class="ov-timeline-head">' +
            '<span class="ov-timeline-role">' +
              '<span class="ov-timeline-role-icon">' + (isBuyer ? ICONS.buyer : ICONS.seller) + "</span>" +
              '<span class="ov-role-pill ov-role-pill-' + (isBuyer ? "buyer" : "seller") + '">' + escapeHtml(roleLabel) + "</span>" +
            "</span>" +
            (stamp ? '<time class="ov-timeline-time">' + escapeHtml(stamp) + "</time>" : "") +
          "</header>" +
          (msg.text ? '<p class="ov-timeline-text">' + escapeHtml(msg.text).replace(/\n/g, "<br>") + "</p>" : "") +
          renderAttachmentsHtml(msg.files) +
        "</div>" +
      "</article>";
    }).join("") + "</div>";
  }

  function requirementLines(text) {
    return String(text || "")
      .split(/\n+/)
      .map(function (line) { return line.trim(); })
      .filter(Boolean);
  }

  function renderRequirements(order) {
    const lines = requirementLines(order.directRequirements);
    if (!lines.length) return '<p class="ov-empty-block">No direct order requirements entered.</p>';
    return '<ol class="ov-req-list">' + lines.map(function (line) {
      return "<li>" + escapeHtml(line) + "</li>";
    }).join("") + "</ol>";
  }

  function fileExtLabel(file) {
    const name = String((file && (file.fileName || file.name)) || "");
    const ext = name.indexOf(".") >= 0 ? name.split(".").pop() : "";
    if (ext) return ext.toUpperCase();
    return "FILE";
  }

  function isImageFile(file) {
    const probe = {
      name: (file && (file.fileName || file.name)) || "",
      type: (file && (file.mimeType || file.type)) || ""
    };
    if (store && store.isImageFile) return store.isImageFile(probe);
    return /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif)$/i.test(probe.name) || /^image\//i.test(probe.type);
  }

  function renderAttachmentsHtml(files) {
    const list = viewFilesList(files);
    if (!list.length) return "";
    return '<div class="ov-attachments">' + list.map(function (file) {
      const download = fileDownloadHref(file);
      const preview = filePreviewSrc(file) || download;
      const name = escapeHtml(file.name);
      const missing = !download && !file.id;
      if (isImageFile(file)) {
        const imgHtml = preview
          ? '<a class="ov-attach-image-link" href="' + escapeHtml(download || preview) + '" target="_blank" rel="noopener noreferrer">' +
              '<img class="ov-attach-thumb ov-pdf-image" src="' + escapeHtml(preview) + '" alt="' + name + '"' +
              (file.id ? ' data-local-file-id="' + escapeHtml(file.id) + '"' : "") +
              ' crossorigin="anonymous" loading="lazy" />' +
            "</a>"
          : '<span class="ov-attach-fallback" aria-hidden="true">IMG</span>';
        const downloadHtml = missing
          ? '<span class="ov-attach-missing">Not on Drive</span>'
          : (download
            ? '<a class="ov-attach-download ov-pdf-link" href="' + escapeHtml(download) + '" target="_blank" rel="noopener noreferrer" download="' + name + '">Download</a>'
            : '<button type="button" class="ov-attach-download" data-ov-download-id="' + escapeHtml(file.id) + '" data-ov-download-name="' + name + '">Download</button>');
        const urlHtml = download
          ? '<span class="ov-attach-url ov-pdf-link" title="Image download link">' + escapeHtml(download) + "</span>"
          : "";
        return '<figure class="ov-attach-item is-image">' + imgHtml +
          '<figcaption class="ov-attach-meta">' +
            '<span class="ov-attach-name">' + name + "</span>" +
            downloadHtml +
            urlHtml +
          "</figcaption>" +
        "</figure>";
      }
      const size = formatBytes(file.size);
      const ext = fileExtLabel(file);
      const fileActions = missing
        ? '<span class="ov-attach-missing">Not on Drive</span>'
        : (download
          ? '<a class="ov-attach-download ov-pdf-link" href="' + escapeHtml(download) + '" target="_blank" rel="noopener noreferrer" download="' + name + '">Download</a>'
          : '<button type="button" class="ov-attach-download" data-ov-download-id="' + escapeHtml(file.id) + '" data-ov-download-name="' + name + '">Download</button>');
      const urlHtml = download
        ? '<span class="ov-attach-url ov-pdf-link">' + escapeHtml(download) + "</span>"
        : "";
      return '<div class="ov-attach-item is-file">' +
        '<span class="ov-file-icon" aria-hidden="true">' + escapeHtml(ext) + "</span>" +
        '<div class="ov-attach-meta">' +
          '<span class="ov-attach-name">' + name + (size ? ' <span class="ov-attach-size">(' + escapeHtml(size) + ")</span>" : "") + "</span>" +
          fileActions +
          urlHtml +
        "</div>" +
      "</div>";
    }).join("") + "</div>";
  }

  function renderFiles(order) {
    const list = (order.requirementFiles || []).filter(Boolean);
    if (!list.length) return '<p class="ov-empty-block">No requirement files attached.</p>';
    return '<div class="ov-file-grid">' + list.map(function (file) {
      const normalized = normalizeViewFile(file) || file;
      const name = normalized.name || "file";
      const download = fileDownloadHref(normalized);
      const preview = filePreviewSrc(normalized) || download;
      const ext = fileExtLabel(normalized);
      const isImage = isImageFile(normalized);
      const isPdf = ext === "PDF";
      const size = formatBytes(normalized.size);
      const kindClass = isImage ? "is-image" : (isPdf ? "is-pdf" : "is-file");
      const thumb = isImage && preview
        ? '<img class="ov-file-thumb ov-pdf-image" src="' + escapeHtml(preview) + '" alt="' + escapeHtml(name) + '"' +
          (normalized.id ? ' data-local-file-id="' + escapeHtml(normalized.id) + '"' : "") +
          ' crossorigin="anonymous" loading="lazy" />'
        : '<span class="ov-file-icon" aria-hidden="true">' + escapeHtml(ext) + "</span>";
      const inner = thumb +
        '<span class="ov-file-name">' + escapeHtml(name) + "</span>" +
        (size ? '<span class="ov-file-size">' + escapeHtml(size) + "</span>" : "") +
        (download ? '<span class="ov-file-download ov-pdf-link">Download</span>' : "");
      const href = download || preview;
      if (href) {
        return '<a class="ov-file-card ' + kindClass + '" href="' + escapeHtml(href) + '" target="_blank" rel="noopener noreferrer" download="' + escapeHtml(name) + '">' + inner + "</a>";
      }
      return '<div class="ov-file-card ' + kindClass + ' is-static">' + inner + "</div>";
    }).join("") + "</div>";
  }

  function revisionRoleMessage(round, role) {
    const messages = (round && round.messages) || [];
    for (let i = 0; i < messages.length; i += 1) {
      const msg = repairMessage(messages[i]);
      const msgRole = msg && (msg.role === "seller" || msg.kind === "seller") ? "seller" : "buyer";
      if (msgRole !== role) continue;
      const text = String(msg.text || "").trim();
      const files = viewFilesList(msg.files);
      if (text || files.length) return { text: text, files: files };
    }
    return { text: "", files: [] };
  }

  function revisionRows(order) {
    const rounds = store && typeof store.normalizeRevisions === "function"
      ? store.normalizeRevisions(order.revisions || [])
      : (order.revisions || []);
    return rounds.map(function (round) {
      const subs = (round.subRevisions || []).slice().sort(function (a, b) {
        return (a.subRevisionNumber || 0) - (b.subRevisionNumber || 0);
      });
      const buyerMsg = revisionRoleMessage(round, "buyer");
      const sellerMsg = revisionRoleMessage(round, "seller");
      return {
        label: "Revision " + round.number,
        buyer: buyerMsg.text,
        buyerFiles: buyerMsg.files,
        seller: sellerMsg.text,
        sellerFiles: sellerMsg.files,
        date: formatStamp(round.updatedAt || round.createdAt),
        kind: "main",
        subRevisions: subs.map(function (sub) {
          const sellerFiles = viewFilesList(sub.attachments || sub.files);
          return {
            label: "Sub " + (sub.subRevisionNumber || ""),
            buyer: String(sub.buyerRevision || "").trim(),
            buyerFiles: [],
            seller: String(sub.sellerReply || "").trim(),
            sellerFiles: sellerFiles,
            date: formatStamp(sub.completedAt || sub.updatedAt || sub.createdAt),
            status: sub.completed ? "Completed" : (sub.status === "active" ? "Latest" : "Pending")
          };
        })
      };
    });
  }

  function renderRevisionDate(dateHtml) {
    return dateHtml
      ? '<span class="ov-rev-date-inner">' + ICONS.calendar + "<span>" + escapeHtml(dateHtml) + "</span></span>"
      : '<span class="ov-empty">—</span>';
  }

  function renderRevisionCell(text, files) {
    const textHtml = text ? multiline(text) : "";
    const filesHtml = renderAttachmentsHtml(files);
    if (!textHtml && !filesHtml) return '<span class="ov-empty">—</span>';
    return '<div class="ov-rev-cell">' + textHtml + filesHtml + "</div>";
  }

  function renderRevisionsTable(order) {
    const rows = revisionRows(order);
    if (!rows.length) return '<p class="ov-empty-block">No revisions yet.</p>';
    return '<div class="ov-rev-groups">' + rows.map(function (row) {
      const subsHtml = row.subRevisions.length
        ? '<div class="ov-subrev-block">' +
            '<p class="ov-subrev-heading">Sub Revisions</p>' +
            '<div class="ov-table-wrap">' +
              '<table class="ov-rev-table ov-rev-table-sub">' +
                "<thead><tr><th>Sub</th><th>Buyer Message</th><th>Seller Message</th><th>Status</th><th>Date</th></tr></thead>" +
                "<tbody>" +
                row.subRevisions.map(function (sub) {
                  return "<tr>" +
                    '<td><span class="ov-rev-pill ov-rev-pill-sub">' + escapeHtml(row.label.replace("Revision ", "R") + " · " + sub.label) + "</span></td>" +
                    "<td>" + renderRevisionCell(sub.buyer, sub.buyerFiles) + "</td>" +
                    "<td>" + renderRevisionCell(sub.seller, sub.sellerFiles) + "</td>" +
                    '<td><span class="ov-subrev-status">' + escapeHtml(sub.status) + "</span></td>" +
                    '<td class="ov-rev-date">' + renderRevisionDate(sub.date) + "</td>" +
                  "</tr>";
                }).join("") +
                "</tbody>" +
              "</table>" +
            "</div>" +
          "</div>"
        : "";
      return '<section class="ov-rev-group">' +
        '<div class="ov-table-wrap">' +
          '<table class="ov-rev-table">' +
            "<thead><tr><th>Revision</th><th>Buyer Message</th><th>Seller Message</th><th>Date</th></tr></thead>" +
            "<tbody><tr>" +
              '<td><span class="ov-rev-pill">' + escapeHtml(row.label) + "</span></td>" +
              "<td>" + renderRevisionCell(row.buyer, row.buyerFiles) + "</td>" +
              "<td>" + renderRevisionCell(row.seller, row.sellerFiles) + "</td>" +
              '<td class="ov-rev-date">' + renderRevisionDate(row.date) + "</td>" +
            "</tr></tbody>" +
          "</table>" +
        "</div>" +
        subsHtml +
      "</section>";
    }).join("") + "</div>";
  }

  function renderOverview(order) {
    const tags = orderTypeTags(order);
    const tagsHtml = tags.length
      ? '<div class="ov-tag-row">' + tags.map(function (tag) {
        return '<span class="ov-tag ov-tag-' + escapeHtml(tag.kind) + '">' + escapeHtml(tag.label) + "</span>";
      }).join("") + "</div>"
      : "";
    return '<div class="ov-overview-grid">' +
      overviewItem("whatsapp", "WhatsApp Number", display(order.whatsapp)) +
      overviewItem("user", "Your Name", display(order.name)) +
      overviewItem("user", "Fiverr ID Name", display(order.fiverrId)) +
      overviewItem("link", "Fiverr GIG URL", linkValue(order.fiverrGigUrl)) +
      overviewItem("money", "Order Value", formatMoney(order.orderValue)) +
      overviewItem("search", "Search Keyword", display(order.searchKeyword)) +
      overviewItem("user", "Account", display(order.accountName)) +
      overviewItem("user", "Client / Business", display([order.clientName, order.businessName].filter(Boolean).join(" · ") || "")) +
      tagsHtml +
    "</div>";
  }

  function displayScheduledBy(order) {
    const owner = String((order && order.name) || "").trim();
    if (owner) return owner;
    return String((order && order.scheduledBy) || "").trim();
  }

  function renderSchedule(order) {
    return '<div class="ov-schedule-grid">' +
      '<div class="ov-schedule-item"><span class="ov-schedule-label">Place on</span><span class="ov-schedule-value">' + display(formatPlaceOn(order)) + "</span></div>" +
      '<div class="ov-schedule-item"><span class="ov-schedule-label">Placement status</span><span class="ov-schedule-value">' + display(placementLabel(order)) + "</span></div>" +
      '<div class="ov-schedule-item"><span class="ov-schedule-label">Scheduled by</span><span class="ov-schedule-value">' + display(displayScheduledBy(order)) + "</span></div>" +
      '<div class="ov-schedule-item"><span class="ov-schedule-label">Schedule updated</span><span class="ov-schedule-value">' + display(formatStamp(order.scheduleUpdatedAt)) + "</span></div>" +
      '<div class="ov-schedule-item"><span class="ov-schedule-label">Placed at</span><span class="ov-schedule-value">' + display(formatStamp(order.placedAt)) + "</span></div>" +
    "</div>";
  }

  function renderOrder(order) {
    if (!titleEl || !metaEl || !bodyEl) return;
    currentOrder = order;
    titleEl.textContent = order.id || "Order";
    const metaParts = [];
    if (order.accountName) metaParts.push(order.accountName);
    if (order.createdAt && store.formatDateTime) metaParts.push("Created: " + store.formatDateTime(order.createdAt));
    if (order.updatedAt && store.formatDateTime) metaParts.push("Updated: " + store.formatDateTime(order.updatedAt));
    metaEl.textContent = metaParts.join(" · ");
    if (editLink) {
      editLink.href = "index.html?order=" + encodeURIComponent(order.id || "");
    }

    bodyEl.innerHTML =
      sectionCard("overview", "Order Overview", "", renderOverview(order)) +
      sectionCard("schedule", "Schedule", "", renderSchedule(order)) +
      sectionCard("message", "Message Text", "Each reply saves to Google Sheet", renderMessageTimeline(order)) +
      sectionCard("requirements", "Direct Order Requirements", "", renderRequirements(order)) +
      sectionCard("files", "Requirement File", "", renderFiles(order)) +
      sectionCard("review", "Review Text (Feedback)", "", multiline(order.reviewText)) +
      sectionCard("revisions", "Revisions", "", renderRevisionsTable(order));
    hydrateLocalThumbs(bodyEl);
  }

  function hydrateLocalThumbs(root) {
    if (!root || typeof store.getFile !== "function") return;
    root.querySelectorAll("img[data-local-file-id]").forEach(function (img) {
      const id = img.getAttribute("data-local-file-id");
      if (!id || img.getAttribute("data-local-hydrated") === "1") return;
      store.getFile(id).then(function (record) {
        if (!record || !record.blob) return;
        img.src = URL.createObjectURL(record.blob);
        img.setAttribute("data-local-hydrated", "1");
      }).catch(function () {});
    });
  }

  function downloadLocalFile(id, name) {
    if (!id || typeof store.getFile !== "function") return;
    store.getFile(id).then(function (record) {
      if (!record || !record.blob) return;
      const url = URL.createObjectURL(record.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name || record.name || "download";
      link.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 0);
    }).catch(function () {});
  }

  function showMissing(message) {
    currentOrder = null;
    if (titleEl) titleEl.textContent = "Order not found";
    if (metaEl) metaEl.textContent = "";
    if (bodyEl) {
      bodyEl.innerHTML = '<div class="empty-state"><strong>' + escapeHtml(message) + '</strong><p><a href="records.html">Back to Order Records</a></p></div>';
    }
    if (editLink) editLink.hidden = true;
    if (pdfBtn) pdfBtn.hidden = true;
  }

  function loadScriptOnce(src) {
    if (scriptCache[src]) return scriptCache[src];
    scriptCache[src] = new Promise(function (resolve, reject) {
      const existing = document.querySelector('script[data-src="' + src + '"]');
      if (existing) {
        existing.addEventListener("load", function () { resolve(); });
        existing.addEventListener("error", function () { reject(new Error("Script failed")); });
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.dataset.src = src;
      script.onload = function () { resolve(); };
      script.onerror = function () { reject(new Error("Could not load " + src)); };
      document.head.appendChild(script);
    });
    return scriptCache[src];
  }

  function loadHtml2Pdf() {
    return loadScriptOnce("https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js");
  }

  function exportPdf() {
    if (!printRoot || !currentOrder) return;
    const previousLabel = pdfBtn ? pdfBtn.textContent.trim() : "";
    if (pdfBtn) {
      pdfBtn.disabled = true;
      pdfBtn.textContent = "Generating PDF…";
    }
    loadHtml2Pdf().then(function () {
      if (!window.html2pdf) throw new Error("PDF library unavailable");
      const filename = (currentOrder.id || "order") + "-view.pdf";
      const opt = {
        margin: [8, 8, 8, 8],
        filename: filename,
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["avoid-all", "css", "legacy"] }
      };
      return window.html2pdf().set(opt).from(printRoot).save();
    }).catch(function () {
      window.print();
    }).finally(function () {
      if (pdfBtn) {
        pdfBtn.disabled = false;
        pdfBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download PDF';
      }
    });
  }

  function loadOrder(orderId) {
    let order = store.getOrder(orderId);
    if (!order) {
      showMissing("This order was not found in your saved records.");
      return;
    }
    if (!auth.canSeeOrder(order)) {
      showMissing("You do not have access to this order.");
      return;
    }
    renderOrder(order);
    const localSnapshot = order;

    const sheet = window.OwlisticSheet;
    if (!sheet || typeof sheet.fetchOrder !== "function") return;
    sheet.fetchOrder(order).then(function (result) {
      if (!result || !result.found || !result.order) return;
      const remote = result.order;
      if (!auth.canSeeOrder(remote)) return;
      const localUpdated = Date.parse((localSnapshot && localSnapshot.updatedAt) || "") || 0;
      const remoteUpdated = Date.parse(remote.updatedAt || "") || 0;
      if (localUpdated > remoteUpdated) return;
      if (typeof store.importOrders === "function") {
        store.importOrders([remote]);
      }
      const fresh = store.getOrder(orderId);
      if (fresh) renderOrder(fresh);
    }).catch(function () {});
  }

  function bindAttachmentActions() {
    if (!bodyEl) return;
    bodyEl.addEventListener("click", function (event) {
      const btn = event.target.closest("[data-ov-download-id]");
      if (!btn) return;
      event.preventDefault();
      downloadLocalFile(btn.getAttribute("data-ov-download-id"), btn.getAttribute("data-ov-download-name") || "download");
    });
  }

  function init() {
    if (!auth.requirePage()) return;
    auth.bindNav();
    bindAttachmentActions();
    if (pdfBtn) pdfBtn.addEventListener("click", exportPdf);
    const orderId = new URLSearchParams(window.location.search).get("order");
    if (!orderId) {
      showMissing("No order was selected.");
      return;
    }
    loadOrder(orderId);
  }

  init();
})();
