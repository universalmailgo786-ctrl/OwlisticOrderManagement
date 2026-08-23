(function (global) {
  const URL_KEY = "owlistic.sheetWebAppUrl";
  const SPREADSHEET_ID = "1nZuMePQFJA9lCQ6C48d9MUC3Fwn00ao6Kilap5rbFfQ";
  const DEFAULT_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxc9UyzIdr73zkuzHH-8R2tWxOmr3Rc88ApfrVA2RnKObATD3J8PSCJuwtF9FahSmIq/exec";
  const store = global.OwlisticStore || global.OwlisticStore;

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

  function callStore(primary, fallback) {
    const fn = (store && store[primary]) || (store && store[fallback]);
    if (typeof fn === "function") {
      return fn.apply(store, Array.prototype.slice.call(arguments, 2));
    }
    return undefined;
  }

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
    return /^https:\/\/script\.google\.com\/(?:macros\/s|a\/macros\/s)\/.+/i.test(url) && /\/exec\/?$/i.test(url);
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
    const value = order && (order.paymentStatus || order.paymentStatus);
    if (value === "paid" || value === "Paid") return "Paid";
    if (value === "unpaid" || value === "Unpaid") return "Unpaid";
    return "";
  }

  function accountNameOf(orderOrAccount) {
    if (!orderOrAccount) return "";
    if (orderOrAccount.accountName) return orderOrAccount.accountName;
    const labeled = callStore("accountLabel", "accountLabel", orderOrAccount);
    if (labeled && labeled !== "No account" && labeled !== "No account") return labeled;
    return orderOrAccount.name || "";
  }

  function tabNameOf(name) {
    const value = String(name || "").trim();
    if (!value || /^(no account|no account)$/i.test(value)) return "";
    return value;
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
    const rounds = callStore("normalizeRevisions", "normalizeRevisions", order.revisions || []) || [];
    return rounds.map(function (round) {
      const messages = (round.messages || []).map(function (message) {
        const role = message.role === "seller" || message.kind === "seller" ? "Seller" : "Buyer";
        const stamp = formatDateTime(message.createdAt || message.createdAt);
        const parts = [role + (stamp ? " (" + stamp + ")" : ""), (message.text || "").trim() || "(no text)"];
        const files = fileNames(message.files);
        if (files) parts.push("Files: " + files);
        return parts.join(" — ");
      });
      return "Revision " + (round.number || "") + (messages.length ? ": " + messages.join(" | ") : ": (empty)");
    }).join("\n");
  }

  function toRow(order) {
    const rounds = callStore("normalizeRevisions", "normalizeRevisions", order.revisions || []) || [];
    const current = callStore("currentRevision", "currentRevision", order);
    const status = callStore("computeStatus", "computeStatus", order);
    const typeLabel = callStore("orderTypeLabel", "orderTypeLabel", order) || "";
    const statusLabel = callStore("statusLabel", "statusLabel", status) || String(status || "");
    return [
      order.id || "",
      formatDate(order.createdAt || order.createdAt),
      formatTime(order.createdAt || order.createdAt),
      formatDate(order.updatedAt || order.updatedAt),
      formatTime(order.updatedAt || order.updatedAt),
      accountNameOf(order),
      order.whatsapp || "",
      order.name || "",
      order.orderValue || order.orderValue || "",
      paymentLabel(order),
      order.searchKeyword || order.searchKeyword || "",
      typeLabel,
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
      statusLabel
    ];
  }

  function postPayload(payload) {
    if (!isConfigured()) {
      return Promise.resolve({ skipped: true });
    }
    return fetch(getWebAppUrl(), {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    }).then(function () {
      return { ok: true };
    });
  }

  function ensureTabs(accounts) {
    const tabs = (accounts || []).map(function (account) {
      return {
        id: account.id || "",
        name: tabNameOf(accountNameOf(account))
      };
    }).filter(function (item) {
      return item.name;
    });
    if (!tabs.length) {
      return Promise.resolve({ skipped: true, empty: true });
    }
    return postPayload({
      action: "ensureTabs",
      accounts: tabs
    });
  }

  function sync(order) {
    if (!order) {
      return Promise.resolve({ skipped: true });
    }
    const tabName = tabNameOf(accountNameOf(order));
    return postPayload({
      action: "upsert",
      orderId: order.id,
      accountName: accountNameOf(order),
      tabName: tabName,
      row: toRow(order)
    });
  }

  global.OwlisticSheet = {
    HEADERS: HEADERS,
    SPREADSHEET_ID: SPREADSHEET_ID,
    sync: sync,
    ensureTabs: ensureTabs,
    toRow: toRow,
    isConfigured: isConfigured,
    getWebAppUrl: getWebAppUrl,
    setWebAppUrl: setWebAppUrl,
    get scriptSource() {
      return "";
    }
  };
})(window);
