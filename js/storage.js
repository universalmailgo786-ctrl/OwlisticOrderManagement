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

  function parseRevisionHistoryText(text, createdAt) {
    const rounds = [];
    String(text || "").replace(/\r/g, "").split(/\n+/).forEach(function (line) {
      const match = String(line || "").match(/^Revision\s+(\d+)\s*\[(Completed|Open)\]\s*:?\s*(.*)$/i);
      if (!match) return;
      const number = Number(match[1]) || rounds.length + 1;
      const rest = String(match[3] || "").trim();
      const messages = [];
      if (rest && rest !== "(empty)") {
        rest.split(" | ").forEach(function (part, index) {
          const chunk = String(part || "").trim();
          if (!chunk) return;
          messages.push({
            id: "msg_sheet_" + number + "_" + index,
            role: /^Seller/i.test(chunk) ? "seller" : "buyer",
            text: chunk.replace(/^(Buyer|Seller)(?:\s*\([^)]*\))?\s*—\s*/i, ""),
            createdAt: createdAt
          });
        });
      }
      rounds.push({
        id: "rev_sheet_" + number,
        number: number,
        createdAt: createdAt,
        completed: String(match[2]).toLowerCase() === "completed",
        messages: messages
      });
    });
    return rounds;
  }

  function expandSheetRevisions(order) {
    const incoming = normalizeRevisions((order && order.revisions) || []);
    if (!incoming.length) return incoming;
    if (incoming.length > 1) return incoming;
    const only = incoming[0];
    const historyText = (only.messages || []).map(function (message) {
      return message && message.text ? message.text : "";
    }).join("\n");
    const parsed = parseRevisionHistoryText(historyText, only.createdAt);
    if (parsed.length) return parsed;
    const count = Math.max(Number(only.number) || 0, incoming.length, 1);
    if (count <= 1) return incoming;
    const rounds = [];
    let i;
    for (i = 1; i <= count; i += 1) {
      rounds.push({
        id: "rev_sheet_" + i,
        number: i,
        createdAt: only.createdAt,
        completed: false,
        messages: i === count ? (only.messages || []).slice() : []
      });
    }
    return rounds;
  }

  function visibleRevisions(order) {
    const rounds = normalizeRevisions((order && order.revisions) || []);
    const visible = [];
    let i;
    for (i = 0; i < rounds.length; i += 1) {
      visible.push(rounds[i]);
      if (!rounds[i].completed) break;
    }
    return visible;
  }

  function canAddRevision(order) {
    const rounds = normalizeRevisions((order && order.revisions) || []);
    if (!rounds.length) return true;
    return rounds.every(function (item) { return item.completed; });
  }

  function addRevision(order) {
    if (!order) return order;
    order.revisions = normalizeRevisions(order.revisions || []);
    if (!canAddRevision(order)) return order;
    order.revisions.push({
      id: uid("rev"),
      number: order.revisions.length + 1,
      createdAt: nowIso(),
      completed: false,
      messages: [{
        id: uid("msg"),
        role: "buyer",
        createdAt: nowIso(),
        text: "",
        files: []
      }]
    });
    setBoardStatus(order, "on-revision");
    return order;
  }

  function setRevisionCompleted(order, revisionId, completed) {
    if (!order) return order;
    const rounds = normalizeRevisions(order.revisions || []);
    const index = rounds.findIndex(function (round) {
      return String(round.id) === String(revisionId);
    });
    if (index < 0) return order;
    if (completed) {
      const previousOpen = rounds.slice(0, index).some(function (round) { return !round.completed; });
      if (previousOpen) return order;
    }
    rounds[index].completed = Boolean(completed);
    order.revisions = rounds;
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
    const open = revisions.find(function (item) { return !item.completed; });
    if (open) return open;
    return revisions.length ? revisions[revisions.length - 1] : null;
  }

  function upsertOrder(order) {
    const orders = getOrders();
    const stamp = nowIso();
    order.status = computeStatus(order);
    order.revisions = normalizeRevisions(order.revisions);
    order.messageThread = messageThreadOf(order);
    if (order.messageThread.length) {
      order.messageText = formatMessageThread(order.messageThread);
    }
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

  function threadRole(message) {
    return message && (message.role === "client" || message.role === "seller" || message.kind === "seller")
      ? "client"
      : "buyer";
  }

  function normalizeMessageThread(list) {
    return (list || []).map(function (item, index) {
      if (!item) return null;
      if (typeof item === "string") {
        const text = item.trim();
        if (!text) return null;
        return {
          id: "mt_sheet_" + (index + 1),
          role: "buyer",
          createdAt: "",
          text: text,
          files: []
        };
      }
      return {
        id: item.id || ("mt_" + (index + 1)),
        role: threadRole(item),
        createdAt: item.createdAt || "",
        text: String(item.text || ""),
        files: item.files || []
      };
    }).filter(Boolean);
  }

  function pairMessageThread(list) {
    const pairs = [];
    let pendingBuyer = null;
    normalizeMessageThread(list).forEach(function (message) {
      if (threadRole(message) === "buyer") {
        if (pendingBuyer) pairs.push({ buyer: pendingBuyer, client: null });
        pendingBuyer = message;
        return;
      }
      pairs.push({ buyer: pendingBuyer, client: message });
      pendingBuyer = null;
    });
    if (pendingBuyer) pairs.push({ buyer: pendingBuyer, client: null });
    return pairs;
  }

  function formatMessageThread(list) {
    const pairs = pairMessageThread(list);
    if (!pairs.length) return "";
    return pairs.map(function (pair, index) {
      const number = index + 1;
      const lines = [];
      function line(label, message) {
        if (!message) return;
        const text = String(message.text || "").trim();
        const files = (message.files || []).map(function (file) { return file && file.name; }).filter(Boolean).join(", ");
        if (!text && !files) return;
        lines.push(label + " " + number + ": " + (text || "(no text)") + (files ? " | Files: " + files : ""));
      }
      line("Buyer Message", pair.buyer);
      line("Client Reply", pair.client);
      return lines.join("\n");
    }).filter(Boolean).join("\n");
  }

  function parseMessageThreadText(text) {
    const rounds = [];
    String(text || "").replace(/\r/g, "").split(/\n+/).forEach(function (line) {
      const raw = String(line || "").trim();
      if (!raw) return;
      const buyer = raw.match(/^Buyer Message\s+(\d+)\s*:\s*(.*)$/i);
      const client = raw.match(/^Client Reply\s+(\d+)\s*:\s*(.*)$/i);
      if (buyer) {
        rounds.push({
          id: "mt_sheet_b_" + buyer[1],
          role: "buyer",
          createdAt: "",
          text: String(buyer[2] || "").replace(/\s*\|\s*Files:.*$/, "").trim(),
          files: []
        });
        return;
      }
      if (client) {
        rounds.push({
          id: "mt_sheet_c_" + client[1],
          role: "client",
          createdAt: "",
          text: String(client[2] || "").replace(/\s*\|\s*Files:.*$/, "").trim(),
          files: []
        });
        return;
      }
    });
    if (rounds.length) return rounds;
    const plain = String(text || "").trim();
    if (!plain) return [];
    return [{
      id: "mt_sheet_plain",
      role: "buyer",
      createdAt: "",
      text: plain,
      files: []
    }];
  }

  function messageThreadOf(order) {
    const fromList = normalizeMessageThread(order && order.messageThread);
    if (fromList.length) return fromList;
    return parseMessageThreadText(order && order.messageText);
  }

  function hydrateImportedOrder(order, previous) {
    const account = accountForName(order.accountName || order.tabName || "");
    if (account) order.accountId = account.id;
    order.revisions = expandSheetRevisions(order);
    order.messageThread = messageThreadOf(order);
    if (!String(order.messageText || "").trim()) {
      order.messageText = formatMessageThread(order.messageThread);
    }
    order.status = computeStatus(order);
    if (!previous) {
      order.boardStatus = parseBoardStatus(order.boardStatus) ||
        parseBoardStatus(order.overallStatus) ||
        "";
      order.status = computeStatus(order);
      return order;
    }
    const incomingRevisions = order.revisions || [];
    const looksLikeSheetStub = incomingRevisions.length && incomingRevisions.every(function (item) {
      return String(item.id || "").indexOf("rev_sheet") === 0;
    });
    const previousIsLocal = (previous.revisions || []).some(function (item) {
      return String(item.id || "").indexOf("rev_sheet") !== 0;
    });
    if (previous.revisions && previous.revisions.length && (!incomingRevisions.length || (looksLikeSheetStub && previousIsLocal))) {
      order.revisions = previous.revisions;
    }
    const incomingThread = order.messageThread || [];
    const threadLooksSheet = incomingThread.length && incomingThread.every(function (item) {
      return String(item.id || "").indexOf("mt_sheet") === 0;
    });
    const previousThreadLocal = (previous.messageThread || []).some(function (item) {
      return String(item.id || "").indexOf("mt_sheet") !== 0;
    });
    if (previous.messageThread && previous.messageThread.length && (!incomingThread.length || (threadLooksSheet && previousThreadLocal))) {
      order.messageThread = previous.messageThread;
      order.messageText = formatMessageThread(previous.messageThread) || previous.messageText || order.messageText;
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
    return order;
  }

  function importOrders(incoming) {
    const orders = getOrders();
    (incoming || []).forEach(function (order) {
      if (!order || !order.id) return;
      const index = orders.findIndex(function (item) { return item.id === order.id; });
      const previous = index === -1 ? null : orders[index];
      const next = hydrateImportedOrder(order, previous);
      if (index === -1) orders.push(next);
      else orders[index] = next;
    });
    saveOrders(orders);
    return getOrders();
  }

  function replaceOrders(incoming) {
    const previousAll = getOrders();
    const next = [];
    (incoming || []).forEach(function (order) {
      if (!order || !order.id) return;
      const previous = previousAll.find(function (item) { return item.id === order.id; }) || null;
      next.push(hydrateImportedOrder(order, previous));
    });
    saveOrders(next);
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
    replaceOrders: replaceOrders,
    parseBoardStatus: parseBoardStatus,
    boardStatusOf: boardStatusOf,
    boardStatusLabel: boardStatusLabel,
    setBoardStatus: setBoardStatus,
    setRevisionCompleted: setRevisionCompleted,
    visibleRevisions: visibleRevisions,
    canAddRevision: canAddRevision,
    addRevision: addRevision,
    addRevision: addRevision,
    hasOpenRevisions: hasOpenRevisions,
    computeStatus: computeStatus,
    computeStatus: computeStatus,
    recordTab: recordTab,
    recordTab: recordTab,
    currentRevision: currentRevision,
    currentRevision: currentRevision,
    normalizeRevisions: normalizeRevisions,
    normalizeRevisions: normalizeRevisions,
    normalizeMessageThread: normalizeMessageThread,
    pairMessageThread: pairMessageThread,
    formatMessageThread: formatMessageThread,
    parseMessageThreadText: parseMessageThreadText,
    messageThreadOf: messageThreadOf,
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
  global.OwlisticStore.normalizeMessageThread = normalizeMessageThread;
  global.OwlisticStore.pairMessageThread = pairMessageThread;
  global.OwlisticStore.formatMessageThread = formatMessageThread;
  global.OwlisticStore.parseMessageThreadText = parseMessageThreadText;
  global.OwlisticStore.messageThreadOf = messageThreadOf;
  global.OwlisticStore.orderTypeLabel = orderTypeLabel;
  global.OwlisticStore.statusLabel = statusLabel;
  global.OwlisticStore.formatDate = formatDate;
  global.OwlisticStore.setBoardStatus = setBoardStatus;
  global.OwlisticStore.setRevisionCompleted = setRevisionCompleted;
  global.OwlisticStore.visibleRevisions = visibleRevisions;
  global.OwlisticStore.canAddRevision = canAddRevision;
  global.OwlisticStore.addRevision = addRevision;
  global.OwlisticStore.addRevision = addRevision;
  global.OwlisticStore.hasOpenRevisions = hasOpenRevisions;
  global.OwlisticStore.boardStatusOf = boardStatusOf;
  global.OwlisticStore.boardStatusLabel = boardStatusLabel;
  global.OwlisticStore.upsertOrder = upsertOrder;
})(window);
