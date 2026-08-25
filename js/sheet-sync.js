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
    return (files || []).map(function (file) { return file && file.name; }).filter(Boolean).join(", ");
  }

  function fileRefs(files) {
    return (files || []).map(function (file) {
      if (!file || !file.name) return "";
      if (file.url) return file.name + " | " + file.url;
      return file.name;
    }).filter(Boolean).join("\n");
  }

  function orderUploadFiles(order) {
    const files = [];
    function add(list) {
      (list || []).forEach(function (file) {
        if (file) files.push(file);
      });
    }
    add(order && order.requirementFiles);
    ((order && order.messageThread) || []).forEach(function (message) {
      add(message && message.files);
    });
    ((order && order.revisions) || []).forEach(function (round) {
      ((round && round.messages) || []).forEach(function (message) {
        add(message && message.files);
      });
    });
    return files;
  }

  const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
  const sentFileIds = {};
  const inFlightUploads = {};

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

  function compressImageBlob(blob) {
    if (!blob || !/^image\/(png|jpeg|jpg|webp|bmp)$/i.test(blob.type || "")) {
      return Promise.resolve(blob);
    }
    const large = (blob.size || 0) > 2 * 1024 * 1024;
    if ((blob.size || 0) <= 1.2 * 1024 * 1024) return Promise.resolve(blob);
    return new Promise(function (resolve) {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = function () {
        try {
          const max = large ? 1280 : 1600;
          let width = img.naturalWidth || img.width;
          let height = img.naturalHeight || img.height;
          const scale = Math.min(1, max / Math.max(width, height));
          width = Math.max(1, Math.round(width * scale));
          height = Math.max(1, Math.round(height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);
          canvas.toBlob(function (out) {
            URL.revokeObjectURL(url);
            if (out && out.size && out.size < blob.size) resolve(out);
            else resolve(blob);
          }, "image/jpeg", large ? 0.74 : 0.84);
        } catch (err) {
          URL.revokeObjectURL(url);
          resolve(blob);
        }
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        resolve(blob);
      };
      img.src = url;
    });
  }

  function fileBlob(file) {
    if (file && file.pendingBlob) return Promise.resolve(file.pendingBlob);
    const getFile = store && store.getFile;
    if (typeof getFile !== "function" || !file || !file.id) return Promise.resolve(null);
    return getFile(file.id).then(function (record) {
      return (record && record.blob) || null;
    });
  }

  function collectUploads(files, options) {
    const skippedLarge = [];
    const pending = (files || []).filter(function (file) {
      if (!file || file.url) return false;
      if (!(file.id || file.pendingBlob)) return false;
      const key = file.id || file.name;
      if (inFlightUploads[key]) return false;
      return true;
    });
    return Promise.all(pending.map(function (file) {
      return fileBlob(file).then(function (blob) {
        if (!blob) return null;
        const size = blob.size || file.size || 0;
        if (size > MAX_UPLOAD_BYTES) {
          skippedLarge.push(file.name || "file");
          return null;
        }
        return compressImageBlob(blob).then(function (ready) {
          return blobToBase64(ready).then(function (data) {
            return {
              name: file.name || "file",
              mimeType: (ready && ready.type) || file.type || blob.type || "application/octet-stream",
              data: data,
              localId: file.id
            };
          });
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
        const files = fileRefs(message.files);
        if (files) parts.push("Files: " + files.replace(/\n/g, " ; "));
        return parts.join(" — ");
      });
      return "Revision " + (round.number || "") + (round.completed ? " [Completed]" : " [Open]") + (messages.length ? ": " + messages.join(" || ") : ": (empty)");
    }).join("\n");
  }

  function toRow(order) {
    const live = liveOrder(order) || order || {};
    const rounds = callStore("normalizeRevisions", "normalizeRevisions", live.revisions || []) || [];
    const current = callStore("currentRevision", "currentRevision", live);
    const tab = callStore("boardStatusOf", "boardStatusOf", live) || "";
    const status = callStore("computeStatus", "computeStatus", live);
    const typeLabel = callStore("orderTypeLabel", "orderTypeLabel", live) || "";
    const statusLabel = callStore("boardStatusLabel", "boardStatusLabel", tab) ||
      callStore("statusLabel", "statusLabel", status) ||
      String(live.overallStatus || status || "");
    return [
      live.id || "",
      formatDate(live.createdAt || live.createdAt),
      formatTime(live.createdAt || live.createdAt),
      formatDate(live.updatedAt || live.updatedAt),
      formatTime(live.updatedAt || live.updatedAt),
      accountNameOf(live),
      live.whatsapp || "",
      live.name || "",
      live.orderValue || live.orderValue || "",
      paymentLabel(live),
      live.searchKeyword || live.searchKeyword || "",
      typeLabel,
      live.messageText || callStore("formatMessageThread", "formatMessageThread", live.messageThread || []) || "",
      live.directRequirements || live.directRequirements || "",
      fileRefs(live.requirementFiles || live.requirementFiles),
      live.fiverrId || live.fiverrId || "",
      live.fiverrGigUrl || live.fiverrGigUrl || "",
      live.reviewText || live.reviewText || "",
      rounds.length ? String(rounds.length) : "0",
      revisionHistory(live),
      current ? ("Revision " + current.number) : "None",
      latestMessage(rounds, "buyer"),
      latestMessage(rounds, "seller"),
      live.readyToApprove || live.readyToApprove ? "Ready to Approve" : "Not Ready",
      statusLabel,
      live.businessName || "",
      live.clientName || ""
    ];
  }

  function fetchWithTimeout(url, options, ms) {
    const timeout = ms || 8000;
    const ctrl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = setTimeout(function () {
      if (ctrl) ctrl.abort();
    }, timeout);
    const opts = Object.assign({}, options || {});
    if (ctrl) opts.signal = ctrl.signal;
    return fetch(url, opts).then(function (response) {
      clearTimeout(timer);
      return response;
    }, function (err) {
      clearTimeout(timer);
      throw err;
    });
  }

  function postPayload(payload, timeoutMs) {
    if (!isConfigured()) {
      return Promise.resolve({ skipped: true });
    }
    if (global.OwlisticAuth && typeof global.OwlisticAuth.sheetAuth === "function") {
      payload = global.OwlisticAuth.sheetAuth(payload);
    }
    return fetchWithTimeout(getWebAppUrl(), {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    }, timeoutMs || 60000).then(function () {
      return { ok: true };
    }).catch(function () {
      return { ok: false, error: "Could not reach Google Sheet." };
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
        if (store && typeof store.replaceOrders === "function") {
          store.replaceOrders(sheetOrders.filter(function (item) { return item.id !== id; }));
        } else if (store && typeof store.importOrders === "function") {
          store.importOrders(sheetOrders.filter(function (item) { return item.id !== id; }));
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
      displayName: String(user.displayName || user.personName || user.name || user.username || "").trim(),
      personName: String(user.personName || user.displayName || "").trim(),
      whatsapp: String(user.whatsapp || "").trim(),
      fiverrId: String(user.fiverrId || "").trim(),
      fiverrGigUrl: String(user.fiverrGigUrl || "").trim(),
      paymentStatus: String(user.paymentStatus || "").trim(),
      active: user.active === false ? "No" : "Yes"
    });
  }

  function delay(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, ms);
    });
  }

  function normalizeRecordText(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim().toLowerCase();
  }

  function recordFingerprint(order) {
    if (!order) return "";
    const typeLabel = callStore("orderTypeLabel", "orderTypeLabel", order) || "";
    const message = order.messageText || callStore("formatMessageThread", "formatMessageThread", order.messageThread || []) || "";
    return [
      tabNameOf(accountNameOf(order)),
      String(order.whatsapp || "").replace(/\D+/g, ""),
      order.name || "",
      order.orderValue == null ? "" : order.orderValue,
      paymentLabel(order),
      order.searchKeyword || "",
      typeLabel,
      message,
      order.directRequirements || "",
      order.fiverrId || "",
      order.fiverrGigUrl || "",
      order.reviewText || ""
    ].map(normalizeRecordText).join("\u0001");
  }

  function fingerprintHasFields(fingerprint) {
    const parts = String(fingerprint || "").split("\u0001");
    const meaningful = [1, 2, 3, 5, 7, 8, 9, 10, 11];
    for (let i = 0; i < meaningful.length; i += 1) {
      const part = parts[meaningful[i]] || "";
      if (part && part !== "—" && part !== "-") return true;
    }
    return false;
  }

  function findDuplicateOrder(orders, order) {
    const wanted = recordFingerprint(order);
    if (!fingerprintHasFields(wanted)) return null;
    const id = String((order && order.id) || "").trim();
    const list = orders || [];
    for (let i = 0; i < list.length; i += 1) {
      const item = list[i];
      if (!item) continue;
      if (id && String(item.id || "").trim() === id) continue;
      if (recordFingerprint(item) === wanted) return item;
    }
    return null;
  }

  function findOrderOnSheet(orders, order) {
    const id = String((order && order.id) || "").trim();
    const list = orders || [];
    if (id) {
      for (let i = 0; i < list.length; i += 1) {
        if (String((list[i] && list[i].id) || "").trim() === id) return list[i];
      }
    }
    return findDuplicateOrder(list, order);
  }

  function confirmSheetWrite(order, options) {
    const timeout = (options && options.timeout) || 8000;
    const started = Date.now();
    function attempt() {
      return hasOrder(order).then(function (result) {
        if (result && result.unsupported) {
          return { ok: true, confirmed: true, fallback: true };
        }
        if (result && result.found) {
          return { ok: true, confirmed: true, order: order };
        }
        if (Date.now() - started >= timeout) {
          return { ok: false, confirmed: false, timeout: true };
        }
        return delay(250).then(attempt);
      });
    }
    return attempt();
  }

  function hasOrder(order) {
    if (!isConfigured() || !order || !order.id) {
      return Promise.resolve({ skipped: true, found: false });
    }
    const session = global.OwlisticAuth && global.OwlisticAuth.getSession && global.OwlisticAuth.getSession();
    const join = getWebAppUrl().indexOf("?") >= 0 ? "&" : "?";
    const url = getWebAppUrl() + join +
      "action=hasOrder" +
      "&orderId=" + encodeURIComponent(order.id) +
      "&tab=" + encodeURIComponent(tabNameOf(accountNameOf(order))) +
      "&role=" + encodeURIComponent((session && session.role) || "") +
      "&userAccount=" + encodeURIComponent((session && session.account) || "") +
      "&_=" + Date.now();
    return fetchWithTimeout(url, { method: "GET", credentials: "omit", cache: "no-store" }, 8000).then(function (response) {
      return response.text();
    }).then(function (text) {
      const data = parseJson(text);
      if (!data || data.action !== "hasOrder") {
        return { unsupported: true, found: false };
      }
      return { ok: Boolean(data.ok), found: Boolean(data.found), tab: data.tab || "" };
    }).catch(function () {
      return { ok: false, found: false };
    });
  }

  function orderFileUrlMap(order) {
    const urls = {};
    function add(list) {
      (list || []).forEach(function (file) {
        if (file && file.name && file.url) urls[file.name] = file.url;
      });
    }
    add(order && order.requirementFiles);
    ((order && order.messageThread) || []).forEach(function (message) {
      add(message && message.files);
    });
    ((order && order.revisions) || []).forEach(function (round) {
      ((round && round.messages) || []).forEach(function (message) {
        add(message && message.files);
      });
    });
    return urls;
  }

  function waitForDriveLinks(order, uploadedNames, options) {
    const names = (uploadedNames || []).filter(Boolean);
    if (!order || !order.id) {
      return Promise.resolve({ ok: false, found: false });
    }
    if (!names.length) return fetchOrder(order);
    const timeout = (options && options.timeout) || 8000;
    const localIds = (options && options.localIds) || [];
    const started = Date.now();
    function ready(remoteOrder) {
      const urls = orderFileUrlMap(remoteOrder);
      return names.every(function (name) { return Boolean(urls[name]); });
    }
    function attempt() {
      return fetchOrder(order).then(function (remote) {
        if (remote && remote.order && ready(remote.order)) return remote;
        if (Date.now() - started >= timeout) {
          localIds.forEach(function (id) { delete sentFileIds[id]; });
          return remote || { ok: false, found: false, timeout: true };
        }
        return delay(500).then(attempt);
      }).catch(function () {
        if (Date.now() - started >= timeout) {
          localIds.forEach(function (id) { delete sentFileIds[id]; });
          return { ok: false, found: false, timeout: true };
        }
        return delay(500).then(attempt);
      });
    }
    return delay(700).then(attempt);
  }

  function waitForUpload(uploadId) {
    const timeout = 90000;
    const started = Date.now();
    function attempt() {
      const join = getWebAppUrl().indexOf("?") >= 0 ? "&" : "?";
      const url = getWebAppUrl() + join +
        "action=getUpload" +
        "&uploadId=" + encodeURIComponent(uploadId) +
        "&_=" + Date.now();
      return fetchWithTimeout(url, { method: "GET", credentials: "omit", cache: "no-store" }, 8000).then(function (response) {
        return response.text();
      }).then(function (text) {
        const data = parseJson(text);
        if (data && data.status === "ok" && data.url) return data;
        if (data && data.status === "error") return data;
        if (Date.now() - started >= timeout) {
          return {
            status: "error",
            error: (data && (data.error || data.driveLastError)) || "Drive upload timed out."
          };
        }
        return delay(700).then(attempt);
      }).catch(function () {
        if (Date.now() - started >= timeout) {
          return { status: "error", error: "Could not reach Drive." };
        }
        return delay(700).then(attempt);
      });
    }
    return delay(400).then(attempt);
  }

  function stampUploadedFile(file, result) {
    if (!file || !result || !result.url) return file;
    file.url = result.url;
    if (result.id) file.driveId = result.id;
    if (result.previewUrl) file.previewUrl = result.previewUrl;
    if (file.id) sentFileIds[file.id] = true;
    return file;
  }

  function filesNeedingDrive(order) {
    return orderUploadFiles(order).filter(function (file) {
      return file && !file.url && (file.id || file.pendingBlob);
    });
  }

  function filesMissingDrive(order) {
    return orderUploadFiles(order).filter(function (file) {
      return file && file.name && !file.url;
    });
  }

  function uploadFileAttempt(file, orderId) {
    const uploadId = file.id || ("up_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8));
    if (!file.id) file.id = uploadId;
    return fileBlob(file).then(function (blob) {
      if (!blob) throw new Error("This file is not in this browser anymore. Re-attach it.");
      if ((blob.size || 0) > MAX_UPLOAD_BYTES) throw new Error("File is larger than 20 MB.");
      return compressImageBlob(blob).then(function (ready) {
        return blobToBase64(ready).then(function (data) {
          return postPayload({
            action: "uploadFile",
            uploadId: uploadId,
            orderId: orderId || "",
            name: file.name || "file",
            mimeType: (ready && ready.type) || file.type || blob.type || "application/octet-stream",
            data: data
          }, 120000);
        });
      });
    }).then(function (posted) {
      if (posted && posted.ok === false) {
        throw new Error(posted.error || "Could not reach Drive.");
      }
      return waitForUpload(uploadId);
    }).then(function (result) {
      if (!result || result.status !== "ok" || !result.url) {
        throw new Error((result && (result.error || result.driveLastError)) || "Drive upload timed out.");
      }
      stampUploadedFile(file, result);
      return result;
    });
  }

  function uploadFile(file, orderId) {
    if (!file) {
      return Promise.resolve({ status: "error", error: "Missing file." });
    }
    if (file.url) {
      return Promise.resolve({ status: "ok", url: file.url, name: file.name, id: file.driveId || "" });
    }
    if (!isConfigured()) {
      return Promise.resolve({ status: "error", error: "Google Sheet is not connected." });
    }
    const key = file.id || file.name || "file";
    if (inFlightUploads[key]) return inFlightUploads[key];
    let attempt = 0;
    function run() {
      attempt += 1;
      return uploadFileAttempt(file, orderId).catch(function (err) {
        if (attempt >= 3) {
          return { status: "error", error: (err && err.message) || "Drive upload failed." };
        }
        return delay(900 * attempt).then(run);
      });
    }
    const task = run().then(function (result) {
      delete inFlightUploads[key];
      return result;
    }, function (err) {
      delete inFlightUploads[key];
      return { status: "error", error: (err && err.message) || "Drive upload failed." };
    });
    inFlightUploads[key] = task;
    return task;
  }

  function uploadOrderFiles(order) {
    const pending = filesNeedingDrive(order);
    return pending.reduce(function (chain, file) {
      return chain.then(function (results) {
        return uploadFile(file, order && order.id).then(function (result) {
          results.push({ file: file, result: result });
          return results;
        });
      });
    }, Promise.resolve([]));
  }

  function fetchOrder(order) {
    if (!isConfigured() || !order || !order.id) {
      return Promise.resolve({ skipped: true, found: false });
    }
    const session = global.OwlisticAuth && global.OwlisticAuth.getSession && global.OwlisticAuth.getSession();
    const join = getWebAppUrl().indexOf("?") >= 0 ? "&" : "?";
    const url = getWebAppUrl() + join +
      "action=getOrder" +
      "&orderId=" + encodeURIComponent(order.id) +
      "&tab=" + encodeURIComponent(tabNameOf(accountNameOf(order))) +
      "&role=" + encodeURIComponent((session && session.role) || "") +
      "&userAccount=" + encodeURIComponent((session && session.account) || "") +
      "&_=" + Date.now();
    return fetchWithTimeout(url, { method: "GET", credentials: "omit", cache: "no-store" }, 8000).then(function (response) {
      return response.text();
    }).then(function (text) {
      const data = parseJson(text);
      if (!data || data.action !== "getOrder") {
        return { unsupported: true, found: false };
      }
      return { ok: Boolean(data.ok), found: Boolean(data.found), order: data.order || null };
    }).catch(function () {
      return { ok: false, found: false };
    });
  }

  function updateOrderNames(order) {
    if (!isConfigured() || !order || !order.id) {
      return Promise.resolve({ skipped: true });
    }
    const session = global.OwlisticAuth && global.OwlisticAuth.getSession && global.OwlisticAuth.getSession();
    const join = getWebAppUrl().indexOf("?") >= 0 ? "&" : "?";
    const url = getWebAppUrl() + join +
      "action=updateOrderNames" +
      "&orderId=" + encodeURIComponent(order.id) +
      "&tab=" + encodeURIComponent(tabNameOf(accountNameOf(order))) +
      "&accountName=" + encodeURIComponent(accountNameOf(order)) +
      "&businessName=" + encodeURIComponent(order.businessName || "") +
      "&clientName=" + encodeURIComponent(order.clientName || "") +
      "&role=" + encodeURIComponent((session && session.role) || "") +
      "&userAccount=" + encodeURIComponent((session && session.account) || "") +
      "&username=" + encodeURIComponent((session && session.username) || "") +
      "&_=" + Date.now();
    return fetchWithTimeout(url, { method: "GET", credentials: "omit", cache: "no-store" }, 20000).then(function (response) {
      return response.text();
    }).then(function (text) {
      const data = parseJson(text);
      if (data && data.action === "updateOrderNames") return data;
      return postPayload({
        action: "updateOrderNames",
        orderId: order.id,
        accountName: accountNameOf(order),
        tabName: tabNameOf(accountNameOf(order)),
        businessName: order.businessName || "",
        clientName: order.clientName || ""
      });
    }).catch(function () {
      return { ok: false, error: "Could not save the name to Google Sheet." };
    });
  }

  const writeQueues = {};

  function liveOrder(order) {
    if (order && order.id && store && typeof store.getOrder === "function") {
      return store.getOrder(order.id) || order;
    }
    return order;
  }

  function enqueueOrderWrite(orderId, task) {
    const key = String(orderId || "_none");
    const previous = writeQueues[key] || Promise.resolve();
    const next = previous.catch(function () {}).then(task);
    writeQueues[key] = next;
    return next;
  }

  function updateOrderStatus(order) {
    if (!isConfigured() || !order || !order.id) {
      return Promise.resolve({ skipped: true });
    }
    return enqueueOrderWrite(order.id, function () {
      const latest = liveOrder(order) || order;
      const tab = callStore("boardStatusOf", "boardStatusOf", latest) || "in-progress";
      const label = callStore("boardStatusLabel", "boardStatusLabel", tab) || "";
      return postPayload({
        action: "updateOrderStatus",
        orderId: latest.id,
        accountName: accountNameOf(latest),
        tabName: tabNameOf(accountNameOf(latest)),
        boardStatus: tab,
        status: tab,
        overallStatus: label,
        statusLabel: label,
        row: toRow(latest)
      });
    });
  }

  function sync(order, options) {
    if (!order) {
      return Promise.resolve({ skipped: true });
    }
    return enqueueOrderWrite(order.id, function () {
      const latest = liveOrder(order) || order;
      const tabName = tabNameOf(accountNameOf(latest));
      const start = options && options.skipUploads ? Promise.resolve([]) : uploadOrderFiles(latest);
      return start.then(function (uploadResults) {
        const current = liveOrder(latest) || latest;
        const missing = filesMissingDrive(current).map(function (file) { return file.name; });
        const uploadedNames = (uploadResults || []).filter(function (item) {
          return item && item.file && item.file.url;
        }).map(function (item) { return item.file.name; });
        return postPayload({
          action: "upsert",
          orderId: current.id,
          accountName: accountNameOf(current),
          tabName: tabName,
          businessName: current.businessName || "",
          clientName: current.clientName || "",
          row: toRow(current),
          uploads: []
        }).then(function (result) {
          result = result || { ok: true };
          result.skippedLarge = [];
          result.uploadedNames = uploadedNames;
          result.uploadedLocalIds = (uploadResults || []).map(function (item) {
            return item && item.file && item.file.id;
          }).filter(Boolean);
          result.missingDriveFiles = missing;
          return result;
        });
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

  function createdAccountTabs() {
    const accounts = (store && typeof store.getAccounts === "function" && store.getAccounts()) || [];
    return accounts.map(function (account) {
      return tabNameOf(accountNameOf(account));
    }).filter(Boolean);
  }

  function fetchTabNames(session) {
    const role = String((session && session.role) || "").toLowerCase().replace(/\s+/g, "");
    if (role === "user" || role === "account") {
      const forced = tabNameOf(session && session.account);
      return forced ? [forced] : [];
    }
    return createdAccountTabs();
  }

  function tabMatchesAllowed(name, allowed) {
    const key = tabNameOf(name).toLowerCase();
    if (!key) return false;
    for (let i = 0; i < (allowed || []).length; i += 1) {
      const wanted = tabNameOf(allowed[i]).toLowerCase();
      if (!wanted) continue;
      if (key === wanted) return true;
      if (key.indexOf(wanted + " ") === 0) return true;
    }
    return false;
  }

  function isLeftoverTab(name) {
    return /^(unassigned|sheet1|users)$/i.test(tabNameOf(name));
  }

  function orderOnCreatedAccountTab(order, allowed) {
    if (!allowed || !allowed.length) return false;
    if (isLeftoverTab(order && order.tabName)) return false;
    if (tabMatchesAllowed(order && order.tabName, allowed)) return true;
    if (order && order.tabName) return false;
    return tabMatchesAllowed(order && order.accountName, allowed);
  }

  function fetchOrders() {
    if (!isConfigured()) {
      return Promise.resolve({ skipped: true, orders: [] });
    }
    const session = global.OwlisticAuth && global.OwlisticAuth.getSession && global.OwlisticAuth.getSession();
    const tabs = fetchTabNames(session);
    const join = getWebAppUrl().indexOf("?") >= 0 ? "&" : "?";
    const url = getWebAppUrl() + join +
      "action=listOrders" +
      "&role=" + encodeURIComponent((session && session.role) || "") +
      "&userAccount=" + encodeURIComponent((session && session.account) || "") +
      "&username=" + encodeURIComponent((session && session.username) || "") +
      "&tabs=" + encodeURIComponent(tabs.join(",")) +
      "&_=" + Date.now();
    return fetchWithTimeout(url, { method: "GET", credentials: "omit", cache: "no-store" }, 8000).then(function (response) {
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
      const orders = (data.orders || []).filter(function (order) {
        return orderOnCreatedAccountTab(order, tabs);
      });
      return { ok: true, orders: orders };
    }).catch(function () {
      return { ok: false, error: "Could not reach Google Sheet.", orders: [] };
    });
  }

  global.OwlisticSheet = {
    HEADERS: HEADERS,
    SPREADSHEET_ID: SPREADSHEET_ID,
    sync: sync,
    hasOrder: hasOrder,
    fetchOrder: fetchOrder,
    waitForDriveLinks: waitForDriveLinks,
    uploadFile: uploadFile,
    uploadOrderFiles: uploadOrderFiles,
    filesNeedingDrive: filesNeedingDrive,
    filesMissingDrive: filesMissingDrive,
    fetchOrders: fetchOrders,
    updateOrderNames: updateOrderNames,
    updateOrderStatus: updateOrderStatus,
    findDuplicateOrder: findDuplicateOrder,
    confirmSheetWrite: confirmSheetWrite,
    recordFingerprint: recordFingerprint,
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
