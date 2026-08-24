(function (global) {
  const ACC_KEY = "owlistic.accounts";
  const ORD_KEY = "owlistic.orders";
  const CTR_KEY = "owlistic.orderCounter";
  const DB_NAME = "owlistic-files";
  const DB_STORE = "files";

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function uid(prefix) {
    return prefix + "_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = function () {
        const db = request.result;
        if (!db.objectStoreNames.contains(DB_STORE)) {
          db.createObjectStore(DB_STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = function () {
        resolve(request.result);
      };
      request.onerror = function () {
        reject(request.error);
      };
    });
  }

  function saveFileBlobs(files) {
    const list = Array.from(files || []);
    if (!list.length) return Promise.resolve([]);

    return openDb().then(function (db) {
      return Promise.all(list.map(function (file) {
        const id = uid("file");
        const record = {
          id: id,
          name: file.name,
          type: file.type || "application/octet-stream",
          size: file.size || 0,
          uploadedAt: nowIso(),
          blob: file
        };
        return new Promise(function (resolve, reject) {
          const tx = db.transaction(DB_STORE, "readwrite");
          tx.oncomplete = function () {
            resolve({
              id: record.id,
              name: record.name,
              type: record.type,
              size: record.size,
              uploadedAt: record.uploadedAt
            });
          };
          tx.onerror = function () {
            reject(tx.error);
          };
          tx.objectStore(DB_STORE).put(record);
        });
      }));
    });
  }

  function getFile(id) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(DB_STORE, "readonly");
        const request = tx.objectStore(DB_STORE).get(id);
        request.onsuccess = function () {
          resolve(request.result || null);
        };
        request.onerror = function () {
          reject(request.error);
        };
      });
    });
  }

  function deleteFile(id) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        const tx = db.transaction(DB_STORE, "readwrite");
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
        tx.objectStore(DB_STORE).delete(id);
      });
    });
  }

  function getAccounts() {
    return readJson(ACC_KEY, []);
  }

  function saveAccounts(accounts) {
    writeJson(ACC_KEY, accounts);
  }

  function getOrders() {
    return readJson(ORD_KEY, []);
  }

  function saveOrders(orders) {
    writeJson(ORD_KEY, orders);
  }

  function nextOrderId() {
    const next = Number(localStorage.getItem(CTR_KEY) || 0) + 1;
    localStorage.setItem(CTR_KEY, String(next));
    return "ORD-" + String(next).padStart(3, "0");
  }

  function upsertAccount(account) {
    const accounts = getAccounts();
    const stamp = nowIso();
    if (!account.id) {
      account.id = uid("acc");
      account.createdAt = stamp;
      accounts.push(account);
    } else {
      const index = accounts.findIndex(function (item) { return item.id === account.id; });
      if (index === -1) {
        account.createdAt = stamp;
        accounts.push(account);
      } else {
        account.createdAt = accounts[index].createdAt || stamp;
        accounts[index] = account;
      }
    }
    account.updatedAt = stamp;
    saveAccounts(accounts);
    return account;
  }

  function deleteAccount(id) {
    saveAccounts(getAccounts().filter(function (item) { return item.id !== id; }));
  }

  function getAccount(id) {
    return getAccounts().find(function (item) { return item.id === id; }) || null;
  }

  function getOrder(id) {
    return getOrders().find(function (item) { return item.id === id; }) || null;
  }

  function entryKind(entry) {
    return (entry && entry.kind) || "revision";
  }

  function isRevisionEntry(entry) {
    return entryKind(entry) === "revision";
  }

  function normalizeRevisions(list) {
    const rounds = [];
    (list || []).forEach(function (item) {
      if (!item) return;
      if (Array.isArray(item.messages)) {
        rounds.push({
          id: item.id,
          number: item.number || rounds.length + 1,
          createdAt: item.createdAt,
          completed: Boolean(item.completed),
          messages: item.messages.slice()
        });
        return;
      }
      const kind = item.kind || "revision";
      if (kind === "revision") {
        const messages = [];
        if (item.note || (item.files && item.files.length)) {
          messages.push({
            id: item.id + "_msg",
            role: "buyer",
            createdAt: item.createdAt,
            text: item.note || "",
            files: item.files || []
          });
        }
        rounds.push({
          id: item.id,
          number: item.number || rounds.length + 1,
          createdAt: item.createdAt,
          completed: Boolean(item.completed),
          messages: messages
        });
        return;
      }
      if (!rounds.length) {
        rounds.push({
          id: uid("rev"),
          number: 1,
          createdAt: item.createdAt,
          completed: false,
          messages: []
        });
      }
      rounds[rounds.length - 1].messages.push({
        id: item.id,
        role: kind === "seller" ? "seller" : "buyer",
        createdAt: item.createdAt,
        text: item.note || "",
        files: item.files || []
      });
    });
    rounds.forEach(function (round, index) {
      round.number = index + 1;
    });
    return rounds;
  }

  function parseBoardStatus(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (!raw) return "";
    if (raw === "ready-to-approve" || raw === "ready to approve") return "ready-to-approve";
    if (raw === "completed" || raw === "complete") return "completed";
    if (
      raw === "on-revision" ||
      raw === "on revision" ||
      raw === "revision" ||
      raw === "revision-pending" ||
      raw === "revision pending" ||
      raw === "revision needed"
    ) {
      return "on-revision";
    }
    if (raw === "in-progress" || raw === "in progress" || raw === "waiting") return "in-progress";
    if (/ready to approve/.test(raw)) return "ready-to-approve";
    if (/complete/.test(raw)) return "completed";
    if (/revision/.test(raw)) return "on-revision";
    if (/progress/.test(raw)) return "in-progress";
    return "";
  }

  function boardStatusOf(order) {
    const fromBoard = parseBoardStatus(order && order.boardStatus);
    if (fromBoard) return fromBoard;
    const fromOverall = parseBoardStatus(order && order.overallStatus);
    if (fromOverall) return fromOverall;
    if (order && order.readyToApprove) return "ready-to-approve";
    const revisions = normalizeRevisions((order && order.revisions) || []);
    if (revisions.length && revisions.some(function (item) { return !item.completed; })) {
      return "on-revision";
    }
    return "in-progress";
  }

  function boardStatusLabel(tab) {
    if (tab === "completed") return "Completed";
    if (tab === "ready-to-approve") return "Ready to Approve";
    if (tab === "on-revision") return "On Revision";
    return "In Progress";
  }

  function setBoardStatus(order, tab) {
    const next = parseBoardStatus(tab) || "in-progress";
    if (!order) return order;
    order.boardStatus = next;
    order.overallStatus = boardStatusLabel(next);
    order.readyToApprove = next === "completed" || next === "ready-to-approve";
    order.status = computeStatus(order);
    return order;
  }

  function setRevisionCompleted(order, revisionId, completed) {
    if (!order) return order;
    order.revisions = normalizeRevisions(order.revisions || []).map(function (round) {
      if (String(round.id) === String(revisionId)) round.completed = Boolean(completed);
      return round;
    });
    return order;
  }

  function hasOpenRevisions(order) {
    const rounds = normalizeRevisions((order && order.revisions) || []);
    return rounds.length > 0 && rounds.some(function (item) { return !item.completed; });
  }

  function computeStatus(order) {
    const tab = boardStatusOf(order);
    if (tab === "completed") return "completed";
    if (tab === "ready-to-approve") return "ready-to-approve";
    if (tab === "on-revision") return "revision-pending";
    return "in-progress";
  }

  function recordTab(order) {
    return boardStatusOf(order);
  }

  function currentRevision(order) {
    const revisions = normalizeRevisions((order && order.revisions) || []);
    return revisions.length ? revisions[revisions.length - 1] : null;
  }

  function upsertOrder(order) {
    const orders = getOrders();
    const stamp = nowIso();
    order.status = computeStatus(order);
    order.revisions = normalizeRevisions(order.revisions);
    if (!order.id) {
      order.id = nextOrderId();
      order.createdAt = stamp;
      order.updatedAt = stamp;
      orders.push(order);
    } else {
      const index = orders.findIndex(function (item) { return item.id === order.id; });
      if (index === -1) {
        order.createdAt = order.createdAt || stamp;
        order.updatedAt = stamp;
        orders.push(order);
      } else {
        order.createdAt = orders[index].createdAt || stamp;
        order.updatedAt = stamp;
        orders[index] = order;
      }
    }
    saveOrders(orders);
    return order;
  }

  function deleteOrder(id) {
    const wanted = String(id || "").trim();
    if (!wanted) return false;
    const before = getOrders();
    const next = before.filter(function (item) { return item.id !== wanted; });
    if (next.length === before.length) return false;
    saveOrders(next);
    return true;
  }

  function namesMatch(left, right) {
    const a = String(left || "").trim().toLowerCase();
    const b = String(right || "").trim().toLowerCase();
    if (!a || !b) return false;
    if (a === b) return true;
    if (b.indexOf(a + " ") === 0) return true;
    if (a.indexOf(b + " ") === 0) return true;
    return false;
  }

  function sameAccountName(left, right) {
    return namesMatch(left, right);
  }

  function accountForName(name) {
    const wanted = String(name || "").trim();
    if (!wanted) return null;
    const accounts = getAccounts();
    let match = accounts.find(function (account) {
      return sameAccountName(account.name, wanted) || sameAccountName(accountLabel(account), wanted);
    });
    if (match) return match;
    return upsertAccount({
      name: wanted,
      personName: wanted
    });
  }

  function mergeRequirementFiles(previous, incoming) {
    const prev = previous || [];
    const next = incoming || [];
    if (!next.length) return prev.slice();
    return next.map(function (file) {
      const match = prev.find(function (item) {
        return file.id && item.id && item.id === file.id;
      }) || prev.find(function (item) {
        return item.name === file.name;
      });
      return {
        id: file.id || (match && match.id) || "",
        name: file.name || (match && match.name) || "",
        url: file.url || (match && match.url) || "",
        type: file.type || (match && match.type) || "",
        size: file.size || (match && match.size) || 0,
        uploadedAt: file.uploadedAt || (match && match.uploadedAt) || ""
      };
    });
  }

  function importOrders(incoming) {
    const orders = getOrders();
    (incoming || []).forEach(function (order) {
      if (!order || !order.id) return;
      const account = accountForName(order.accountName || order.tabName || "");
      if (account) order.accountId = account.id;
      order.revisions = normalizeRevisions(order.revisions || []);
      order.status = computeStatus(order);
      const index = orders.findIndex(function (item) { return item.id === order.id; });
      if (index === -1) {
        order.boardStatus = parseBoardStatus(order.boardStatus) ||
          parseBoardStatus(order.overallStatus) ||
          "";
        order.status = computeStatus(order);
        orders.push(order);
        return;
      }
      const previous = orders[index];
      const incomingRevisions = order.revisions || [];
      const looksLikeSheetStub = incomingRevisions.length && incomingRevisions.every(function (item) {
        return String(item.id || "").indexOf("rev_sheet") === 0;
      });
      if (previous.revisions && previous.revisions.length && (!incomingRevisions.length || looksLikeSheetStub)) {
        order.revisions = previous.revisions;
      }
      if (previous.accountId && !order.accountId) order.accountId = previous.accountId;
      order.requirementFiles = mergeRequirementFiles(previous.requirementFiles, order.requirementFiles);
      if (previous.createdAt && !order.createdAt) order.createdAt = previous.createdAt;
      if (!String(order.businessName || "").trim() && previous.businessName) {
        order.businessName = previous.businessName;
      }
      if (!String(order.clientName || "").trim() && previous.clientName) {
        order.clientName = previous.clientName;
      }
      order.boardStatus = parseBoardStatus(order.boardStatus) ||
        parseBoardStatus(order.overallStatus) ||
        previous.boardStatus ||
        "";
      order.status = computeStatus(order);
      orders[index] = order;
    });
    saveOrders(orders);
    return getOrders();
  }

  function formatDateTime(iso) {
    if (!iso) return "—";
    const date = new Date(iso);
    return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) +
      " · " +
      date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  function formatDate(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  function statusLabel(status) {
    if (status === "completed") return "Completed";
    if (status === "ready-to-approve") return "Ready to Approve";
    if (status === "revision-pending" || status === "revision-pending") return "On Revision";
    return "In Progress";
  }

  function orderTypeLabel(order) {
    const parts = [];
    if (order && order.orderTypeCustom) parts.push("Custom (Message)");
    if (order && order.orderTypeDirect) parts.push("Direct");
    return parts.join(" + ") || "—";
  }

  function accountLabel(account) {
    if (!account) return "No account";
    return account.name || account.personName || account.fiverrId || "Untitled account";
  }

  global.OwlisticStore = {
    uid: uid,
    uid: uid,
    nowIso: nowIso,
    nowIso: nowIso,
    formatDateTime: formatDateTime,
    formatDateTime: formatDateTime,
    formatDate: formatDate,
    statusLabel: statusLabel,
    orderTypeLabel: orderTypeLabel,
    accountLabel: accountLabel,
    accountLabel: accountLabel,
    getAccounts: getAccounts,
    getAccounts: getAccounts,
    getAccount: getAccount,
    upsertAccount: upsertAccount,
    deleteAccount: deleteAccount,
    deleteAccount: deleteAccount,
    getOrders: getOrders,
    getOrder: getOrder,
    upsertOrder: upsertOrder,
    deleteOrder: deleteOrder,
    importOrders: importOrders,
    parseBoardStatus: parseBoardStatus,
    boardStatusOf: boardStatusOf,
    boardStatusLabel: boardStatusLabel,
    setBoardStatus: setBoardStatus,
    setRevisionCompleted: setRevisionCompleted,
    hasOpenRevisions: hasOpenRevisions,
    computeStatus: computeStatus,
    computeStatus: computeStatus,
    recordTab: recordTab,
    recordTab: recordTab,
    currentRevision: currentRevision,
    currentRevision: currentRevision,
    normalizeRevisions: normalizeRevisions,
    normalizeRevisions: normalizeRevisions,
    saveFileBlobs: saveFileBlobs,
    saveFileBlobs: saveFileBlobs,
    getFile: getFile,
    getFile: getFile,
    deleteFile: deleteFile
  };
  global.OwlisticStore.recordTab = recordTab;
  global.OwlisticStore.recordTab = recordTab;
  global.OwlisticStore.computeStatus = computeStatus;
  global.OwlisticStore.computeStatus = computeStatus;
  global.OwlisticStore.normalizeRevisions = normalizeRevisions;
  global.OwlisticStore.orderTypeLabel = orderTypeLabel;
  global.OwlisticStore.statusLabel = statusLabel;
  global.OwlisticStore.formatDate = formatDate;
  global.OwlisticStore.setBoardStatus = setBoardStatus;
  global.OwlisticStore.setRevisionCompleted = setRevisionCompleted;
  global.OwlisticStore.hasOpenRevisions = hasOpenRevisions;
  global.OwlisticStore.boardStatusOf = boardStatusOf;
  global.OwlisticStore.boardStatusLabel = boardStatusLabel;
  global.OwlisticStore.upsertOrder = upsertOrder;
})(window);
