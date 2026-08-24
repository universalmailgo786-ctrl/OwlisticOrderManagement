(function () {
  const store = window.OwlisticStore;
  const auth = window.OwlisticAuth;
  const session = auth.requirePage();
  if (!session) return;
  auth.ensureLocalAccount(session);
  auth.bindNav();

  const body = document.getElementById("records-body");
  const countEl = document.getElementById("records-count");
  const search = document.getElementById("records-search");
  const dateFilter = document.getElementById("filter-date");
  const accountFilter = document.getElementById("filter-account");
  const paymentFilter = document.getElementById("filter-payment");
  const revisionFilter = document.getElementById("filter-revision");
  const readyFilter = document.getElementById("filter-ready");
  const tabButtons = Array.prototype.slice.call(document.querySelectorAll(".records-tab"));
  const TAB_LABELS = {
    "in-progress": "in progress",
    "on-revision": "on revision",
    "ready-to-approve": "ready to approve",
    completed: "completed"
  };

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
    return '<div class="records-files">' + list.map(function (file, index) {
      const name = escapeHtml(file.name);
      const item = file.url
        ? '<a class="records-file-link" href="' + escapeHtml(file.url) + '" target="_blank" rel="noopener noreferrer">' + name + "</a>"
        : "<span>" + name + "</span>";
      return item + (index < list.length - 1 ? '<span class="records-file-sep">, </span>' : "");
    }).join("") + "</div>";
  }

  function linkCell(url) {
    const href = String(url == null ? "" : url).trim();
    if (!href) return '<span class="muted">—</span>';
    const safe = /^https?:\/\//i.test(href) ? href : "https://" + href;
    return '<a class="records-link" href="' + escapeHtml(safe) + '" target="_blank" rel="noopener noreferrer" title="' + escapeHtml(href) + '">' + escapeHtml(href) + "</a>";
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
      ["in-progress", "In Progress"],
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

  function revisionChecks(order) {
    const rounds = store.normalizeRevisions(order.revisions || []);
    if (!rounds.length) return '<span class="muted">No revisions</span>';
    const done = rounds.filter(function (item) { return item.completed; }).length;
    return '<div class="records-revisions">' +
      '<p class="records-revisions-summary">' + done + " of " + rounds.length + " complete</p>" +
      rounds.map(function (round) {
        return '<label class="records-revision-check' + (round.completed ? " is-done" : "") + '">' +
          '<input type="checkbox" data-revision-complete="' + escapeHtml(order.id) + '" data-revision-id="' + escapeHtml(round.id) + '"' + (round.completed ? " checked" : "") + ">" +
          "<span>Revision " + round.number + (round.completed ? " completed" : "") + "</span>" +
        "</label>";
      }).join("") +
    "</div>";
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
    const haystack = [
      order.id,
      order.fiverrId,
      order.name,
      order.businessName,
      order.clientName,
      order.whatsapp,
      order.accountName,
      order.messageText,
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
    const orders = all.slice().sort(function (a, b) {
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    }).filter(function (order) {
      return tabOf(order) === activeTab && matchesFilters(order);
    });

    const noun = orders.length === 1 ? "order" : "orders";
    const tabLabel = TAB_LABELS[activeTab] || activeTab;
    countEl.textContent = orders.length + " " + noun;

    if (!orders.length) {
      body.innerHTML =
        '<tr><td colspan="18"><div class="empty-state">' +
          "<strong>No " + tabLabel + " orders</strong>" +
          "<p>Orders in this category will appear here. Try another tab, or clear a filter.</p>" +
        "</div></td></tr>";
      return;
    }

    body.innerHTML = orders.map(function (order) {
      const status = store.computeStatus(order);
      const openRevisions = typeof store.hasOpenRevisions === "function"
        ? store.hasOpenRevisions(order)
        : store.normalizeRevisions(order.revisions || []).some(function (item) { return !item.completed; });
      return '<tr class="records-row is-' + status + (openRevisions ? " has-open-revision" : "") + '">' +
        "<td>" + stack(order.id, store.formatDate(order.createdAt)) + "</td>" +
        "<td>" + stack(order.accountName || "No account", order.fiverrId || "No Fiverr ID") + "</td>" +
        "<td>" + escapeHtml(order.name || "—") + "</td>" +
        "<td>" + escapeHtml(order.businessName || "—") + "</td>" +
        "<td>" + escapeHtml(order.clientName || "—") + "</td>" +
        '<td class="records-value">' + formatValue(order.orderValue) + "</td>" +
        "<td>" + badge(order.paymentStatus || "in-progress", order.paymentStatus === "paid" ? "Paid" : order.paymentStatus === "unpaid" ? "Unpaid" : "—") + "</td>" +
        "<td>" + escapeHtml(store.orderTypeLabel(order)) + "</td>" +
        '<td class="records-clip-cell">' + clipText(order.messageText) + "</td>" +
        '<td class="records-clip-cell">' + clipText(order.directRequirements) + "</td>" +
        '<td class="records-clip-cell">' + filesCell(order.requirementFiles) + "</td>" +
        "<td>" + escapeHtml(order.fiverrId || "—") + "</td>" +
        '<td class="records-clip-cell">' + linkCell(order.fiverrGigUrl) + "</td>" +
        '<td class="records-clip-cell">' + clipText(order.reviewText) + "</td>" +
        '<td class="records-revisions-cell">' + revisionChecks(order) + "</td>" +
        "<td>" + badge(order.readyToApprove ? "ready-to-approve" : "in-progress", order.readyToApprove ? "Ready" : "Not Ready") + "</td>" +
        "<td>" + statusSelect(order) + "</td>" +
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
          '<tr><td colspan="18"><div class="empty-state">' +
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

  body.addEventListener("click", function (event) {
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
      const finish = function () {
        render();
        showToast(box.checked ? "Revision marked complete" : "Revision marked open");
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
    const finish = function () {
      setActiveTab(nextTab);
      showToast("Status set to " + label);
    };
    if (sheet && typeof sheet.sync === "function") {
      select.disabled = true;
      sheet.sync(order).then(finish).catch(finish);
      return;
    }
    finish();
  });
  [search, dateFilter, accountFilter, paymentFilter, revisionFilter, readyFilter].forEach(function (input) {
    input.addEventListener("input", render);
    input.addEventListener("change", render);
  });
})();
