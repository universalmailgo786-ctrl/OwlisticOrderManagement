(function (global) {
  const pricing = global.OwlisticHanifPricing;
  const sheet = global.OwlisticHanifSheet;
  const auth = global.OwlisticAuth;
  const store = global.OwlisticStore;

  let records = [];
  let selected = {};
  let deps = null;
  let loading = false;

  const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  function el(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatUsd(value) {
    return "$" + pricing.roundMoney(value).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  function formatDateTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString(undefined, { day: "2-digit", month: "2-digit", year: "numeric" }) +
      " · " + date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  function recordKey(record) {
    return String(record && record.orderId || "").trim();
  }

  function getFilters() {
    const monthEl = el("hanif-filter-month");
    const yearEl = el("hanif-filter-year");
    const accountEl = el("hanif-filter-account");
    const paymentEl = el("hanif-filter-payment");
    const searchEl = el("hanif-filter-search");
    const dateEl = el("hanif-filter-date");
    return {
      month: monthEl ? monthEl.value : "",
      year: yearEl ? yearEl.value : "",
      account: accountEl ? accountEl.value : "",
      payment: paymentEl ? paymentEl.value : "",
      search: searchEl ? String(searchEl.value || "").trim().toLowerCase() : "",
      date: dateEl ? dateEl.value : ""
    };
  }

  function recordCreatedParts(record) {
    const text = String(record.createdDate || "");
    const date = new Date(text);
    if (isNaN(date.getTime())) return { year: "", month: "" };
    return { year: String(date.getFullYear()), month: String(date.getMonth() + 1) };
  }

  function matchesFilters(record) {
    const filters = getFilters();
    const parts = recordCreatedParts(record);
    if (filters.year && parts.year !== filters.year) return false;
    if (filters.month && parts.month !== filters.month) return false;
    if (filters.account) {
      const account = String(record.account || "").toLowerCase();
      const fiverr = String(record.fiverrId || "").toLowerCase();
      const wanted = filters.account.toLowerCase();
      if (account !== wanted && fiverr !== wanted) return false;
    }
    if (filters.payment === "paid" && pricing.normalizeHanifPaymentStatus(record.hanifPaymentStatus) !== "paid") return false;
    if (filters.payment === "unpaid" && pricing.normalizeHanifPaymentStatus(record.hanifPaymentStatus) !== "unpaid") return false;
    if (filters.date) {
      const ymd = String(record.createdDate || "").slice(0, 10);
      if (ymd !== filters.date) return false;
    }
    if (filters.search) {
      const haystack = [
        record.orderId,
        record.account,
        record.fiverrId,
        record.clientName,
        record.businessName,
        record.orderStatus
      ].join(" ").toLowerCase();
      if (haystack.indexOf(filters.search) === -1) return false;
    }
    return true;
  }

  function filteredRecords() {
    return records.filter(matchesFilters).sort(function (a, b) {
      return (b.orderNumber || 0) - (a.orderNumber || 0);
    });
  }

  function summarize(list) {
    let totalInvestment = 0;
    let totalHanifCost = 0;
    let totalFiverrFee = 0;
    let totalLoss = 0;
    let totalReturn = 0;
    let totalPaid = 0;
    let totalUnpaid = 0;
    list.forEach(function (record) {
      totalInvestment += pricing.parseMoney(record.orderValue);
      totalHanifCost += pricing.parseMoney(record.hanifCost);
      totalFiverrFee += pricing.parseMoney(record.fiverrFee);
      totalLoss += pricing.parseMoney(record.totalLoss);
      totalReturn += pricing.parseMoney(record.returnAfterFee);
      if (pricing.normalizeHanifPaymentStatus(record.hanifPaymentStatus) === "paid") {
        totalPaid += pricing.parseMoney(record.paidAmount || record.hanifCost);
      } else {
        totalUnpaid += pricing.parseMoney(record.hanifCost);
      }
    });
    return {
      count: list.length,
      totalInvestment: pricing.roundMoney(totalInvestment),
      totalHanifCost: pricing.roundMoney(totalHanifCost),
      totalFiverrFee: pricing.roundMoney(totalFiverrFee),
      totalLoss: pricing.roundMoney(totalLoss),
      totalReturn: pricing.roundMoney(totalReturn),
      totalPaid: pricing.roundMoney(totalPaid),
      totalUnpaid: pricing.roundMoney(totalUnpaid)
    };
  }

  function populateAccountFilter() {
    const select = el("hanif-filter-account");
    if (!select) return;
    const previous = select.value;
    const accounts = {};
    records.forEach(function (record) {
      if (record.account) accounts[record.account] = true;
      if (record.fiverrId) accounts[record.fiverrId] = true;
    });
    select.innerHTML = '<option value="">All Accounts</option>';
    Object.keys(accounts).sort().forEach(function (name) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      select.appendChild(option);
    });
    if (previous) select.value = previous;
  }

  function populateMonthYearFilters() {
    const monthEl = el("hanif-filter-month");
    const yearEl = el("hanif-filter-year");
    if (!monthEl || !yearEl) return;
    const years = {};
    records.forEach(function (record) {
      const parts = recordCreatedParts(record);
      if (parts.year) years[parts.year] = true;
    });
    const yearValues = Object.keys(years).sort().reverse();
    if (!yearValues.length) yearValues.push(String(new Date().getFullYear()));
    const prevYear = yearEl.value;
    yearEl.innerHTML = yearValues.map(function (year) {
      return '<option value="' + year + '">' + year + "</option>";
    }).join("");
    yearEl.value = prevYear && years[prevYear] ? prevYear : yearValues[0];
    const prevMonth = monthEl.value;
    monthEl.innerHTML = '<option value="">All Months</option>' + MONTHS.map(function (name, index) {
      return '<option value="' + String(index + 1) + '">' + name + "</option>";
    }).join("");
    if (prevMonth) monthEl.value = prevMonth;
  }

  function paymentControls(record) {
    const paid = pricing.normalizeHanifPaymentStatus(record.hanifPaymentStatus) === "paid";
    const id = escapeHtml(record.orderId);
    const warning = sheet.costChangedAfterPaid(record)
      ? '<span class="hanif-cost-warning" title="Hanif cost changed after this was marked Paid">Cost changed</span>'
      : "";
    return '<div class="hanif-payment-cell">' +
      '<div class="hanif-payment-toggle" role="group" aria-label="Hanif payment status">' +
        '<button type="button" class="hanif-pay-btn' + (paid ? "" : " is-active is-unpaid") + '" data-hanif-payment="' + id + '" data-status="unpaid">Unpaid</button>' +
        '<button type="button" class="hanif-pay-btn' + (paid ? " is-active is-paid" : "") + '" data-hanif-payment="' + id + '" data-status="paid">Paid</button>' +
      "</div>" +
      warning +
    "</div>";
  }

  function renderSummary(list) {
    const stats = summarize(list);
    const map = {
      "hanif-stat-orders": String(stats.count),
      "hanif-stat-investment": formatUsd(stats.totalInvestment),
      "hanif-stat-hanif-cost": formatUsd(stats.totalHanifCost),
      "hanif-stat-fiverr-fee": formatUsd(stats.totalFiverrFee),
      "hanif-stat-loss": formatUsd(stats.totalLoss),
      "hanif-stat-return": formatUsd(stats.totalReturn),
      "hanif-stat-paid": formatUsd(stats.totalPaid),
      "hanif-stat-unpaid": formatUsd(stats.totalUnpaid),
      "hanif-stat-loss-pkr": "PKR " + Math.round(stats.totalLoss * (pricing.DEFAULT_PKR_RATE || 275)).toLocaleString()
    };
    Object.keys(map).forEach(function (id) {
      const node = el(id);
      if (node) node.textContent = map[id];
    });
  }

  function renderTable() {
    const body = el("hanif-records-body");
    const count = el("hanif-records-count");
    if (!body) return;
    const list = filteredRecords();
    renderSummary(list);
    if (count) count.textContent = list.length + (list.length === 1 ? " record" : " records");
    if (!list.length) {
      body.innerHTML = '<tr><td colspan="13"><div class="empty-state"><strong>No Hanif costing records</strong><p>Try another filter or wait for orders to sync.</p></div></td></tr>';
      return;
    }
    body.innerHTML = list.map(function (record) {
      const id = escapeHtml(record.orderId);
      const checked = selected[record.orderId] ? " checked" : "";
      const accountLabel = [record.account, record.fiverrId].filter(Boolean).join(" · ") || "—";
      return '<tr class="hanif-row' + (sheet.costChangedAfterPaid(record) ? " has-cost-warning" : "") + '">' +
        '<td><input type="checkbox" class="hanif-select-row" data-hanif-select="' + id + '"' + checked + " /></td>" +
        "<td>" + id + "</td>" +
        "<td>" + escapeHtml(formatDate(record.createdDate)) + "</td>" +
        "<td>" + escapeHtml(accountLabel) + "</td>" +
        "<td>" + escapeHtml(record.clientName || "—") + "</td>" +
        "<td>" + escapeHtml(record.businessName || "—") + "</td>" +
        '<td class="hanif-money">' + formatUsd(record.orderValue) + "</td>" +
        '<td class="hanif-money">' + formatUsd(record.hanifCost) + "</td>" +
        '<td class="hanif-money">' + formatUsd(record.fiverrFee) + "</td>" +
        '<td class="hanif-money">' + formatUsd(record.returnAfterFee) + "</td>" +
        '<td class="hanif-money is-loss">' + formatUsd(record.totalLoss) + "</td>" +
        "<td>" + escapeHtml(record.orderStatus || "—") + "</td>" +
        "<td>" + paymentControls(record) + "</td>" +
      "</tr>";
    }).join("");
  }

  function findRecord(orderId) {
    return records.find(function (item) { return item.orderId === orderId; }) || null;
  }

  function savePayment(record) {
    if (!sheet || !record) return Promise.resolve();
    record.updatedAt = new Date().toISOString();
    return sheet.updatePayment(record).then(function () {
      if (deps && deps.showToast) deps.showToast("Payment status saved for " + record.orderId);
    });
  }

  function applyPaymentChange(orderId, status) {
    const record = findRecord(orderId);
    if (!record) return;
    const nextStatus = pricing.normalizeHanifPaymentStatus(status);
    if (pricing.normalizeHanifPaymentStatus(record.hanifPaymentStatus) === nextStatus) return;
    const wasPaid = pricing.normalizeHanifPaymentStatus(record.hanifPaymentStatus) === "paid";
    record.hanifPaymentStatus = nextStatus;
    if (nextStatus === "paid") {
      record.paidAmount = pricing.parseMoney(record.hanifCost);
      if (!wasPaid || !record.paidAt) record.paidAt = new Date().toISOString();
    } else {
      record.paidAmount = 0;
      record.paidAt = "";
    }
    savePayment(record).then(renderTable);
  }

  function mergeOrders(orders, existingRecords) {
    const byId = {};
    (existingRecords || []).forEach(function (record) {
      byId[record.orderId] = record;
    });
    const next = [];
    (orders || []).forEach(function (order) {
      const built = sheet.recordFromOrder(order, byId[order.id]);
      if (built) next.push(built);
    });
    return next;
  }

  function load(orders) {
    if (!auth.isSuperAdmin()) return Promise.resolve();
    loading = true;
    renderTable();
    return sheet.listRecords().then(function (result) {
      const existing = result.records || [];
      const merged = mergeOrders(orders || (store && store.getOrders ? store.getOrders() : []), existing);
      return sheet.syncRecords(merged).then(function () {
        return sheet.listRecords();
      });
    }).then(function (result) {
      records = (result && result.records) || [];
      populateAccountFilter();
      populateMonthYearFilters();
      loading = false;
      renderTable();
    }).catch(function () {
      loading = false;
      if (deps && deps.showToast) deps.showToast("Could not load Hanif costing records.");
      renderTable();
    });
  }

  function showPanel(show) {
    const panel = el("hanif-costing-panel");
    const recordsPanel = el("records-main-panel");
    const pageHeader = el("records-page-header");
    const upgradeBanner = el("sheet-upgrade-banner");
    const scheduleSummary = el("schedule-summary");
    const scheduleFilterRow = el("schedule-filter-row");
    if (panel) panel.hidden = !show;
    if (recordsPanel) recordsPanel.hidden = show;
    if (pageHeader) pageHeader.hidden = show;
    if (upgradeBanner && show) upgradeBanner.hidden = true;
    if (scheduleSummary) scheduleSummary.hidden = show || scheduleSummary.hidden;
    if (scheduleFilterRow) scheduleFilterRow.hidden = show || scheduleFilterRow.hidden;
    document.body.classList.toggle("is-hanif-tab", !!show);
  }

  function exportCsv() {
    const list = filteredRecords();
    const rows = [[
      "Order ID", "Created Date", "Account", "Client Name", "Business Name",
      "Order Value", "Hanif Cost", "Fiverr Fee", "Return After Fee", "Total Loss",
      "Order Status", "Hanif Payment", "Paid Date"
    ]];
    list.forEach(function (record) {
      rows.push([
        record.orderId,
        record.createdDate,
        record.account,
        record.clientName,
        record.businessName,
        record.orderValue,
        record.hanifCost,
        record.fiverrFee,
        record.returnAfterFee,
        record.totalLoss,
        record.orderStatus,
        record.hanifPaymentStatus,
        record.paidAt
      ]);
    });
    const csv = rows.map(function (row) {
      return row.map(function (cell) {
        const text = String(cell == null ? "" : cell);
        return '"' + text.replace(/"/g, '""') + '"';
      }).join(",");
    }).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "hanif-costing.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function bindEvents() {
    ["hanif-filter-month", "hanif-filter-year", "hanif-filter-account", "hanif-filter-payment", "hanif-filter-search", "hanif-filter-date"].forEach(function (id) {
      const node = el(id);
      if (!node) return;
      node.addEventListener("input", renderTable);
      node.addEventListener("change", renderTable);
    });
    const exportBtn = el("hanif-export-btn");
    if (exportBtn) exportBtn.addEventListener("click", exportCsv);
    const body = el("hanif-records-body");
    if (!body) return;
    body.addEventListener("click", function (event) {
      const payBtn = event.target.closest("[data-hanif-payment]");
      if (payBtn) {
        applyPaymentChange(payBtn.getAttribute("data-hanif-payment"), payBtn.getAttribute("data-status"));
      }
    });
    body.addEventListener("change", function (event) {
      const checkbox = event.target.closest("[data-hanif-select]");
      if (checkbox) {
        const orderId = checkbox.getAttribute("data-hanif-select");
        if (checkbox.checked) selected[orderId] = true;
        else delete selected[orderId];
      }
    });
    const selectAll = el("hanif-select-all");
    if (selectAll) {
      selectAll.addEventListener("change", function () {
        const list = filteredRecords();
        list.forEach(function (record) {
          if (selectAll.checked) selected[record.orderId] = true;
          else delete selected[record.orderId];
        });
        renderTable();
      });
    }
    const bulkPaid = el("hanif-bulk-paid");
    const bulkUnpaid = el("hanif-bulk-unpaid");
    function bulkChange(status) {
      const ids = Object.keys(selected);
      if (!ids.length) {
        if (deps && deps.showToast) deps.showToast("Select at least one row.");
        return;
      }
      const label = status === "paid" ? "Paid" : "Unpaid";
      if (!window.confirm("Mark " + ids.length + " selected order(s) as " + label + "?")) return;
      sheet.bulkUpdatePayment(ids, status).then(function () {
        ids.forEach(function (orderId) {
          const record = findRecord(orderId);
          if (!record) return;
          record.hanifPaymentStatus = status;
          if (status === "paid") {
            record.paidAmount = pricing.parseMoney(record.hanifCost);
            record.paidAt = new Date().toISOString();
          } else {
            record.paidAmount = 0;
          }
        });
        selected = {};
        if (deps && deps.showToast) deps.showToast("Updated " + ids.length + " payment status(es).");
        renderTable();
      });
    }
    if (bulkPaid) bulkPaid.addEventListener("click", function () { bulkChange("paid"); });
    if (bulkUnpaid) bulkUnpaid.addEventListener("click", function () { bulkChange("unpaid"); });
  }

  function mount(options) {
    if (!auth.isSuperAdmin()) return;
    deps = options || {};
    bindEvents();
    populateMonthYearFilters();
    showPanel(false);
    renderTable();
  }

  function onTabActivated(orders) {
    if (!auth.isSuperAdmin()) return;
    showPanel(true);
    load(orders);
  }

  function onTabDeactivated() {
    showPanel(false);
  }

  function onOrdersLoaded(orders) {
    if (!auth.isSuperAdmin()) return;
    const panel = el("hanif-costing-panel");
    if (panel && !panel.hidden) load(orders);
    const countEl = document.querySelector('[data-tab-count="hanif-costing"]');
    if (countEl) countEl.textContent = String((orders || []).length);
  }

  function onOrderDeleted(orderId) {
    if (!auth.isSuperAdmin() || !orderId) return;
    records = records.filter(function (record) { return record.orderId !== orderId; });
    delete selected[orderId];
    if (sheet && sheet.deleteRecord) sheet.deleteRecord(orderId);
    renderTable();
  }

  global.OwlisticHanifCosting = {
    mount: mount,
    onTabActivated: onTabActivated,
    onTabDeactivated: onTabDeactivated,
    onOrdersLoaded: onOrdersLoaded,
    onOrderDeleted: onOrderDeleted,
    reload: load
  };
})(window);
