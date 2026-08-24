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

  function requirementFileList(files) {
    if (!files) return [];
    if (typeof files === "string") {
      return files.split(/\n|;|,/).map(function (part) {
        const chunk = String(part || "").trim();
        if (!chunk) return null;
        const pipe = chunk.indexOf("|");
        if (pipe >= 0) {
          return { name: chunk.slice(0, pipe).trim(), url: chunk.slice(pipe + 1).trim() };
        }
        const match = chunk.match(/^(.*)\s+(https?:\/\/\S+)\s*$/i);
        if (match) return { name: String(match[1] || "").trim(), url: String(match[2] || "").trim() };
        return { name: chunk, url: "" };
      }).filter(function (file) { return file && file.name; });
    }
    if (!Array.isArray(files)) return [];
    return files.map(function (file) {
      if (!file) return null;
      if (typeof file === "string") return { name: file, url: "" };
      return {
        name: file.name || file.fileName || "",
        url: file.url || file.link || ""
      };
    }).filter(function (file) { return file && file.name; });
  }

  function filesCell(files) {
    const list = requirementFileList(files);
    if (!list.length) return '<span class="muted">—</span>';
    const title = escapeHtml(filesCopyText(files));
    return '<div class="records-files" title="' + title + '">' + list.map(function (file, index) {
      const name = escapeHtml(file.name);
      const item = file.url
        ? '<a class="records-file-link" href="' + escapeHtml(file.url) + '" target="_blank" rel="noopener noreferrer">' + name + "</a>"
        : "<span>" + name + "</span>";
      return item + (index < list.length - 1 ? '<span class="records-file-sep">, </span>' : "");
    }).join("") + "</div>";
  }

  function filesCopyText(files) {
    return requirementFileList(files).map(function (file) {
      return file.url ? file.name + " " + file.url : file.name;
    }).join("\n");
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
    const files = (message.files || []).map(function (file) { return file && file.name; }).filter(Boolean).join(", ");
    if (text && files) return text + "\nFiles: " + files;
    return text || (files ? "Files: " + files : "");
  }

  function messageCellHtml(message) {
    if (!message) return '<span class="muted">—</span>';
    const text = String(message.text || "").trim();
    const files = (message.files || []).map(function (file) { return file && file.name; }).filter(Boolean).join(", ");
    const display = text && files ? text + " · " + files : (text || files);
    if (!display) return '<span class="muted">—</span>';
    return '<div class="records-clip" title="' + escapeHtml(messageCopy(message)) + '">' + escapeHtml(display) + "</div>";
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
    if (typeof store.recordTab === "function") return store.recordTab(order);
    if (typeof store.recordTab === "function") return store.recordTab(order);
    const status = store.computeStatus(order);
    if (status === "completed") return "completed";
    if (status === "ready-to-approve") return "ready-to-approve";
    if (status === "revision-pending" || status === "revision-pending") return "on-revision";
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

  function columnCount(pairCount) {
    return 15 + (pairCount * 2);
  }

  function renderHead(pairCount) {
    const messageHeads = [];
    for (let i = 1; i <= pairCount; i += 1) {
      messageHeads.push("<th>Buyer Message " + i + "</th>");
      messageHeads.push("<th>Client Reply " + i + "</th>");
    }
    headRow.innerHTML =
      "<th>Order</th>" +
      "<th>WhatsApp Number</th>" +
      "<th>Name</th>" +
      "<th>Client Name</th>" +
      "<th>Business Name</th>" +
      "<th>Value</th>" +
      "<th>Type</th>" +
      messageHeads.join("") +
      "<th>Direct Order Requirements</th>" +
      "<th>Requirement Files</th>" +
      "<th>Fiverr ID Name</th>" +
      "<th>Fiverr GIG URL</th>" +
      "<th>Review Text (Feedback)</th>" +
      "<th>Payment</th>" +
      "<th>Status</th>" +
      "<th>Actions</th>";
    if (table) table.style.minWidth = String(1680 + pairCount * 360) + "px";
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
    renderHead(pairCount);
    const orders = all.slice().sort(function (a, b) {
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    }).filter(function (order) {
      return tabOf(order) === activeTab && matchesFilters(order);
    });

    const noun = orders.length === 1 ? "order" : "orders";
    countEl.textContent = orders.length + " " + noun;

    if (!orders.length) {
      const tabLabel = TAB_LABELS[activeTab] || activeTab;
      body.innerHTML =
        '<tr><td colspan="' + columnCount(pairCount) + '"><div class="empty-state">' +
          "<strong>No " + escapeHtml(tabLabel) + " orders</strong>" +
          "<p>Orders in this category will appear here. Try another tab, or clear a filter.</p>" +
        "</div></td></tr>";
      return;
    }

    body.innerHTML = orders.map(function (order) {
      const status = store.computeStatus(order);
      const openRevisions = typeof store.hasOpenRevisions === "function"
        ? store.hasOpenRevisions(order)
        : store.normalizeRevisions(order.revisions || []).some(function (item) { return !item.completed; });
      const pairs = threadPairs(order);
      const paymentLabel = paymentCopyLabel(order);
      const typeLabel = store.orderTypeLabel(order);
      const statusLabel = statusCopyLabel(order);
      let messageCells = "";
      for (let i = 0; i < pairCount; i += 1) {
        const pair = pairs[i] || { buyer: null, client: null };
        const buyerLabel = "Buyer Message " + (i + 1);
        const clientLabel = "Client Reply " + (i + 1);
        messageCells +=
          '<td class="records-clip-cell">' + withCopy(messageCellHtml(pair.buyer), messageCopy(pair.buyer), buyerLabel) + "</td>" +
          '<td class="records-clip-cell">' + withCopy(messageCellHtml(pair.client), messageCopy(pair.client), clientLabel) + "</td>";
      }
      return '<tr class="records-row is-' + status + (openRevisions ? " has-open-revision" : "") + '">' +
        "<td>" + withCopy(stack(order.id, store.formatDate(order.createdAt)), order.id || "", "order ID") + "</td>" +
        "<td>" + withCopy(escapeHtml(order.whatsapp || "—"), order.whatsapp || "", "WhatsApp number") + "</td>" +
        "<td>" + withCopy(escapeHtml(order.name || "—"), order.name || "", "name") + "</td>" +
        "<td>" + editableNameCell(order, "clientName", "Add client name", "client name") + "</td>" +
        "<td>" + editableNameCell(order, "businessName", "Add business name", "business name") + "</td>" +
        '<td class="records-value">' + withCopy(formatValue(order.orderValue), order.orderValue == null ? "" : String(order.orderValue), "value") + "</td>" +
        "<td>" + withCopy(escapeHtml(typeLabel || "—"), typeLabel || "", "type") + "</td>" +
        messageCells +
        '<td class="records-clip-cell">' + withCopy(clipText(order.directRequirements), order.directRequirements || "", "direct order requirements") + "</td>" +
        '<td class="records-clip-cell">' + withCopy(filesCell(order.requirementFiles), filesCopyText(order.requirementFiles), "requirement files") + "</td>" +
        "<td>" + withCopy(escapeHtml(order.fiverrId || "—"), order.fiverrId || "", "Fiverr ID name") + "</td>" +
        '<td class="records-clip-cell">' + withCopy(linkCell(order.fiverrGigUrl), order.fiverrGigUrl || "", "Fiverr GIG URL") + "</td>" +
        '<td class="records-clip-cell">' + withCopy(clipText(order.reviewText), order.reviewText || "", "review text") + "</td>" +
        "<td>" + withCopy(badge(order.paymentStatus || "in-progress", paymentLabel || "—"), paymentLabel, "payment") + "</td>" +
        "<td>" + withCopy(statusSelect(order), statusLabel, "status") + "</td>" +
        '<td class="records-actions">' +
          '<a class="open-link" href="index.html?order=' + encodeURIComponent(order.id) + '">Edit</a>' +
          '<button type="button" class="ghost-btn is-danger" data-delete-order="' + escapeHtml(order.id) + '">Delete</button>' +
        "</td>" +
      "</tr>";
    }).join("");
  }

  function loadFromSheet() {
    if (!window.OwlisticSheet || typeof window.OwlisticSheet.fetchOrders !== "function") {
      render();
      return;
    }
    countEl.textContent = "Loading…";
    window.OwlisticSheet.fetchOrders().then(function (result) {
      if (result && result.orders && result.orders.length) {
        const importFn = store.importOrders || store.importOrders;
        if (typeof importFn === "function") importFn.call(store, result.orders);
      }
      renderAccountFilter();
      render();
      if (result && result.error && !auth.visibleOrders().length) {
        body.innerHTML =
          '<tr><td colspan="21"><div class="empty-state">' +
            "<strong>Could not load sheet orders</strong>" +
            "<p>" + escapeHtml(result.error) + "</p>" +
          "</div></td></tr>";
      }
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
        setActiveTab("on-revision");
        showToast("Revision " + (order.revisions && order.revisions.length ? order.revisions.length : 1) + " added");
      };
      const sheet = window.OwlisticSheet;
      setActiveTab("on-revision");
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
    setActiveTab(nextTab);
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
