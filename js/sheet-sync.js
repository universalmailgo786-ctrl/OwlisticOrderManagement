(function (global) {
  const URL_KEY = "owlistic.sheetWebAppUrl";
  const SPREADSHEET_ID = "1nZuMePQFJA9lCQ6C48d9MUC3Fwn00ao6Kilap5rbFfQ";
  const ACCOUNTS_SHEET_ID = "19hiEAgjNTcfDwEU1NsKJ2as90thmaIMzAXpHBWXKRrc";
  const LEGACY_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbytKcOqCtxVNXpPWmD6hQ7inpefem-MIf2ThOQEmCqKKgDLQVk1IlHIfIXstFznpwwM/exec";
  const NEXT_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwlWvSU1b8SJ42_3xdrrl1w7GhUiezAjBN85w9MvD-uFc-jg8m6OGJdGJRLm-fLIdl2/exec";
  const DEFAULT_WEB_APP_URL = NEXT_WEB_APP_URL;
  const STALE_WEB_APP_URLS = [
    LEGACY_WEB_APP_URL,
    "https://script.google.com/macros/s/AKfycbx-XBKX5WcoBIHgHss2uQ_RXRodMLoCO8qjBbDql32XO2RdfFSsBphKBUHgkf0SUdC7/exec",
    "https://script.google.com/macros/s/AKfycbxc9UyzIdr73zkuzHH-8R2tWxOmr3Rc88ApfrVA2RnKObATD3J8PSCJuwtF9FahSmIq/exec",
    "https://script.google.com/macros/s/AKfycbyLFBc8mr5QL_Hz3wpIfelJfyv_SbDUfbu1plPvzmUbClJzXF_MuHbPijOwzl9wPLuELw/exec",
    "https://script.google.com/macros/s/AKfycbw_Mkm_RUYAHrep4XFmwN4R7hSg8BYT7Pkz1-Kdhco-mIUTzFpI7qdTPFvi_BBcheDN/exec",
    "https://script.google.com/macros/s/AKfycbwHfmky-_-ZdQLc9Rdr_5gViPVseJPpN0bwbjrthV4/exec"
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
    "Client Name",
    "Place On",
    "Placement Status",
    "Scheduled By",
    "Schedule Updated At",
    "Placed At"
  ];
  const EXPECTED_SHEET_COLUMNS = HEADERS.length;
  let capabilitiesCache = null;
  let scriptSourceText = "";
  let scriptSourceLoading = null;

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
  const postedUploadIds = {};

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
    const session = global.OwlisticAuth && global.OwlisticAuth.getSession && global.OwlisticAuth.getSession();
    const sessionAcc = session && session.role !== "superadmin" ? String(session.account || "").trim() : "";
    if (!orderOrAccount) return sessionAcc;
    if (orderOrAccount.accountName && !/^(no account)$/i.test(String(orderOrAccount.accountName).trim())) {
      return orderOrAccount.accountName;
    }
    if (sessionAcc) return sessionAcc;
    const labeled = callStore("accountLabel", "accountLabel", orderOrAccount);
    if (labeled && !/^(no account)$/i.test(labeled)) return labeled;
    return orderOrAccount.name || sessionAcc || "";
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
    const filled = callStore("fillOrderAccountProfile", "fillOrderAccountProfile", live) || live;
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
      filled.whatsapp || "",
      filled.name || "",
      live.orderValue || live.orderValue || "",
      paymentLabel(live),
      live.searchKeyword || live.searchKeyword || "",
      typeLabel,
      live.messageText || callStore("formatMessageThread", "formatMessageThread", live.messageThread || []) || "",
      live.directRequirements || live.directRequirements || "",
      fileRefs(live.requirementFiles || live.requirementFiles),
      filled.fiverrId || filled.fiverrId || "",
      filled.fiverrGigUrl || filled.fiverrGigUrl || "",
      live.reviewText || live.reviewText || "",
      rounds.length ? String(rounds.length) : "0",
      revisionHistory(live),
      current ? ("Revision " + current.number) : "None",
      latestMessage(rounds, "buyer"),
      latestMessage(rounds, "seller"),
      live.readyToApprove || live.readyToApprove ? "Ready to Approve" : "Not Ready",
      statusLabel,
      live.businessName || "",
      live.clientName || "",
      live.placeOn || "",
      live.placementStatus || callStore("placementStatusOf", "placementStatusOf", live) || "Unscheduled",
      live.scheduledBy || "",
      live.scheduleUpdatedAt || "",
      live.placedAt || ""
    ];
  }

  function scheduleDeployError() {
    return {
      ok: false,
      needsDeploy: true,
      error: "Schedule could not be saved to the Google Sheet. Open the updated Apps Script link, allow access once, then save the schedule again."
    };
  }

  function scheduleStatusOf(order) {
    return callStore("placementStatusOf", "placementStatusOf", order) || order.placementStatus || "Unscheduled";
  }

  function scheduleYmd(value) {
    const text = String(value || "").trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
    const parsed = new Date(text);
    if (isNaN(parsed.getTime())) return "";
    return parsed.getFullYear() + "-" + String(parsed.getMonth() + 1).padStart(2, "0") + "-" + String(parsed.getDate()).padStart(2, "0");
  }

  function scheduleMatches(order, remote) {
    if (!remote) return false;
    const expectedStatus = scheduleStatusOf(order);
    const remoteStatus = String(remote.placementStatus || "").trim() || "Unscheduled";
    if (expectedStatus !== remoteStatus) return false;
    if (expectedStatus === "On Hold" || expectedStatus === "Unscheduled" || expectedStatus === "Placed") {
      return true;
    }
    const expectedDate = scheduleYmd(order.placeOn);
    const remoteDate = scheduleYmd(remote.placeOn);
    if (!expectedDate) return !remoteDate;
    return expectedDate === remoteDate;
  }

  function verifyScheduleOnSheet(order) {
    if (!order || !order.id) return Promise.resolve({ ok: true, skipped: true });
    return fetchOrder(order).then(function (result) {
      if (!result || result.unsupported) {
        return { ok: false, needsDeploy: true, error: scheduleDeployError().error };
      }
      if (!result.found || !scheduleMatches(order, result.order)) {
        return scheduleDeployError();
      }
      return { ok: true, verified: true };
    }).catch(function () {
      return scheduleDeployError();
    });
  }

  function probeWebAppUrl(url) {
    const base = String(url || "").trim();
    if (!base) return Promise.resolve({ ok: false, skipped: true });
    const join = base.indexOf("?") >= 0 ? "&" : "?";
    const baseUrl = base + join + "_=" + Date.now();
    const ensureUrl = base + join + "action=ensureScheduleColumns&_=" + Date.now();
    return fetchWithTimeout(baseUrl, { method: "GET", credentials: "omit", cache: "no-store" }, 20000).then(function (response) {
      return response.text();
    }).then(function (baseText) {
      const baseData = parseJson(baseText) || {};
      return fetchWithTimeout(ensureUrl, { method: "GET", credentials: "omit", cache: "no-store" }, 20000).then(function (response) {
        return response.text();
      }).then(function (ensureText) {
        const ensureData = parseJson(ensureText) || {};
        const sheetColumns = Number((ensureData.sheetColumns || baseData.sheetColumns) || 0);
        const scheduleSupported = ensureData.action === "ensureScheduleColumns" && sheetColumns >= EXPECTED_SHEET_COLUMNS;
        return {
          ok: Boolean(baseData.ok || ensureData.ok),
          url: base,
          sheetColumns: sheetColumns || Number(baseData.sheetColumns) || 0,
          scheduleSupported: scheduleSupported,
          expectedColumns: EXPECTED_SHEET_COLUMNS,
          needsDeploy: !scheduleSupported,
          legacyWebApp: ensureData.action !== "ensureScheduleColumns",
          authorized: Boolean(baseData.ok && (scheduleSupported || ensureData.action === "ensureScheduleColumns"))
        };
      });
    }).catch(function () {
      return { ok: false, url: base, needsDeploy: true, authorized: false };
    });
  }

  function tryMigrateWebApp() {
    const current = getWebAppUrl();
    return probeWebAppUrl(current).then(function (currentCaps) {
      if (currentCaps && currentCaps.scheduleSupported) {
        capabilitiesCache = currentCaps;
        return currentCaps;
      }
      return probeWebAppUrl(NEXT_WEB_APP_URL).then(function (nextCaps) {
        if (nextCaps && nextCaps.scheduleSupported) {
          setWebAppUrl(NEXT_WEB_APP_URL);
          capabilitiesCache = nextCaps;
          return nextCaps;
        }
        capabilitiesCache = currentCaps || nextCaps || { ok: false, needsDeploy: true };
        capabilitiesCache.needsDeploy = true;
        return capabilitiesCache;
      });
    });
  }

  function loadScriptSource() {
    if (scriptSourceText) return Promise.resolve(scriptSourceText);
    const embedded = global.OwlisticAppsScriptSource;
    if (typeof embedded === "string" && embedded.trim()) {
      scriptSourceText = embedded.trim();
      return Promise.resolve(scriptSourceText);
    }
    if (scriptSourceLoading) return scriptSourceLoading;
    scriptSourceLoading = fetch("apps-script/Code.gs", { credentials: "same-origin", cache: "no-store" }).then(function (response) {
      return response.ok ? response.text() : "";
    }).then(function (text) {
      scriptSourceText = String(text || "").trim() || (typeof embedded === "string" ? embedded.trim() : "");
      return scriptSourceText;
    }).catch(function () {
      scriptSourceText = typeof embedded === "string" ? embedded.trim() : "";
      return scriptSourceText;
    });
    return scriptSourceLoading;
  }

  function fetchSheetCapabilities(force) {
    if (!isConfigured()) {
      return Promise.resolve({ ok: false, skipped: true, needsDeploy: false });
    }
    if (capabilitiesCache && !force) return Promise.resolve(capabilitiesCache);
    return tryMigrateWebApp().catch(function () {
      return { ok: false, needsDeploy: true, scheduleSupported: false };
    });
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
      function check(attempt) {
        return hasOrder(order).then(function (result) {
          if (result && result.unsupported) {
            return { ok: true, removedLocal: true };
          }
          if (!result || !result.found) {
            if (store && typeof store.deleteOrder === "function") store.deleteOrder(id);
            return { ok: true, removedLocal: true, sheetRemaining: false };
          }
          if (attempt >= 10) {
            return {
              ok: true,
              removedLocal: true,
              sheetRemaining: true,
              error: "Deleted in the portal, but the Google Sheet row is still there."
            };
          }
          return delay(500).then(function () { return check(attempt + 1); });
        });
      }
      return delay(400).then(function () { return check(0); });
    });
  }

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let quoted = false;
    const raw = String(text || "").replace(/^\uFEFF/, "");
    for (let i = 0; i < raw.length; i += 1) {
      const ch = raw.charAt(i);
      const next = raw.charAt(i + 1);
      if (quoted) {
        if (ch === '"' && next === '"') {
          cell += '"';
          i += 1;
        } else if (ch === '"') {
          quoted = false;
        } else {
          cell += ch;
        }
      } else if (ch === '"') {
        quoted = true;
      } else if (ch === ",") {
        row.push(cell);
        cell = "";
      } else if (ch === "\n") {
        row.push(cell);
        if (row.some(function (part) { return String(part || "").trim(); })) rows.push(row);
        row = [];
        cell = "";
      } else if (ch !== "\r") {
        cell += ch;
      }
    }
    row.push(cell);
    if (row.some(function (part) { return String(part || "").trim(); })) rows.push(row);
    return rows;
  }

  function profileFromMap(map) {
    const payment = String(map.paymentstatus || map.payment || "").trim();
    return {
      username: String(map.username || map.user || "").trim(),
      name: String(map.account || map.accountname || map.name || "").trim(),
      personName: String(map.yourname || map.personname || map.displayname || "").trim(),
      whatsapp: String(map.whatsappnumber || map.whatsapp || "").trim(),
      fiverrId: String(map.fiverridname || map.fiverrid || "").trim(),
      fiverrGigUrl: String(map.fiverrgigurl || map.gigurl || "").trim(),
      paymentStatus: /unpaid/i.test(payment) ? "unpaid" : /paid/i.test(payment) ? "paid" : ""
    };
  }

  function profilesFromCsv(text) {
    const rows = parseCsv(text);
    if (!rows.length) return [];
    const headers = rows[0].map(function (item) {
      return String(item || "").replace(/\s+/g, "").toLowerCase();
    });
    const list = [];
    for (let r = 1; r < rows.length; r += 1) {
      const map = {};
      headers.forEach(function (key, index) {
        map[key] = rows[r][index] || "";
      });
      const profile = profileFromMap(map);
      if (!profile.username && !profile.name) continue;
      if (!profile.name) profile.name = profile.username;
      if (!profile.username) profile.username = profile.name;
      list.push(profile);
    }
    return list;
  }

  function fetchPublishedAccounts(sheetName) {
    const url = "https://docs.google.com/spreadsheets/d/" + ACCOUNTS_SHEET_ID +
      "/gviz/tq?tqx=out:csv&sheet=" + encodeURIComponent(sheetName || "Users") +
      "&_=" + Date.now();
    return fetchWithTimeout(url, { method: "GET", credentials: "omit", cache: "no-store" }, 8000).then(function (response) {
      return response.text();
    }).then(function (text) {
      if (!text || /google authorization|sign in|<!doctype html/i.test(text.slice(0, 80))) {
        return { ok: false, accounts: [] };
      }
      return { ok: true, accounts: profilesFromCsv(text) };
    }).catch(function () {
      return { ok: false, accounts: [] };
    });
  }

  function applyAccountProfiles(list) {
    const accounts = list || [];
    accounts.forEach(function (item) {
      if (!item || (!item.username && !item.name)) return;
      if (store && typeof store.upsertAccount === "function") {
        store.upsertAccount({
          username: item.username || "",
          name: item.name || item.account || item.username,
          personName: item.personName || "",
          whatsapp: item.whatsapp || "",
          fiverrId: item.fiverrId || "",
          fiverrGigUrl: item.fiverrGigUrl || "",
          paymentStatus: item.paymentStatus || ""
        });
      }
    });
    return accounts;
  }

  function fetchAccounts() {
    if (!isConfigured()) {
      return fetchPublishedAccounts("Users").then(function (result) {
        if (result.ok) applyAccountProfiles(result.accounts);
        return result;
      });
    }
    const session = global.OwlisticAuth && global.OwlisticAuth.getSession && global.OwlisticAuth.getSession();
    const join = getWebAppUrl().indexOf("?") >= 0 ? "&" : "?";
    const url = getWebAppUrl() + join +
      "action=listAccounts" +
      "&role=" + encodeURIComponent((session && session.role) || "") +
      "&userAccount=" + encodeURIComponent((session && session.account) || "") +
      "&username=" + encodeURIComponent((session && session.username) || "") +
      "&_=" + Date.now();
    return fetchWithTimeout(url, { method: "GET", credentials: "omit", cache: "no-store" }, 8000).then(function (response) {
      return response.text();
    }).then(function (text) {
      const data = parseJson(text);
      if (data && data.ok && data.action === "listAccounts") {
        applyAccountProfiles(data.accounts || []);
        return { ok: true, accounts: data.accounts || [] };
      }
      return fetchPublishedAccounts("Users").then(function (fallback) {
        if ((!fallback.accounts || !fallback.accounts.length)) {
          return fetchPublishedAccounts("Sheet1");
        }
        return fallback;
      }).then(function (fallback) {
        if (fallback && fallback.ok) applyAccountProfiles(fallback.accounts);
        return fallback || { ok: false, accounts: [] };
      });
    }).catch(function () {
      return fetchPublishedAccounts("Users").then(function (fallback) {
        if (fallback && fallback.ok) applyAccountProfiles(fallback.accounts);
        return fallback;
      });
    });
  }

  function fetchAccountProfile(name) {
    const wanted = String(name || "").trim();
    if (!wanted) return Promise.resolve({ ok: false });
    const session = global.OwlisticAuth && global.OwlisticAuth.getSession && global.OwlisticAuth.getSession();
    const join = getWebAppUrl().indexOf("?") >= 0 ? "&" : "?";
    const url = getWebAppUrl() + join +
      "action=getAccountProfile" +
      "&account=" + encodeURIComponent(wanted) +
      "&username=" + encodeURIComponent(wanted) +
      "&role=" + encodeURIComponent((session && session.role) || "") +
      "&userAccount=" + encodeURIComponent((session && session.account) || "") +
      "&_=" + Date.now();
    return fetchWithTimeout(url, { method: "GET", credentials: "omit", cache: "no-store" }, 8000).then(function (response) {
      return response.text();
    }).then(function (text) {
      const data = parseJson(text);
      if (data && data.ok && (data.action === "getAccountProfile" || data.whatsapp || data.fiverrId || data.personName)) {
        applyAccountProfiles([data]);
        return data;
      }
      return fetchAccounts().then(function (result) {
        const list = (result && result.accounts) || [];
        const match = list.find(function (item) {
          return String(item.name || "").toLowerCase() === wanted.toLowerCase() ||
            String(item.username || "").toLowerCase() === wanted.toLowerCase();
        });
        return match || { ok: false };
      });
    }).catch(function () {
      return { ok: false };
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
    const timeout = (options && options.timeout) || 15000;
    const started = Date.now();
    function attempt() {
      return hasOrder(order).then(function (result) {
        if (result && result.found) {
          return { ok: true, confirmed: true, found: true, tab: result.tab || "", order: order };
        }
        if (result && result.unsupported) {
          return fetchOrders().then(function (list) {
            const id = String((order && order.id) || "");
            const found = ((list && list.orders) || []).some(function (item) {
              return String((item && item.id) || "") === id;
            });
            if (found) return { ok: true, confirmed: true, found: true, order: order };
            if (Date.now() - started >= timeout) {
              return { ok: false, confirmed: false, found: false, timeout: true };
            }
            return delay(400).then(attempt);
          });
        }
        if (Date.now() - started >= timeout) {
          return { ok: false, confirmed: false, found: false, timeout: true };
        }
        return delay(400).then(attempt);
      });
    }
    return attempt();
  }

  function orderIdNumber(id) {
    const match = String(id || "").match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  function padOrderId(n) {
    if (store && typeof store.padOrderId === "function") return store.padOrderId(n);
    const s = String(n || 0);
    return "ORD-" + (s.length >= 3 ? s : ("000" + s).slice(-3));
  }

  function adoptId(order, newId) {
    if (!order || !newId) return order;
    if (store && typeof store.adoptOrderId === "function") {
      store.adoptOrderId(order.id, newId);
    }
    order.id = newId;
    if (store && typeof store.rememberOrderNumber === "function") {
      store.rememberOrderNumber(newId);
    }
    return order;
  }

  function fetchNextOrderId() {
    if (!isConfigured()) return Promise.resolve("");
    const session = global.OwlisticAuth && global.OwlisticAuth.getSession && global.OwlisticAuth.getSession();
    const join = getWebAppUrl().indexOf("?") >= 0 ? "&" : "?";
    const url = getWebAppUrl() + join +
      "action=nextOrderId" +
      "&role=" + encodeURIComponent((session && session.role) || "") +
      "&userAccount=" + encodeURIComponent((session && session.account) || "") +
      "&username=" + encodeURIComponent((session && session.username) || "") +
      "&_=" + Date.now();
    return fetchWithTimeout(url, { method: "GET", credentials: "omit", cache: "no-store" }, 15000).then(function (response) {
      return response.text();
    }).then(function (text) {
      const data = parseJson(text);
      if (data && data.ok && data.action === "nextOrderId" && data.orderId) return String(data.orderId);
      return "";
    }).catch(function () {
      return "";
    });
  }

  function allocateSheetOrderId(order) {
    const current = liveOrder(order) || order;
    return hasOrder(current).then(function (result) {
      if (result && result.found) return current;
      return fetchNextOrderId().then(function (remoteId) {
        if (remoteId && (!current.id || orderIdNumber(remoteId) > orderIdNumber(current.id))) {
          return adoptId(current, remoteId);
        }
        return current;
      });
    });
  }

  function bumpLocalOrderId(order) {
    const next = padOrderId(orderIdNumber(order && order.id) + 1);
    return adoptId(order, next);
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
    if (!names.length) return Promise.resolve({ ok: true, found: true, order: order });
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
          return remote || { ok: false, found: false, timeout: true };
        }
        return delay(500).then(attempt);
      }).catch(function () {
        if (Date.now() - started >= timeout) {
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
      postedUploadIds[file.id || uploadId] = true;
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
      const start = postedUploadIds[key]
        ? waitForUpload(file.id || key).then(function (result) {
          if (!result || result.status !== "ok" || !result.url) {
            throw new Error((result && (result.error || result.driveLastError)) || "Drive upload timed out.");
          }
          stampUploadedFile(file, result);
          return result;
        })
        : uploadFileAttempt(file, orderId);
      return start.catch(function (err) {
        if (attempt >= 2) {
          return { status: "error", error: (err && err.message) || "Drive upload failed." };
        }
        return delay(600 * attempt).then(run);
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
    return fetchWithTimeout(url, { method: "GET", credentials: "omit", cache: "no-store" }, 20000).then(function (response) {
      return response.text();
    }).then(function (text) {
      const data = parseJson(text);
      if (!data || data.action !== "getOrder") {
        return { unsupported: true, found: false };
      }
      return { ok: Boolean(data.ok), found: Boolean(data.found), order: data.order || null, error: data.error || "" };
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

  function followWithFullSync(order, result) {
    if (!order || !order.id) return Promise.resolve(result);
    if (result && result.skipped) return Promise.resolve(result);
    if (!isConfigured() || typeof sync !== "function") return Promise.resolve(result);
    return sync(order, { skipUploads: true, bypassQueue: true }).then(function (syncResult) {
      if (result && result.ok === false) return syncResult || result;
      return result || syncResult;
    }).catch(function () {
      return result;
    });
  }

  function updateOrderSchedule(order) {
    if (!isConfigured() || !order || !order.id) {
      return Promise.resolve({ skipped: true });
    }
    return enqueueOrderWrite(order.id, function () {
      const latest = liveOrder(order) || order;
      const status = scheduleStatusOf(latest);
      const boardTab = callStore("boardStatusOf", "boardStatusOf", latest) || latest.boardStatus || "in-progress";
      const statusLabel = callStore("boardStatusLabel", "boardStatusLabel", boardTab) || latest.overallStatus || "";
      const session = global.OwlisticAuth && global.OwlisticAuth.getSession && global.OwlisticAuth.getSession();
      const join = getWebAppUrl().indexOf("?") >= 0 ? "&" : "?";
      const scheduleParams =
        "orderId=" + encodeURIComponent(latest.id) +
        "&tab=" + encodeURIComponent(tabNameOf(accountNameOf(latest))) +
        "&accountName=" + encodeURIComponent(accountNameOf(latest)) +
        "&placeOn=" + encodeURIComponent(latest.placeOn || "") +
        "&placementStatus=" + encodeURIComponent(status) +
        "&scheduledBy=" + encodeURIComponent(latest.scheduledBy || "") +
        "&scheduleUpdatedAt=" + encodeURIComponent(latest.scheduleUpdatedAt || "") +
        "&placedAt=" + encodeURIComponent(latest.placedAt || "") +
        "&boardStatus=" + encodeURIComponent(boardTab) +
        "&statusLabel=" + encodeURIComponent(statusLabel) +
        "&role=" + encodeURIComponent((session && session.role) || "") +
        "&userAccount=" + encodeURIComponent((session && session.account) || "") +
        "&username=" + encodeURIComponent((session && session.username) || "") +
        "&_=" + Date.now();
      const scheduleUrl = getWebAppUrl() + join + "action=updateOrderSchedule&" + scheduleParams;
      const statusUrl = getWebAppUrl() + join + "action=updateOrderStatus&status=" + encodeURIComponent(boardTab) +
        "&overallStatus=" + encodeURIComponent(statusLabel) + "&" + scheduleParams;

      function finishWithVerify(result) {
        return verifyScheduleOnSheet(latest).then(function (verified) {
          if (verified && verified.ok) {
            return result || verified;
          }
          return verified || scheduleDeployError();
        });
      }

      return fetchWithTimeout(scheduleUrl, { method: "GET", credentials: "omit", cache: "no-store" }, 20000).then(function (response) {
        return response.text();
      }).then(function (text) {
        const data = parseJson(text);
        if (data && data.action === "updateOrderSchedule") {
          return finishWithVerify(data);
        }
        return fetchWithTimeout(statusUrl, { method: "GET", credentials: "omit", cache: "no-store" }, 20000).then(function (response) {
          return response.text();
        }).then(function (statusText) {
          const statusData = parseJson(statusText);
          if (statusData && statusData.action === "updateOrderStatus") {
            return finishWithVerify(statusData);
          }
          return postPayload({
            action: "upsert",
            orderId: latest.id,
            accountName: accountNameOf(latest),
            tabName: tabNameOf(accountNameOf(latest)),
            placeOn: latest.placeOn || "",
            placementStatus: status,
            scheduledBy: latest.scheduledBy || "",
            scheduleUpdatedAt: latest.scheduleUpdatedAt || "",
            placedAt: latest.placedAt || "",
            boardStatus: boardTab,
            statusLabel: statusLabel,
            row: toRow(latest)
          }).then(function () {
            return finishWithVerify({ ok: true, action: "updateOrderSchedule", fallback: true });
          });
        });
      }).catch(function () {
        return finishWithVerify(scheduleDeployError());
      });
    });
  }

  function ensureScheduleColumns() {
    if (!isConfigured()) return Promise.resolve({ skipped: true });
    return tryMigrateWebApp().then(function (caps) {
      if (caps && caps.scheduleSupported) {
        const join = getWebAppUrl().indexOf("?") >= 0 ? "&" : "?";
        const url = getWebAppUrl() + join + "action=ensureScheduleColumns&_=" + Date.now();
        return fetchWithTimeout(url, { method: "GET", credentials: "omit", cache: "no-store" }, 20000).then(function (response) {
          return response.text();
        }).then(function (text) {
          const data = parseJson(text);
          if (data && data.action === "ensureScheduleColumns") {
            capabilitiesCache = {
              ok: true,
              sheetColumns: Number(data.sheetColumns) || EXPECTED_SHEET_COLUMNS,
              scheduleSupported: true,
              expectedColumns: EXPECTED_SHEET_COLUMNS,
              needsDeploy: false
            };
            return data;
          }
          return caps;
        }).catch(function () {
          return caps;
        });
      }
      return caps || { ok: false, needsDeploy: true, scheduleSupported: false };
    });
  }

  function updateOrderStatus(order) {
    if (!isConfigured() || !order || !order.id) {
      return Promise.resolve({ skipped: true });
    }
    return enqueueOrderWrite(order.id, function () {
      const latest = liveOrder(order) || order;
      const tab = callStore("boardStatusOf", "boardStatusOf", latest) || "in-progress";
      const label = callStore("boardStatusLabel", "boardStatusLabel", tab) || "";
      const placementStatus = callStore("placementStatusOf", "placementStatusOf", latest) || latest.placementStatus || "Unscheduled";
      const session = global.OwlisticAuth && global.OwlisticAuth.getSession && global.OwlisticAuth.getSession();
      const join = getWebAppUrl().indexOf("?") >= 0 ? "&" : "?";
      const url = getWebAppUrl() + join +
        "action=updateOrderStatus" +
        "&orderId=" + encodeURIComponent(latest.id) +
        "&tab=" + encodeURIComponent(tabNameOf(accountNameOf(latest))) +
        "&accountName=" + encodeURIComponent(accountNameOf(latest)) +
        "&boardStatus=" + encodeURIComponent(tab) +
        "&status=" + encodeURIComponent(tab) +
        "&statusLabel=" + encodeURIComponent(label) +
        "&overallStatus=" + encodeURIComponent(label) +
        "&placeOn=" + encodeURIComponent(latest.placeOn || "") +
        "&placementStatus=" + encodeURIComponent(placementStatus) +
        "&scheduledBy=" + encodeURIComponent(latest.scheduledBy || "") +
        "&scheduleUpdatedAt=" + encodeURIComponent(latest.scheduleUpdatedAt || "") +
        "&placedAt=" + encodeURIComponent(latest.placedAt || "") +
        "&role=" + encodeURIComponent((session && session.role) || "") +
        "&userAccount=" + encodeURIComponent((session && session.account) || "") +
        "&username=" + encodeURIComponent((session && session.username) || "") +
        "&_=" + Date.now();
      return fetchWithTimeout(url, { method: "GET", credentials: "omit", cache: "no-store" }, 20000).then(function (response) {
        return response.text();
      }).then(function (text) {
        const data = parseJson(text);
        if (data && data.action === "updateOrderStatus") {
          return followWithFullSync(latest, data);
        }
        return postPayload({
          action: "updateOrderStatus",
          orderId: latest.id,
          accountName: accountNameOf(latest),
          tabName: tabNameOf(accountNameOf(latest)),
          boardStatus: tab,
          status: tab,
          overallStatus: label,
          statusLabel: label,
          placeOn: latest.placeOn || "",
          placementStatus: placementStatus,
          scheduledBy: latest.scheduledBy || "",
          scheduleUpdatedAt: latest.scheduleUpdatedAt || "",
          placedAt: latest.placedAt || "",
          row: toRow(latest)
        }).then(function (postResult) {
          return followWithFullSync(latest, postResult);
        });
      }).catch(function () {
        return followWithFullSync(latest, { ok: false });
      });
    });
  }

  function sync(order, options) {
    if (!order) {
      return Promise.resolve({ skipped: true });
    }
    const run = function () {
      const start = options && options.skipUploads ? Promise.resolve([]) : uploadOrderFiles(liveOrder(order) || order);
      return start.then(function (uploadResults) {
        function postOnce(current) {
          const tabName = tabNameOf(accountNameOf(current));
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
            placeOn: current.placeOn || "",
            placementStatus: callStore("placementStatusOf", "placementStatusOf", current) || current.placementStatus || "Unscheduled",
            scheduledBy: current.scheduledBy || "",
            scheduleUpdatedAt: current.scheduleUpdatedAt || "",
            placedAt: current.placedAt || "",
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
            result.orderId = current.id;
            return result;
          });
        }

        function writeAndConfirm(current, attempt) {
          return postOnce(current).then(function (result) {
            function retry() {
              if (attempt >= 6) {
                result = result || {};
                result.ok = false;
                result.confirmed = false;
                result.error = result.error || "Order did not appear in the Google Sheet.";
                return result;
              }
              return fetchNextOrderId().then(function (remoteId) {
                if (remoteId && orderIdNumber(remoteId) > orderIdNumber(current.id)) {
                  adoptId(current, remoteId);
                } else {
                  bumpLocalOrderId(current);
                }
                return writeAndConfirm(current, attempt + 1);
              });
            }
            if (result && result.ok === false) return retry();
            return confirmSheetWrite(current, { timeout: 2500 }).then(function (confirm) {
              if (confirm && confirm.found) {
                result.ok = true;
                result.confirmed = true;
                result.orderId = current.id;
                result.tab = confirm.tab || "";
                return result;
              }
              return retry();
            });
          });
        }

        return allocateSheetOrderId(liveOrder(order) || order).then(function (current) {
          return writeAndConfirm(current, 0);
        });
      });
    };
    if (options && options.bypassQueue) return run();
    return enqueueOrderWrite(order.id, run);
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
    return fetchWithTimeout(url, { method: "GET", credentials: "omit", cache: "no-store" }, 30000).then(function (response) {
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
      return { ok: true, orders: orders, sheetColumns: data.sheetColumns || 0 };
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
    updateOrderSchedule: updateOrderSchedule,
    ensureScheduleColumns: ensureScheduleColumns,
    updateOrderStatus: updateOrderStatus,
    findDuplicateOrder: findDuplicateOrder,
    confirmSheetWrite: confirmSheetWrite,
    fetchNextOrderId: fetchNextOrderId,
    recordFingerprint: recordFingerprint,
    deleteOrder: deleteOrder,
    confirmDelete: confirmDelete,
    confirmDelete: confirmDelete,
    removeOrder: removeOrder,
    removeOrder: removeOrder,
    ensureTabs: ensureTabs,
    upsertUser: upsertUser,
    fetchAccounts: fetchAccounts,
    fetchAccountProfile: fetchAccountProfile,
    ACCOUNTS_SHEET_ID: ACCOUNTS_SHEET_ID,
    toRow: toRow,
    isConfigured: isConfigured,
    getWebAppUrl: getWebAppUrl,
    setWebAppUrl: setWebAppUrl,
    getNextWebAppUrl: function () { return NEXT_WEB_APP_URL; },
    probeWebAppUrl: probeWebAppUrl,
    tryMigrateWebApp: tryMigrateWebApp,
    fetchSheetCapabilities: fetchSheetCapabilities,
    loadScriptSource: loadScriptSource,
    EXPECTED_SHEET_COLUMNS: EXPECTED_SHEET_COLUMNS,
    get scriptSource() {
      return scriptSourceText;
    }
  };

  loadScriptSource();
})(window);
