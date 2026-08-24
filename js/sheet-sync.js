(function (global) {
  const URL_KEY = "owlistic.sheetWebAppUrl";
  const SPREADSHEET_ID = "1nZuMePQFJA9lCQ6C48d9MUC3Fwn00ao6Kilap5rbFfQ";
  const DEFAULT_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbytKcOqCtxVNXpPWmD6hQ7inpefem-MIf2ThOQEmCqKKgDLQVk1IlHIfIXstFznpwwM/exec";
  const STALE_WEB_APP_URLS = [
    "https://script.google.com/macros/s/AKfycbxc9UyzIdr73zkuzHH-8R2tWxOmr3Rc88ApfrVA2RnKObATD3J8PSCJuwtF9FahSmIq/exec",
    "https://script.google.com/macros/s/AKfycbyLFBc8mr5QL_Hz3wpIfelJfyv_SbDUfbu1plPvzmUbClJzXF_MuHbPijOwzl9wPLuELw/exec"
  ];
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
    "Overall Status",
    "Business Name",
    "Client Name"
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
      const stored = (localStorage.getItem(URL_KEY) || "").trim();
      if (!stored || STALE_WEB_APP_URLS.indexOf(stored) >= 0) {
        if (stored) localStorage.setItem(URL_KEY, DEFAULT_WEB_APP_URL);
        return DEFAULT_WEB_APP_URL;
      }
      return stored;
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

  const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
  const sentFileIds = {};

  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () {
        const text = String(reader.result || "");
        const comma = text.indexOf(",");
        resolve(comma >= 0 ? text.slice(comma + 1) : text);
      };
      reader.onerror = function () {
        reject(reader.error);
      };
      reader.readAsDataURL(blob);
    });
  }

  function collectUploads(files, options) {
    const force = options && options.forceUploads;
    const skippedLarge = [];
    const pending = (files || []).filter(function (file) {
      if (!file || file.url || !file.id) return false;
      if (!force && sentFileIds[file.id]) return false;
      return true;
    });
    return Promise.all(pending.map(function (file) {
      const getFile = store && (store.getFile || store.getFile);
      if (typeof getFile !== "function") return Promise.resolve(null);
      return getFile(file.id).then(function (record) {
        const blob = record && (record.blob || record.blob);
        if (!blob) return null;
        const size = blob.size || file.size || 0;
        if (size > MAX_UPLOAD_BYTES) {
          skippedLarge.push(file.name || "file");
          return null;
        }
        return blobToBase64(blob).then(function (data) {
          return {
            name: file.name || record.name || "file",
            mimeType: record.type || file.type || blob.type || "application/octet-stream",
            data: data,
            localId: file.id
          };
        });
      }).catch(function () {
        return null;
      });
    })).then(function (list) {
      return { uploads: list.filter(Boolean), skippedLarge: skippedLarge };
    });
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
      return "Revision " + (round.number || "") + (round.completed ? " [Completed]" : " [Open]") + (messages.length ? ": " + messages.join(" | ") : ": (empty)");
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
      order.messageText || callStore("formatMessageThread", "formatMessageThread", order.messageThread || []) || "",
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
      statusLabel,
      order.businessName || "",
      order.clientName || ""
    ];
  }

  function postPayload(payload) {
    if (!isConfigured()) {
      return Promise.resolve({ skipped: true });
    }
    if (global.OwlisticAuth && typeof global.OwlisticAuth.sheetAuth === "function") {
      payload = global.OwlisticAuth.sheetAuth(payload);
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

  function deleteOrder(order) {
    if (!order || !order.id) {
      return Promise.resolve({ skipped: true });
    }
    return postPayload({
      action: "deleteOrder",
      orderId: order.id,
      accountName: accountNameOf(order),
      tabName: tabNameOf(accountNameOf(order))
    });
  }

  function confirmDelete(order) {
    const id = order && order.id ? order.id : "this order";
    return window.confirm("Do you wish to delete order " + id + "?\n\nThis will remove it from the portal and from the Google Sheet.");
  }

  function removeOrder(order) {
    if (!order || !order.id) {
      return Promise.resolve({ skipped: true });
    }
    const id = order.id;
    return deleteOrder(order).then(function () {
      if (store && typeof store.deleteOrder === "function") store.deleteOrder(id);
      return fetchOrders().then(function (result) {
        const sheetOrders = (result && result.orders) || [];
        const stillOnSheet = sheetOrders.some(function (item) { return item.id === id; });
        if (store && typeof (store.importOrders || store.importOrders) === "function") {
          (store.importOrders || store.importOrders)(sheetOrders.filter(function (item) { return item.id !== id; }));
        }
        if (store && typeof store.deleteOrder === "function") store.deleteOrder(id);
        return {
          ok: true,
          removedLocal: true,
          sheetRemaining: stillOnSheet,
          error: stillOnSheet ? "Deleted in the portal, but the Google Sheet row is still there. Deploy the latest Apps Script." : ""
        };
      }).catch(function () {
        return { ok: true, removedLocal: true, sheetUnknown: true };
      });
    });
  }

  function upsertUser(user) {
    if (!user || !user.username) {
      return Promise.resolve({ skipped: true, empty: true });
    }
    return postPayload({
      action: "upsertUser",
      username: String(user.username || "").trim(),
      password: String(user.password || ""),
      account: tabNameOf(user.account || user.accountName || ""),
      displayName: String(user.displayName || user.name || user.username || "").trim(),
      active: user.active === false ? "No" : "Yes"
    });
  }

  function sync(order, options) {
    if (!order) {
      return Promise.resolve({ skipped: true });
    }
    const tabName = tabNameOf(accountNameOf(order));
    const extraFiles = [];
    (order.messageThread || []).forEach(function (message) {
      (message.files || []).forEach(function (file) { extraFiles.push(file); });
    });
    return collectUploads((order.requirementFiles || []).concat(extraFiles), options || {}).then(function (collected) {
      (collected.uploads || []).forEach(function (item) {
        if (item.localId) sentFileIds[item.localId] = true;
      });
      return postPayload({
        action: "upsert",
        orderId: order.id,
        accountName: accountNameOf(order),
        tabName: tabName,
        businessName: order.businessName || "",
        clientName: order.clientName || "",
        row: toRow(order),
        uploads: (collected.uploads || []).map(function (item) {
          return {
            name: item.name,
            mimeType: item.mimeType,
            data: item.data
          };
        })
      }).then(function (result) {
        result = result || { ok: true };
        result.skippedLarge = collected.skippedLarge || [];
        return result;
      });
    });
  }

  function parseJson(text) {
    const raw = String(text || "").trim();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (err) {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return null;
      try { return JSON.parse(match[0]); } catch (err2) { return null; }
    }
  }

  function fetchOrders() {
    if (!isConfigured()) {
      return Promise.resolve({ skipped: true, orders: [] });
    }
    const session = global.OwlisticAuth && global.OwlisticAuth.getSession && global.OwlisticAuth.getSession();
    const join = getWebAppUrl().indexOf("?") >= 0 ? "&" : "?";
    const url = getWebAppUrl() + join +
      "action=listOrders" +
      "&role=" + encodeURIComponent((session && session.role) || "") +
      "&userAccount=" + encodeURIComponent((session && session.account) || "") +
      "&username=" + encodeURIComponent((session && session.username) || "");
    return fetch(url, { method: "GET", credentials: "omit" }).then(function (response) {
      return response.text();
    }).then(function (text) {
      const data = parseJson(text);
      if (!data) return { ok: false, error: "Could not read orders from Google Sheet.", orders: [] };
      if (!data.ok) return { ok: false, error: data.error || "Could not load orders.", orders: [] };
      if (data.action !== "listOrders") {
        return {
          ok: false,
          error: "Deploy a new version of the Apps Script web app so Order Records can load the sheet.",
          orders: []
        };
      }
      return { ok: true, orders: data.orders || [] };
    }).catch(function () {
      return { ok: false, error: "Could not reach Google Sheet.", orders: [] };
    });
  }

  global.OwlisticSheet = {
    HEADERS: HEADERS,
    SPREADSHEET_ID: SPREADSHEET_ID,
    sync: sync,
    fetchOrders: fetchOrders,
    deleteOrder: deleteOrder,
    confirmDelete: confirmDelete,
    confirmDelete: confirmDelete,
    removeOrder: removeOrder,
    removeOrder: removeOrder,
    ensureTabs: ensureTabs,
    upsertUser: upsertUser,
    toRow: toRow,
    isConfigured: isConfigured,
    getWebAppUrl: getWebAppUrl,
    setWebAppUrl: setWebAppUrl,
    get scriptSource() {
      return "";
    }
  };
})(window);
