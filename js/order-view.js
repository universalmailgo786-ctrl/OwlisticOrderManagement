(function () {
  const store = window.OwlisticStore;
  const auth = window.OwlisticAuth;
  const titleEl = document.getElementById("order-view-title");
  const metaEl = document.getElementById("order-view-meta");
  const bodyEl = document.getElementById("order-view-body");
  const editLink = document.getElementById("order-view-edit");

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function display(value) {
    const text = String(value == null ? "" : value).trim();
    return text ? escapeHtml(text) : '<span class="order-view-empty">—</span>';
  }

  function formatMoney(value) {
    if (value == null || value === "") return "—";
    const num = Number(String(value).replace(/[^0-9.\-]/g, ""));
    if (!isNaN(num) && String(value).trim() !== "") {
      return "$" + num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
    }
    return escapeHtml(value);
  }

  function paymentLabel(order) {
    const raw = String((order && order.paymentStatus) || "").trim().toLowerCase();
    if (raw === "paid") return "Paid";
    if (raw === "unpaid") return "Unpaid";
    return "—";
  }

  function boardLabel(order) {
    if (store && typeof store.boardStatusLabel === "function") {
      const tab = store.boardStatusOf ? store.boardStatusOf(order) : order.boardStatus;
      return store.boardStatusLabel(tab) || order.overallStatus || "—";
    }
    return order.overallStatus || order.boardStatus || "—";
  }

  function orderTypeLabel(order) {
    if (store && typeof store.orderTypeLabel === "function") {
      return store.orderTypeLabel(order) || "—";
    }
    const parts = [];
    if (order.orderTypeCustom) parts.push("Custom (Message)");
    if (order.orderTypeDirect) parts.push("Direct");
    return parts.join(", ") || "—";
  }

  function placementLabel(order) {
    if (store && typeof store.placementStatusOf === "function") {
      return store.placementStatusOf(order) || order.placementStatus || "—";
    }
    return order.placementStatus || "—";
  }

  function formatPlaceOn(order) {
    if (store && typeof store.formatPlaceOn === "function") {
      return store.formatPlaceOn(order.placeOn) || "—";
    }
    return order.placeOn || "—";
  }

  function section(title, inner) {
    return '<section class="order-view-section">' +
      "<h2>" + escapeHtml(title) + "</h2>" +
      inner +
    "</section>";
  }

  function field(label, valueHtml) {
    return '<div class="order-view-field">' +
      '<span class="order-view-label">' + escapeHtml(label) + "</span>" +
      '<div class="order-view-value">' + valueHtml + "</div>" +
    "</div>";
  }

  function grid(fieldsHtml) {
    return '<div class="order-view-grid">' + fieldsHtml + "</div>";
  }

  function linkValue(url) {
    const text = String(url || "").trim();
    if (!text) return display("");
    const safe = escapeHtml(text);
    if (/^https?:\/\//i.test(text)) {
      return '<a href="' + safe + '" target="_blank" rel="noopener noreferrer">' + safe + "</a>";
    }
    return safe;
  }

  function multiline(value) {
    const text = String(value || "").trim();
    if (!text) return display("");
    return '<div class="order-view-multiline">' + escapeHtml(text).replace(/\n/g, "<br>") + "</div>";
  }

  function threadPairs(order) {
    if (store && typeof store.pairMessageThread === "function") {
      const thread = store.messageThreadOf ? store.messageThreadOf(order) : (order.messageThread || []);
      return store.pairMessageThread(thread);
    }
    return [];
  }

  function renderThread(order) {
    const pairs = threadPairs(order);
    if (!pairs.length) {
      const fallback = String(order.messageText || "").trim();
      if (!fallback) return '<p class="order-view-empty-block">No buyer messages yet.</p>';
      return multiline(fallback);
    }
    return '<div class="order-view-thread">' + pairs.map(function (pair, index) {
      const buyer = pair.buyer || pair.client || null;
      const seller = pair.seller || null;
      return '<article class="order-view-thread-pair">' +
        '<p class="order-view-thread-kicker">Chat ' + (index + 1) + "</p>" +
        '<div class="order-view-thread-row">' +
          '<span class="order-view-thread-role">Buyer</span>' +
          '<div class="order-view-thread-copy">' + (buyer && buyer.text ? multiline(buyer.text) : display("")) + "</div>" +
        "</div>" +
        '<div class="order-view-thread-row">' +
          '<span class="order-view-thread-role">Seller</span>' +
          '<div class="order-view-thread-copy">' + (seller && seller.text ? multiline(seller.text) : display("")) + "</div>" +
        "</div>" +
      "</article>";
    }).join("") + "</div>";
  }

  function fileList(files) {
    const list = (files || []).filter(Boolean);
    if (!list.length) return '<p class="order-view-empty-block">No files attached.</p>';
    return '<ul class="order-view-files">' + list.map(function (file) {
      const name = file.fileName || file.name || "file";
      const url = file.url || file.imageUrl || file.previewUrl || "";
      const link = url
        ? '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(name) + "</a>"
        : escapeHtml(name);
      return "<li>" + link + "</li>";
    }).join("") + "</ul>";
  }

  function revisionRoleText(round, role) {
    const messages = (round && round.messages) || [];
    for (let i = 0; i < messages.length; i += 1) {
      const msg = messages[i];
      const msgRole = msg && (msg.role === "seller" || msg.kind === "seller") ? "seller" : "buyer";
      if (msgRole === role && String(msg.text || "").trim()) return String(msg.text).trim();
    }
    return "";
  }

  function subStatusLabel(sub) {
    if (!sub) return "Pending";
    if (sub.completed || sub.status === "completed") return "Completed";
    if (sub.status === "active") return "Latest";
    return "Pending";
  }

  function renderRevisions(order) {
    const rounds = store && typeof store.normalizeRevisions === "function"
      ? store.normalizeRevisions(order.revisions || [])
      : (order.revisions || []);
    if (!rounds.length) {
      return '<p class="order-view-empty-block">No revisions yet.</p>';
    }
    return '<div class="order-view-revisions">' + rounds.map(function (round) {
      const subs = (round.subRevisions || []).slice().sort(function (a, b) {
        return (a.subRevisionNumber || 0) - (b.subRevisionNumber || 0);
      });
      const subsHtml = subs.length
        ? '<div class="order-view-subrevs">' + subs.map(function (sub) {
          return '<article class="order-view-subrev">' +
            '<header><strong>R' + round.number + " - Sub Revision " + (sub.subRevisionNumber || "") + "</strong>" +
            '<span class="order-view-badge">' + escapeHtml(subStatusLabel(sub)) + "</span></header>" +
            field("Buyer revision", multiline(sub.buyerRevision)) +
            field("Seller reply", multiline(sub.sellerReply)) +
          "</article>";
        }).join("") + "</div>"
        : "";
      return '<article class="order-view-revision">' +
        '<header class="order-view-revision-head">' +
          "<h3>Main Revision " + round.number + "</h3>" +
          '<span class="order-view-badge">' + (round.completed ? "Completed" : "Open") + "</span>" +
        "</header>" +
        field("Buyer revision", multiline(revisionRoleText(round, "buyer"))) +
        field("Seller reply", multiline(revisionRoleText(round, "seller"))) +
        subsHtml +
      "</article>";
    }).join("") + "</div>";
  }

  function renderOrder(order) {
    if (!titleEl || !metaEl || !bodyEl) return;
    titleEl.textContent = order.id || "Order";
    metaEl.textContent = [
      order.accountName || "Account",
      order.createdAt && store.formatDateTime ? "Created " + store.formatDateTime(order.createdAt) : "",
      order.updatedAt && store.formatDateTime ? "Updated " + store.formatDateTime(order.updatedAt) : ""
    ].filter(Boolean).join(" · ");
    if (editLink) {
      editLink.href = "index.html?order=" + encodeURIComponent(order.id || "");
    }

    const overview = grid(
      field("Order ID", display(order.id)) +
      field("Account", display(order.accountName)) +
      field("Status", display(boardLabel(order))) +
      field("Payment", display(paymentLabel(order))) +
      field("Order value", formatMoney(order.orderValue)) +
      field("Order type", display(orderTypeLabel(order))) +
      field("Search keyword", display(order.searchKeyword))
    );

    const contact = grid(
      field("WhatsApp", display(order.whatsapp)) +
      field("Your name", display(order.name)) +
      field("Fiverr ID", display(order.fiverrId)) +
      field("Fiverr GIG URL", linkValue(order.fiverrGigUrl)) +
      field("Client name", display(order.clientName)) +
      field("Business name", display(order.businessName))
    );

    const schedule = grid(
      field("Place on", display(formatPlaceOn(order))) +
      field("Placement status", display(placementLabel(order))) +
      field("Scheduled by", display(order.scheduledBy)) +
      field("Schedule updated", order.scheduleUpdatedAt && store.formatDateTime ? display(store.formatDateTime(order.scheduleUpdatedAt)) : display("")) +
      field("Placed at", order.placedAt && store.formatDateTime ? display(store.formatDateTime(order.placedAt)) : display(""))
    );

    bodyEl.innerHTML =
      section("Overview", overview) +
      section("Contact & account", contact) +
      section("Schedule", schedule) +
      section("Buyer messages", renderThread(order)) +
      section("Direct order requirements", multiline(order.directRequirements)) +
      section("Requirement files", fileList(order.requirementFiles)) +
      section("Review / feedback", multiline(order.reviewText)) +
      section("Revision history", renderRevisions(order));
  }

  function showMissing(message) {
    if (titleEl) titleEl.textContent = "Order not found";
    if (metaEl) metaEl.textContent = "";
    if (bodyEl) {
      bodyEl.innerHTML = '<div class="empty-state"><strong>' + escapeHtml(message) + '</strong><p><a href="records.html">Back to Order Records</a></p></div>';
    }
    if (editLink) editLink.hidden = true;
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

    const sheet = window.OwlisticSheet;
    if (!sheet || typeof sheet.fetchOrder !== "function") return;
    sheet.fetchOrder(order).then(function (result) {
      if (!result || !result.found || !result.order) return;
      const remote = result.order;
      if (!auth.canSeeOrder(remote)) return;
      if (typeof store.importOrders === "function") {
        store.importOrders([remote]);
      }
      const fresh = store.getOrder(orderId);
      if (fresh) renderOrder(fresh);
    }).catch(function () {});
  }

  function init() {
    if (!auth.requirePage()) return;
    auth.bindNav();
    const orderId = new URLSearchParams(window.location.search).get("order");
    if (!orderId) {
      showMissing("No order was selected.");
      return;
    }
    loadOrder(orderId);
  }

  init();
})();
