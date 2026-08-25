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
  const TAB_LABELS = {
    "in-progress": "New order has to be placed",
    "on-revision": "on revision",
    "ready-to-approve": "ready to approve",
    completed: "completed"
  };
  const COPY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.2" y="8.2" width="11.2" height="11.2" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M5.4 15.4V6.8A1.8 1.8 0 0 1 7.2 5h9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
  const PENCIL_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.4 19.4 7.6 18.6 19 7.2a1.5 1.5 0 0 0 0-2.1L17 3.1a1.5 1.5 0 0 0-2.1 0L4.6 13.4z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M13.6 4.6 17.4 8.4" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>';

  let activeTab = "in-progress";

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
      return '<div class="records-file-card"><span class="records-file-name">' + name + "</span></div>";
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
    if (typeof store.recordTab === "function") {
      const tab = store.recordTab(order);
      if (tab === "on-revision") return "in-progress";
      return tab;
    }
    const status = store.computeStatus(order);
    if (status === "completed") return "completed";
    if (status === "ready-to-approve") return "ready-to-approve";
    return "in-progress";
  }

  function statusSelect(order) {
    const tab = tabOf(order);
    const options = [
      ["in-progress", "New order has to be placed"],
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

  function maxRevisionCount(orders) {
    let max = 0;
    (orders || []).forEach(function (order) {
      const count = revisionRounds(order).length;
      if (count > max) max = count;
    });
    return max;
  }

  function columnCount(pairCount, revisionCount) {
    return 15 + (pairCount * 2) + (revisionCount * 2);
  }

  function renderHead(pairCount, revisionCount) {
    const messageHeads = [];
    for (let i = 1; i <= pairCount; i += 1) {
      messageHeads.push("<th>Buyer Message " + i + "</th>");
      messageHeads.push("<th>Client Reply " + i + "</th>");
    }
    const revisionHeads = [];
    for (let i = 1; i <= revisionCount; i += 1) {
      revisionHeads.push("<th>Revision " + i + " Buyer</th>");
      revisionHeads.push("<th>Revision " + i + " Seller</th>");
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
      messageHeads.join("") +
      "<th>Direct Order Requirements</th>" +
      "<th>Requirement Files</th>" +
      "<th>Review Text (Feedback)</th>" +
      revisionHeads.join("") +
      "<th>Payment</th>" +
      "<th>Status</th>" +
      "<th>Actions</th>";
    if (table) table.style.minWidth = String(1680 + pairCount * 360 + revisionCount * 360) + "px";
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

  function matchesFilters(order) {
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
      revisionRounds(order).map(function (round) {
        return revisionRoleText(round, "buyer") + " " + revisionRoleText(round, "seller");
      }).join(" "),
      order.directRequirements,
      order.fiverrGigUrl,
      order.reviewText,
      requirementFileList(order.requirementFiles).map(function (file) { return file.name; }).join(" ")
    ]
      .join(" ")
      .toLowerCase();
    return haystack.indexOf(query) !== -1;
  }

  function setActiveTab(tab) {
    activeTab = tab;
    tabButtons.forEach(function (button) {
      const selected = button.getAttribute("data-tab") === tab;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-selected", selected ? "true" : "false");
    });
    render();
  }

  function updateTabCounts(all) {
    const counts = { "in-progress": 0, "on-revision": 0, "ready-to-approve": 0, completed: 0 };
    all.forEach(function (order) {
      const tab = tabOf(order);
      if (counts[tab] != null) counts[tab] += 1;
    });
    document.querySelectorAll("[data-tab-count]").forEach(function (el) {
      const key = el.getAttribute("data-tab-count");
      el.textContent = String(counts[key] || 0);
    });
  }

  function render() {
    const all = auth.visibleOrders();
    updateTabCounts(all);
    const pairCount = maxMessagePairs(all);
    const revisionCount = maxRevisionCount(all);
    renderHead(pairCount, revisionCount);
    const orders = all.slice().sort(function (a, b) {
      const na = orderNumber(a);
      const nb = orderNumber(b);
      if (na !== nb) return na - nb;
      return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
    }).filter(function (order) {
      return tabOf(order) === activeTab && matchesFilters(order);
    });

    const noun = orders.length === 1 ? "order" : "orders";
    countEl.textContent = orders.length + " " + noun;

    if (!orders.length) {
      const tabLabel = TAB_LABELS[activeTab] || activeTab;
      body.innerHTML =
        '<tr><td colspan="' + columnCount(pairCount, revisionCount) + '"><div class="empty-state">' +
          "<strong>No " + escapeHtml(tabLabel) + " orders</strong>" +
          "<p>Orders in this category will appear here. Try another tab, or clear a filter.</p>" +
        "</div></td></tr>";
      return;
    }

    body.innerHTML = orders.map(function (order) {
      const status = store.computeStatus(order);
      const pairs = threadPairs(order);
      const rounds = revisionRounds(order);
      const paymentLabel = paymentCopyLabel(order);
      const typeLabel = store.orderTypeLabel(order);
      const statusLabel = statusCopyLabel(order);
      let messageCells = "";
      for (let i = 0; i < pairCount; i += 1) {
        const pair = pairs[i] || { buyer: null, client: null };
        const buyerLabel = "Buyer Message " + (i + 1);
        const clientLabel = "Client Reply " + (i + 1);
        messageCells +=
          mediaCell(messageCellHtml(pair.buyer), messageCopy(pair.buyer), buyerLabel, hasFiles(pair.buyer && pair.buyer.files)) +
          mediaCell(messageCellHtml(pair.client), messageCopy(pair.client), clientLabel, hasFiles(pair.client && pair.client.files));
      }
      let revisionCells = "";
      for (let r = 0; r < revisionCount; r += 1) {
        const round = rounds[r];
        const buyerText = revisionRoleText(round, "buyer");
        const sellerText = revisionRoleText(round, "seller");
        const revLabel = "Revision " + (r + 1);
        revisionCells +=
          mediaCell(revisionRoleHtml(round, "buyer"), buyerText, revLabel + " buyer", revisionRoleHasFiles(round, "buyer")) +
          mediaCell(revisionRoleHtml(round, "seller"), sellerText, revLabel + " seller", revisionRoleHasFiles(round, "seller"));
      }
      return '<tr class="records-row is-' + status + '">' +
        "<td>" + withCopy(stack(order.id, store.formatDate(order.createdAt)), order.id || "", "order ID") + "</td>" +
        "<td>" + withCopy(escapeHtml(order.whatsapp || "—"), order.whatsapp || "", "WhatsApp number") + "</td>" +
        "<td>" + withCopy(escapeHtml(order.name || "—"), order.name || "", "name") + "</td>" +
        "<td>" + withCopy(escapeHtml(order.fiverrId || "—"), order.fiverrId || "", "Fiverr ID name") + "</td>" +
        '<td class="records-clip-cell">' + withCopy(linkCell(order.fiverrGigUrl), order.fiverrGigUrl || "", "Fiverr GIG URL") + "</td>" +
        "<td>" + editableNameCell(order, "clientName", "Add client name", "client name") + "</td>" +
        "<td>" + editableNameCell(order, "businessName", "Add business name", "business name") + "</td>" +
        '<td class="records-value">' + withCopy(formatValue(order.orderValue), order.orderValue == null ? "" : String(order.orderValue), "value") + "</td>" +
        "<td>" + withCopy(escapeHtml(typeLabel || "—"), typeLabel || "", "type") + "</td>" +
        messageCells +
        '<td class="records-clip-cell">' + withCopy(clipText(order.directRequirements), order.directRequirements || "", "direct order requirements") + "</td>" +
        mediaCell(filesCell(order.requirementFiles), filesCopyText(order.requirementFiles), "requirement files", hasFiles(order.requirementFiles)) +
        '<td class="records-clip-cell">' + withCopy(clipText(order.reviewText), order.reviewText || "", "review text") + "</td>" +
        revisionCells +
        "<td>" + withCopy(badge(order.paymentStatus || "in-progress", paymentLabel || "—"), paymentLabel, "payment") + "</td>" +
        "<td>" + withCopy(statusSelect(order), statusLabel, "status") + "</td>" +
        '<td class="records-actions">' +
          '<a class="open-link" href="index.html?order=' + encodeURIComponent(order.id) + '">Edit</a>' +
          '<button type="button" class="ghost-btn is-danger" data-delete-order="' + escapeHtml(order.id) + '">Delete</button>' +
        "</td>" +
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

  function applySheetOrders(result) {
    if (!result || result.skipped) return;
    const list = result.orders || [];
    if (result.ok && typeof store.replaceOrders === "function") {
      store.replaceOrders(list);
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
    countEl.textContent = "Loading…";
    body.innerHTML =
      '<tr><td colspan="21"><div class="empty-state"><strong>Loading orders from Google Sheet</strong></div></td></tr>';
    window.OwlisticSheet.fetchOrders().then(function (result) {
      applySheetOrders(result);
      renderAccountFilter();
      render();
      if (result && result.error && !auth.visibleOrders().length) {
        body.innerHTML =
          '<tr><td colspan="21"><div class="empty-state">' +
            "<strong>Could not load sheet orders</strong>" +
            "<p>" + escapeHtml(result.error) + "</p>" +
          "</div></td></tr>";
      }
    }).catch(function () {
      render();
    });
  }

  renderAccountFilter();
  tabButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      setActiveTab(button.getAttribute("data-tab"));
    });
  });
  loadFromSheet();

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
    showToast(field === "clientName" ? "Client name saved" : "Business name saved");
    const sheet = window.OwlisticSheet;
    if (sheet && typeof sheet.sync === "function") {
      sheet.sync(order).catch(function () {});
    }
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
    const order = store.getOrder(id) || store.getOrder(id);
    const canSee = auth.canSeeOrder || auth.canSeeOrder;
    if (!order || (typeof canSee === "function" && !canSee.call(auth, order))) return;
    const sheet = window.OwlisticSheet;
    if (sheet && typeof sheet.confirmDelete === "function") {
      if (!sheet.confirmDelete(order)) return;
    } else if (!window.confirm("Do you wish to delete order " + id + "?\n\nThis will remove it from the portal and from the Google Sheet.")) {
      return;
    }
    button.disabled = true;
    const finish = function (result) {
      if (store.deleteOrder) store.deleteOrder(id);
      render();
      if (result && result.sheetRemaining) {
        showToast("Deleted from the portal. Deploy Apps Script to remove the Google Sheet row too.");
      } else {
        showToast("Order " + id + " deleted");
      }
    };
    if (sheet && typeof sheet.removeOrder === "function") {
      sheet.removeOrder(order).then(finish).catch(function () {
        if (store.deleteOrder) store.deleteOrder(id);
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
    window.setTimeout(function () {
      if (!input.isConnected) return;
      saveNameField(input.getAttribute("data-edit-order"), input.getAttribute("data-edit-field"), input.value);
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
      const canSee = auth.canSeeOrder || auth.canSeeOrder;
      if (typeof canSee === "function" && !canSee.call(auth, order)) return;
      if (typeof store.setRevisionCompleted === "function") {
        store.setRevisionCompleted(order, revisionId, box.checked);
      } else {
        (order.revisions || []).forEach(function (round) {
          if (String(round.id) === String(revisionId)) round.completed = box.checked;
        });
      }
      store.upsertOrder(order);
      const sheet = window.OwlisticSheet;
      const rounds = store.normalizeRevisions(order.revisions || []);
      const remaining = rounds.filter(function (item) { return !item.completed; }).length;
      render();
      const finish = function () {
        render();
        if (!box.checked) {
          showToast("Revision marked open");
        } else if (remaining) {
          showToast("Revision completed. The next revision is now showing.");
        } else {
          showToast("All revisions complete. Set status to Ready to Approve when it is ready.");
        }
      };
      if (sheet && typeof sheet.sync === "function") {
        sheet.sync(order).then(finish).catch(finish);
        return;
      }
      finish();
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
    else if (typeof store.setBoardStatus === "function") store.setBoardStatus(order, nextTab);
    else {
      order.boardStatus = nextTab;
      order.overallStatus = (store.boardStatusLabel && store.boardStatusLabel(nextTab)) || nextTab;
      order.readyToApprove = nextTab === "completed" || nextTab === "ready-to-approve";
    }
    store.upsertOrder(order);
    const label = (store.boardStatusLabel && store.boardStatusLabel(nextTab)) || select.options[select.selectedIndex].text;
    const sheet = window.OwlisticSheet;
    setActiveTab(tabOf(order));
    showToast("Status set to " + label);
    if (sheet && typeof sheet.sync === "function") {
      sheet.sync(order).catch(function () {});
    }
  });
  [search, dateFilter, accountFilter, paymentFilter, revisionFilter, readyFilter].forEach(function (input) {
    input.addEventListener("input", render);
    input.addEventListener("change", render);
  });
})();
