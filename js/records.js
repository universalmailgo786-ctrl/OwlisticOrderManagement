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
    completed: "completed",
    "on-revision": "on revision"
  };

  let activeTab = "in-progress";

  function badge(status, label) {
    const cls = status === "revision-pending" || status === "revision-pending" || status === "on-revision" ? "badge-red"
      : status === "ready-to-approve" || status === "completed" ? "badge-green"
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

  function tabOf(order) {
    if (typeof store.recordTab === "function") return store.recordTab(order);
    const status = store.computeStatus(order);
    if (status === "ready-to-approve") return "completed";
    if (status === "revision-pending" || status === "revision-pending") return "on-revision";
    return "in-progress";
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
    const haystack = [order.id, order.fiverrId, order.name, order.whatsapp, order.accountName]
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
    const counts = { "in-progress": 0, completed: 0, "on-revision": 0 };
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
        '<tr><td colspan="10"><div class="empty-state">' +
          "<strong>No " + tabLabel + " orders</strong>" +
          "<p>Orders in this category will appear here. Try another tab, or clear a filter.</p>" +
        "</div></td></tr>";
      return;
    }

    body.innerHTML = orders.map(function (order) {
      const status = store.computeStatus(order);
      const rounds = store.normalizeRevisions(order.revisions || []);
      const revisionLabel = rounds.length
        ? (rounds.length === 1 ? "1 revision" : rounds.length + " revisions")
        : "No revisions";
      return '<tr class="records-row is-' + status + '">' +
        "<td>" + stack(order.id, store.formatDate(order.createdAt)) + "</td>" +
        "<td>" + stack(order.accountName || "No account", order.fiverrId || "No Fiverr ID") + "</td>" +
        "<td>" + escapeHtml(order.name || "—") + "</td>" +
        '<td class="records-value">' + formatValue(order.orderValue) + "</td>" +
        "<td>" + badge(order.paymentStatus || "in-progress", order.paymentStatus === "paid" ? "Paid" : order.paymentStatus === "unpaid" ? "Unpaid" : "—") + "</td>" +
        "<td>" + escapeHtml(store.orderTypeLabel(order)) + "</td>" +
        "<td>" + badge(rounds.length ? "completed" : "in-progress", revisionLabel) + "</td>" +
        "<td>" + badge(order.readyToApprove ? "ready-to-approve" : "in-progress", order.readyToApprove ? "Ready" : "Not Ready") + "</td>" +
        "<td>" + badge(status, store.statusLabel(status)) + "</td>" +
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
        store.importOrders(result.orders);
      }
      renderAccountFilter();
      render();
      if (result && result.error && !auth.visibleOrders().length) {
        body.innerHTML =
          '<tr><td colspan="10"><div class="empty-state">' +
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
  body.addEventListener("click", function (event) {
    const button = event.target.closest("[data-delete-order]");
    if (!button) return;
    const id = button.getAttribute("data-delete-order");
    const order = store.getOrder(id);
    if (!order || !auth.canSeeOrder(order)) return;
    if (!window.confirm("Delete order " + id + "? This removes it from Order Records and the Google Sheet.")) return;
    store.deleteOrder(id);
    if (window.OwlisticSheet && typeof window.OwlisticSheet.deleteOrder === "function") {
      window.OwlisticSheet.deleteOrder(order);
    }
    render();
  });
  [search, dateFilter, accountFilter, paymentFilter, revisionFilter, readyFilter].forEach(function (input) {
    input.addEventListener("input", render);
    input.addEventListener("change", render);
  });
})();
