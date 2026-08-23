(function () {
  const store = window.OwlisticStore;
  const body = document.getElementById("records-body");
  const countEl = document.getElementById("records-count");
  const search = document.getElementById("records-search");
  const dateFilter = document.getElementById("filter-date");
  const accountFilter = document.getElementById("filter-account");
  const paymentFilter = document.getElementById("filter-payment");
  const statusFilter = document.getElementById("filter-status");
  const revisionFilter = document.getElementById("filter-revision");
  const readyFilter = document.getElementById("filter-ready");

  function badge(status, label) {
    const cls = status === "revision-pending" ? "badge-red"
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

  function renderAccountFilter() {
    store.getAccounts().forEach(function (account) {
      const option = document.createElement("option");
      option.value = account.id;
      option.textContent = store.accountLabel(account);
      accountFilter.appendChild(option);
    });
  }

  function matches(order) {
    const query = (search.value || "").trim().toLowerCase();
    const status = store.computeStatus(order);
    const created = order.createdAt ? order.createdAt.slice(0, 10) : "";
    if (dateFilter.value && created !== dateFilter.value) return false;
    if (accountFilter.value && order.accountId !== accountFilter.value) return false;
    if (paymentFilter.value && order.paymentStatus !== paymentFilter.value) return false;
    if (statusFilter.value && status !== statusFilter.value) return false;
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

  function render() {
    const all = store.getOrders();
    const orders = all.slice().sort(function (a, b) {
      return String(b.createdAt || "").localeCompare(String(a.createdAt || ""));
    }).filter(matches);

    const noun = orders.length === 1 ? "order" : "orders";
    countEl.textContent = orders.length === all.length
      ? orders.length + " " + noun
      : orders.length + " of " + all.length + " " + noun;

    if (!orders.length) {
      body.innerHTML =
        '<tr><td colspan="10"><div class="empty-state">' +
          "<strong>No matching orders</strong>" +
          "<p>Try another search, or clear a filter to see saved questionnaires.</p>" +
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
        '<td><a class="open-link" href="index.html?order=' + encodeURIComponent(order.id) + '">Open</a></td>' +
      "</tr>";
    }).join("");
  }

  renderAccountFilter();
  render();
  [search, dateFilter, accountFilter, paymentFilter, statusFilter, revisionFilter, readyFilter].forEach(function (input) {
    input.addEventListener("input", render);
    input.addEventListener("change", render);
  });
})();
