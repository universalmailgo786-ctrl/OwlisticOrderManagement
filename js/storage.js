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
    localStorage.setItem(key, JSON.stringify(value, function (prop, val) {
      if (prop === "pendingBlob") return undefined;
      return val;
    }));
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
              uploadedAt: record.uploadedAt,
              pendingBlob: file
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

  function orderNumberOf(id) {
    const match = String(id || "").match(/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }

  function padOrderId(n) {
    const s = String(n || 0);
    return "ORD-" + (s.length >= 3 ? s : ("000" + s).slice(-3));
  }

  function rememberOrderNumber(id) {
    const n = orderNumberOf(id);
    if (!n) return;
    const current = Number(localStorage.getItem(CTR_KEY) || 0);
    if (n > current) localStorage.setItem(CTR_KEY, String(n));
  }

  function nextOrderId() {
    const next = Number(localStorage.getItem(CTR_KEY) || 0) + 1;
    localStorage.setItem(CTR_KEY, String(next));
    return padOrderId(next);
  }

  function adoptOrderId(oldId, newId) {
    const from = String(oldId || "").trim();
    const to = String(newId || "").trim();
    if (!to) return to;
    rememberOrderNumber(to);
    if (!from || from === to) return to;
    const orders = getOrders();
    const index = orders.findIndex(function (item) { return item.id === from; });
    if (index >= 0) {
      orders[index].id = to;
      saveOrders(orders);
    }
    return to;
  }

  function upsertAccount(account) {
    const accounts = getAccounts();
    const stamp = nowIso();
    const incoming = account || {};
    let index = -1;
    if (incoming.id) {
      index = accounts.findIndex(function (item) { return item.id === incoming.id; });
    }
    if (index === -1 && incoming.name) {
      index = accounts.findIndex(function (item) {
        return sameAccountName(item.name, incoming.name) || sameAccountName(accountLabel(item), incoming.name);
      });
    }
    if (index === -1) {
      incoming.id = incoming.id || uid("acc");
      incoming.createdAt = stamp;
      incoming.updatedAt = stamp;
      accounts.push(incoming);
      saveAccounts(accounts);
      return incoming;
    }
    const previous = accounts[index];
    const merged = Object.assign({}, previous, incoming, {
      id: previous.id,
      createdAt: previous.createdAt || stamp,
      updatedAt: stamp
    });
    ["whatsapp", "personName", "fiverrId", "fiverrGigUrl", "paymentStatus", "username"].forEach(function (key) {
      if (!String(incoming[key] || "").trim() && String(previous[key] || "").trim()) {
        merged[key] = previous[key];
      }
    });
    accounts[index] = merged;
    saveAccounts(accounts);
    return merged;
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
      round.messages = repairRevisionMessages(round.messages);
    });
    return splitRevisionRounds(rounds);
  }

  function revisionMessageRole(message) {
    return message && (message.role === "seller" || message.kind === "seller") ? "seller" : "buyer";
  }

  function pairRevisionMessages(messages) {
    const pairs = [];
    let pendingBuyer = null;
    (messages || []).forEach(function (message) {
      if (revisionMessageRole(message) === "buyer") {
        if (pendingBuyer) pairs.push({ buyer: pendingBuyer, seller: null });
        pendingBuyer = message;
        return;
      }
      pairs.push({ buyer: pendingBuyer, seller: message });
      pendingBuyer = null;
    });
    if (pendingBuyer) pairs.push({ buyer: pendingBuyer, seller: null });
    return pairs;
  }

  function splitRevisionRounds(rounds) {
    const out = [];
    (rounds || []).forEach(function (revision) {
      const pairs = pairRevisionMessages(revision.messages || []);
      if (pairs.length <= 1) {
        out.push(revision);
        return;
      }
      pairs.forEach(function (pair, index) {
        const messages = [];
        if (pair.buyer) messages.push(pair.buyer);
        if (pair.seller) messages.push(pair.seller);
        out.push({
          id: index === 0 ? revision.id : String(revision.id || "rev") + "__r" + (index + 1),
          number: out.length + 1,
          createdAt: (pair.buyer && pair.buyer.createdAt) || revision.createdAt,
          completed: Boolean(revision.completed),
          messages: messages
        });
      });
    });
    out.forEach(function (round, index) {
      round.number = index + 1;
    });
    return out;
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
    if (
      raw === "orders-placed" ||
      raw === "orders placed" ||
      raw === "order placed" ||
      raw === "placed"
    ) {
      return "orders-placed";
    }
    if (
      raw === "in-progress" ||
      raw === "in progress" ||
      raw === "waiting" ||
      raw === "new order has to be placed"
    ) {
      return "in-progress";
    }
    if (/ready\s*to\s*approve/.test(raw)) return "ready-to-approve";
    if (/^completed$|^complete$/.test(raw)) return "completed";
    if (/on\s*revision|revision\s*pending|revision\s*needed/.test(raw)) return "on-revision";
    if (/orders\s*placed|^placed$/.test(raw)) return "orders-placed";
    if (/in\s*progress|new order/.test(raw)) return "in-progress";
    return "";
  }

  function boardStatusOf(order) {
    const fromBoard = parseBoardStatus(order && order.boardStatus);
    if (fromBoard && fromBoard !== "in-progress") return fromBoard;
    const fromOverall = parseBoardStatus(order && order.overallStatus);
    if (fromOverall && fromOverall !== "in-progress") return fromOverall;
    if (fromBoard) return fromBoard;
    if (fromOverall) return fromOverall;
    if (order && order.readyToApprove) return "ready-to-approve";
    return "in-progress";
  }

  function isExplicitlyPlaced(order) {
    if (!order) return false;
    if (parseBoardStatus(order.boardStatus) === "orders-placed") return true;
    if (parseBoardStatus(order.overallStatus) === "orders-placed") return true;
    return Boolean(order.placementPlaced) && String(order.placedAt || "").trim() !== "";
  }

  function boardStatusLabel(tab) {
    if (tab === "completed") return "Completed";
    if (tab === "ready-to-approve") return "Ready to Approve";
    if (tab === "on-revision") return "On Revision";
    if (tab === "orders-placed") return "Orders Placed";
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

  function parseFileRefs(text) {
    const raw = String(text == null ? "" : text).replace(/\r/g, "").trim();
    if (!raw) return [];
    const chunks = [];
    String(raw).split(/\n|;/).forEach(function (part) {
      const chunk = String(part || "").trim();
      if (chunk) chunks.push(chunk);
    });
    return chunks.map(function (chunk) {
      const pipe = chunk.indexOf("|");
      if (pipe >= 0) {
        return { id: "", name: chunk.slice(0, pipe).trim(), url: chunk.slice(pipe + 1).trim(), type: "", size: 0 };
      }
      const match = chunk.match(/^(.*)\s+(https?:\/\/\S+)\s*$/i);
      if (match) {
        return { id: "", name: String(match[1] || "").trim(), url: String(match[2] || "").trim(), type: "", size: 0 };
      }
      return { id: "", name: chunk, url: "", type: "", size: 0 };
    }).filter(function (file) { return file && file.name; });
  }

  function formatFileRef(file) {
    if (!file || !file.name) return "";
    return file.url ? file.name + " | " + file.url : file.name;
  }

  function splitMessageBody(raw) {
    const text = String(raw || "").trim();
    const match = text.match(/^([\s\S]*?)(?:\s*—\s*Files:\s*|\s+\|\s*Files:\s*)([\s\S]*)$/);
    if (!match) {
      return { text: text.replace(/^\(no text\)\s*$/i, "").trim(), files: [] };
    }
    return {
      text: String(match[1] || "").replace(/^\(no text\)\s*$/i, "").trim(),
      files: parseFileRefs(match[2])
    };
  }

  function markedBlocks(text, regex) {
    const raw = String(text || "").replace(/\r/g, "");
    const re = new RegExp(regex.source, regex.flags);
    const matches = [];
    let m = re.exec(raw);
    while (m) {
      matches.push({
        index: m.index,
        end: m.index + m[0].length,
        match: m
      });
      m = re.exec(raw);
    }
    return { raw: raw, matches: matches };
  }

  function splitRevisionMessageParts(text) {
    return String(text || "")
      .split(/\s*\|\|?\s*(?=(?:Buyer|Seller)\b)/i)
      .map(function (part) { return String(part || "").trim(); })
      .filter(Boolean);
  }

  function isBareUrl(text) {
    return /^https?:\/\/\S+$/i.test(String(text || "").trim());
  }

  function uniqueFiles(files) {
    const seen = {};
    return (files || []).filter(function (file) {
      if (!file || !(file.name || file.url)) return false;
      const key = String(file.url || "") + "\n" + String(file.name || "");
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    });
  }

  function attachUrlToFiles(files, url) {
    const list = (files || []).map(function (file) {
      return {
        id: file.id || "",
        name: file.name || "",
        url: file.url || "",
        type: file.type || "",
        size: file.size || 0,
        driveId: file.driveId || ""
      };
    });
    const href = String(url || "").trim();
    if (!href) return list;
    const id = driveFileId(href);
    const empty = list.find(function (file) { return file && !file.url; });
    if (empty) {
      empty.url = href;
      if (id) empty.driveId = empty.driveId || id;
      return list;
    }
    const already = list.some(function (file) {
      return file.url === href || (id && driveFileId(file.url) === id);
    });
    if (already) return list;
    list.push({
      id: "",
      name: id ? "File-" + id.slice(0, 8) : "Download",
      url: href,
      type: "",
      size: 0,
      driveId: id || ""
    });
    return list;
  }

  function peelDriveUrls(text) {
    const urls = [];
    const cleaned = String(text || "").replace(/https?:\/\/(?:drive\.google\.com|lh3\.googleusercontent\.com)[^\s]+/ig, function (url) {
      urls.push(url.replace(/[),.;]+$/, ""));
      return " ";
    }).replace(/\s+/g, " ").trim();
    return { text: cleaned, urls: urls };
  }

  function repairRevisionMessages(messages) {
    const prepared = [];
    (messages || []).forEach(function (message) {
      if (!message) return;
      const split = splitMessageBody(message.text || "");
      let text = String(message.text || "").trim();
      let files = (message.files || []).slice();
      if (split.files && split.files.length) {
        text = split.text;
        files = files.concat(split.files);
      }
      const peeled = peelDriveUrls(text);
      peeled.urls.forEach(function (url) {
        files = attachUrlToFiles(files, url);
      });
      text = peeled.text;
      if (isBareUrl(text)) {
        files = attachUrlToFiles(files, text);
        text = "";
      }
      prepared.push(Object.assign({}, message, { text: text, files: uniqueFiles(files) }));
    });

    function isUrlOnlyFile(file) {
      if (!file || !file.url) return false;
      const name = String(file.name || "");
      return !name || name === "Download" || /^File-/.test(name) || isBareUrl(name);
    }

    const needUrl = [];
    prepared.forEach(function (message) {
      (message.files || []).forEach(function (file) {
        if (file && file.name && !file.url && !isBareUrl(file.name) && !isUrlOnlyFile(file)) {
          needUrl.push(file);
        }
      });
    });

    const kept = [];
    prepared.forEach(function (message) {
      const files = message.files || [];
      const urlOnly = !String(message.text || "").trim() && files.length && files.every(isUrlOnlyFile);
      if (urlOnly) {
        files.forEach(function (file) {
          const target = needUrl[0];
          if (target && !target.url) {
            needUrl.shift();
            target.url = file.url;
            target.driveId = file.driveId || driveFileId(file.url) || target.driveId || "";
            return;
          }
          if (kept.length) {
            kept[kept.length - 1].files = uniqueFiles(attachUrlToFiles(kept[kept.length - 1].files || [], file.url));
            return;
          }
          kept.push(Object.assign({}, message, { files: [file] }));
        });
        return;
      }
      kept.push(message);
    });
    kept.forEach(function (message) {
      message.files = uniqueFiles(message.files);
    });
    return kept;
  }

  function driveFileId(url) {
    const value = String(url || "");
    const query = value.match(/[?&]id=([^&]+)/i);
    if (query) return decodeURIComponent(query[1]);
    const path = value.match(/\/d\/([^/]+)/);
    return path ? path[1] : "";
  }

  function isImageFile(file) {
    const type = String((file && file.type) || "");
    if (/^image\//i.test(type)) return true;
    return /\.(png|jpe?g|gif|webp|bmp|svg|heic|heif)$/i.test(String((file && file.name) || ""));
  }

  function filePreviewUrl(file) {
    const urls = filePreviewUrls(file);
    return urls[0] || "";
  }

  function filePreviewUrls(file) {
    if (!file) return [];
    const id = driveFileId(file.url);
    const urls = [];
    if (file.previewUrl) urls.push(file.previewUrl);
    if (id) {
      urls.push("https://lh3.googleusercontent.com/d/" + encodeURIComponent(id) + "=w400");
      urls.push("https://drive.google.com/thumbnail?id=" + encodeURIComponent(id) + "&sz=w400");
      urls.push("https://drive.google.com/uc?export=view&id=" + encodeURIComponent(id));
    }
    if (file.url && urls.indexOf(file.url) === -1) urls.push(file.url);
    return urls;
  }

  function fileDownloadUrl(file) {
    if (!file) return "";
    const id = driveFileId(file.url) || driveFileId(file.name);
    if (id) return "https://drive.google.com/uc?export=download&confirm=t&id=" + encodeURIComponent(id);
    return (file && file.url) || "";
  }

  function overlayFileUrls(previous, incoming) {
    const prev = previous || [];
    const next = incoming || [];
    if (!prev.length) {
      return (next || []).filter(function (file) { return file && file.name; }).map(function (file) {
        return {
          id: file.id || "",
          name: file.name || "",
          url: file.url || "",
          type: file.type || "",
          size: file.size || 0,
          uploadedAt: file.uploadedAt || ""
        };
      });
    }
    const used = {};
    const merged = prev.map(function (file, index) {
      const match = next.find(function (item, itemIndex) {
        if (used[itemIndex]) return false;
        if (file.id && item.id && item.id === file.id) return true;
        return item.name && file.name && item.name === file.name;
      });
      if (match) used[next.indexOf(match)] = true;
      return {
        id: file.id || (match && match.id) || "",
        name: file.name || (match && match.name) || "",
        url: file.url || (match && match.url) || "",
        type: file.type || (match && match.type) || "",
        size: file.size || (match && match.size) || 0,
        uploadedAt: file.uploadedAt || (match && match.uploadedAt) || "",
        driveId: file.driveId || (match && match.driveId) || "",
        previewUrl: file.previewUrl || (match && match.previewUrl) || "",
        pendingBlob: file.pendingBlob || (match && match.pendingBlob) || null
      };
    });
    next.forEach(function (file, index) {
      if (used[index] || !file || !file.name) return;
      merged.push({
        id: file.id || "",
        name: file.name || "",
        url: file.url || "",
        type: file.type || "",
        size: file.size || 0,
        uploadedAt: file.uploadedAt || ""
      });
    });
    return merged;
  }

  function overlayMessageFiles(previousList, incomingList) {
    const prev = normalizeMessageThread(previousList);
    const incoming = normalizeMessageThread(incomingList);
    if (!prev.length) return incoming;
    if (!incoming.length) return prev;
    const leftover = incoming.slice();
    const merged = prev.map(function (message) {
      const role = threadRole(message);
      const index = leftover.findIndex(function (item) { return threadRole(item) === role; });
      const match = index >= 0 ? leftover.splice(index, 1)[0] : null;
      return Object.assign({}, message, {
        text: String(message.text || "").trim() || (match && match.text) || "",
        files: overlayFileUrls(message.files || [], (match && match.files) || [])
      });
    });
    leftover.forEach(function (item) { merged.push(item); });
    return merged;
  }

  function overlayRevisionFiles(previousRounds, incomingRounds) {
    const prev = normalizeRevisions(previousRounds || []);
    const incoming = normalizeRevisions(incomingRounds || []);
    if (!prev.length) return incoming;
    if (!incoming.length) return prev;
    return prev.map(function (round) {
      const match = incoming.find(function (item) {
        return Number(item.number) === Number(round.number);
      }) || null;
      const leftover = ((match && match.messages) || []).slice();
      const messages = (round.messages || []).map(function (message) {
        const role = message.role === "seller" || message.kind === "seller" ? "seller" : "buyer";
        const index = leftover.findIndex(function (item) {
          const itemRole = item.role === "seller" || item.kind === "seller" ? "seller" : "buyer";
          return itemRole === role;
        });
        const found = index >= 0 ? leftover.splice(index, 1)[0] : null;
        return Object.assign({}, message, {
          files: overlayFileUrls(message.files || [], (found && found.files) || [])
        });
      });
      return Object.assign({}, round, { messages: messages });
    });
  }

  function parseRevisionHistoryText(text, createdAt) {
    const blocks = markedBlocks(text, /^Revision\s+(\d+)\s*\[(Completed|Open)\]\s*:?\s*/gim);
    const rounds = [];
    blocks.matches.forEach(function (item, i) {
      const match = item.match;
      const number = Number(match[1]) || rounds.length + 1;
      const stop = i + 1 < blocks.matches.length ? blocks.matches[i + 1].index : blocks.raw.length;
      const rest = String(blocks.raw.slice(item.end, stop) || "").trim();
      const messages = [];
      if (rest && rest !== "(empty)") {
        splitRevisionMessageParts(rest).forEach(function (part, index) {
          const chunk = String(part || "").trim();
          if (!chunk) return;
          const body = splitMessageBody(chunk.replace(/^(Buyer|Seller)(?:\s*\([^)]*\))?\s*—\s*/i, ""));
          messages.push({
            id: "msg_sheet_" + number + "_" + index,
            role: /^Seller/i.test(chunk) ? "seller" : "buyer",
            text: body.text,
            files: body.files,
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
    return normalizeRevisions((order && order.revisions) || []);
  }

  function canAddRevision() {
    return true;
  }

  function addRevision(order) {
    if (!order) return order;
    order.revisions = normalizeRevisions(order.revisions || []);
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
    return order;
  }

  function setRevisionCompleted(order, revisionId, completed) {
    if (!order) return order;
    const rounds = normalizeRevisions(order.revisions || []);
    const index = rounds.findIndex(function (round) {
      return String(round.id) === String(revisionId);
    });
    if (index < 0) return order;
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
    if (tab === "orders-placed") return "orders-placed";
    return "in-progress";
  }

  function recordTab(order) {
    return boardStatusOf(order) || "in-progress";
  }

  function currentRevision(order) {
    const revisions = normalizeRevisions((order && order.revisions) || []);
    const open = revisions.find(function (item) { return !item.completed; });
    if (open) return open;
    return revisions.length ? revisions[revisions.length - 1] : null;
  }

  function pad2(n) {
    return (Number(n) < 10 ? "0" : "") + String(n);
  }

  function ymd(value) {
    const text = String(value || "").trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
    const parsed = new Date(text);
    if (isNaN(parsed.getTime())) return "";
    return parsed.getFullYear() + "-" + pad2(parsed.getMonth() + 1) + "-" + pad2(parsed.getDate());
  }

  function todayYmd() {
    const d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function shiftYmd(value, days) {
    const date = ymd(value);
    if (!date) return "";
    const parts = date.split("-");
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    d.setDate(d.getDate() + Number(days || 0));
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function formatPlaceOn(value) {
    const date = ymd(value);
    if (!date) return "—";
    const parts = date.split("-");
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  }

  function placementStatusOf(order) {
    if (!order) return "Unscheduled";
    if (isExplicitlyPlaced(order)) return "Placed";
    if (order.placementHold) return "On Hold";
    const date = ymd(order.placeOn);
    if (!date) return "Unscheduled";
    const today = todayYmd();
    if (date < today) return "Overdue";
    if (date === today) return "Place Today";
    if (date === shiftYmd(today, 1)) return "Scheduled";
    if (date > shiftYmd(today, 1)) return "Later";
    return "Scheduled";
  }

  function isScheduleOverdue(order) {
    if (!order || isExplicitlyPlaced(order) || order.placementHold) return false;
    const date = ymd(order.placeOn);
    if (!date) return false;
    return date < todayYmd();
  }

  function placementBucket(order) {
    const status = placementStatusOf(order);
    if (status === "On Hold") return "hold";
    if (status === "Placed") return "placed";
    if (status === "Overdue") return "overdue";
    if (status === "Unscheduled") return "unscheduled";
    const date = ymd(order.placeOn);
    const today = todayYmd();
    if (date === today) return "today";
    if (date === shiftYmd(today, 1)) return "tomorrow";
    if (date > shiftYmd(today, 1)) return "later";
    return "scheduled";
  }

  function normalizeSchedule(order) {
    if (!order) return order;
    order.placeOn = ymd(order.placeOn);
    order.placementHold = Boolean(order.placementHold);
    order.placementPlaced = Boolean(order.placementPlaced);
    if (order.placementPlaced) order.placementHold = false;
    order.scheduledBy = String(order.scheduledBy || "");
    order.scheduleUpdatedAt = String(order.scheduleUpdatedAt || "");
    order.placedAt = String(order.placedAt || "");
    order.placementStatus = placementStatusOf(order);
    return order;
  }

  function keepSchedule(order, previous) {
    if (!order || !previous) return order;
    if (order.placeOn == null) order.placeOn = previous.placeOn;
    if (order.placementHold == null) order.placementHold = previous.placementHold;
    if (order.placementPlaced == null) order.placementPlaced = previous.placementPlaced;
    if (order.scheduledBy == null) order.scheduledBy = previous.scheduledBy;
    if (order.scheduleUpdatedAt == null) order.scheduleUpdatedAt = previous.scheduleUpdatedAt;
    if (order.placedAt == null) order.placedAt = previous.placedAt;
    return order;
  }

  function scheduleStampMs(value) {
    const text = String(value || "").trim();
    if (!text) return 0;
    const parsed = Date.parse(text);
    if (!isNaN(parsed)) return parsed;
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
    if (!match) return 0;
    return new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4] || 0),
      Number(match[5] || 0)
    ).getTime();
  }

  function sheetSaysPlaced(order) {
    return /^placed$/i.test(String((order && order.placementStatus) || "").trim()) &&
      String((order && order.placedAt) || "").trim() !== "";
  }

  function mergeSchedule(order, previous) {
    if (!previous) {
      if (/on hold/i.test(String(order.placementStatus || ""))) order.placementHold = true;
      order.placementPlaced = sheetSaysPlaced(order);
      if (!order.placementPlaced && parseBoardStatus(order.boardStatus) === "orders-placed") {
        order.placementPlaced = true;
      }
      return normalizeSchedule(order);
    }
    const incomingStamp = scheduleStampMs(order.scheduleUpdatedAt);
    const previousStamp = scheduleStampMs(previous.scheduleUpdatedAt);
    const incomingHold = Boolean(order.placementHold) || /on hold/i.test(String(order.placementStatus || ""));
    const incomingPlaced = sheetSaysPlaced(order) ||
      (Boolean(order.placementPlaced) && String(order.placedAt || "").trim() !== "");
    const incomingDate = ymd(order.placeOn);
    if (previousStamp > incomingStamp) {
      order.placeOn = previous.placeOn;
      order.placementHold = previous.placementHold;
      order.placementPlaced = previous.placementPlaced;
      order.scheduledBy = previous.scheduledBy;
      order.scheduleUpdatedAt = previous.scheduleUpdatedAt;
      order.placedAt = previous.placedAt;
    } else if (!incomingDate && !incomingHold && !incomingPlaced && !incomingStamp && (previous.placeOn || previous.placementHold || previous.placementPlaced)) {
      order.placeOn = previous.placeOn;
      order.placementHold = previous.placementHold;
      order.placementPlaced = previous.placementPlaced;
      order.scheduledBy = previous.scheduledBy || order.scheduledBy;
      order.scheduleUpdatedAt = previous.scheduleUpdatedAt || order.scheduleUpdatedAt;
      order.placedAt = previous.placedAt || order.placedAt;
    } else {
      order.placementHold = incomingHold;
      order.placementPlaced = incomingPlaced;
    }
    return normalizeSchedule(order);
  }

  function applyManualSchedule(order, patch, actor) {
    if (!order) return order;
    const next = patch || {};
    const wasPlaced = Boolean(order.placementPlaced);
    if (next.clear) {
      order.placeOn = "";
      order.placementHold = false;
      order.placementPlaced = false;
    } else if (next.hold) {
      order.placementHold = true;
      order.placementPlaced = false;
      order.placeOn = "";
    } else if (next.placed) {
      order.placementPlaced = true;
      order.placementHold = false;
      order.placedAt = order.placedAt || nowIso();
      setBoardStatus(order, "orders-placed");
    } else {
      if (next.placeOn != null) order.placeOn = ymd(next.placeOn);
      order.placementHold = false;
      if (!wasPlaced) order.placementPlaced = false;
    }
    order.scheduledBy = String(actor || order.scheduledBy || "");
    order.scheduleUpdatedAt = nowIso();
    return normalizeSchedule(order);
  }

  function upsertOrder(order) {
    const orders = getOrders();
    const stamp = nowIso();
    const existing = order && order.id
      ? orders.find(function (item) { return item.id === order.id; })
      : null;
    if (existing) keepSchedule(order, existing);
    normalizeSchedule(order);
    order.status = computeStatus(order);
    order.revisions = normalizeRevisions(order.revisions);
    order.messageThread = messageThreadOf(order);
    if (order.messageThread.length) {
      order.messageText = formatMessageThread(order.messageThread);
    }
    fillOrderAccountProfile(order, existing);
    if (!order.id) {
      order.id = nextOrderId();
      order.createdAt = stamp;
      order.updatedAt = stamp;
      rememberOrderNumber(order.id);
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

  function normalizePaymentStatus(value) {
    const text = String(value || "").trim().toLowerCase();
    if (text === "paid") return "paid";
    if (text === "unpaid") return "unpaid";
    return "";
  }

  function shouldBackfillPayment(orderValue, sourceValue) {
    const orderPayment = normalizePaymentStatus(orderValue);
    const sourcePayment = normalizePaymentStatus(sourceValue);
    if (!sourcePayment) return false;
    if (!orderPayment) return true;
    return orderPayment === "unpaid" && sourcePayment === "paid";
  }

  function fillEmptyOrderProfile(order, source) {
    if (!order || !source) return;
    if (!String(order.whatsapp || "").trim() && String(source.whatsapp || "").trim()) {
      order.whatsapp = source.whatsapp;
    }
    if (!String(order.name || "").trim() && String(source.personName || source.name || "").trim()) {
      order.name = source.personName || source.name;
    }
    if (!String(order.fiverrId || "").trim() && String(source.fiverrId || "").trim()) {
      order.fiverrId = source.fiverrId;
    }
    if (!String(order.fiverrGigUrl || "").trim() && String(source.fiverrGigUrl || "").trim()) {
      order.fiverrGigUrl = source.fiverrGigUrl;
    }
    if (shouldBackfillPayment(order.paymentStatus, source.paymentStatus)) {
      order.paymentStatus = normalizePaymentStatus(source.paymentStatus);
    }
  }

  function orderNeedsProfileRepair(before, after) {
    if (!before || !after) return false;
    if (!String(before.fiverrId || "").trim() && String(after.fiverrId || "").trim()) return true;
    if (!String(before.fiverrGigUrl || "").trim() && String(after.fiverrGigUrl || "").trim()) return true;
    if (!String(before.whatsapp || "").trim() && String(after.whatsapp || "").trim()) return true;
    if (!String(before.name || "").trim() && String(after.name || "").trim()) return true;
    if (normalizePaymentStatus(before.paymentStatus) !== normalizePaymentStatus(after.paymentStatus) &&
        shouldBackfillPayment(before.paymentStatus, after.paymentStatus)) {
      return true;
    }
    return false;
  }

  function fillOrderAccountProfile(order, previous) {
    if (!order) return order;
    fillEmptyOrderProfile(order, previous);
    fillEmptyOrderProfile(order, accountForName(order.accountName || order.tabName || ""));
    const auth = global.OwlisticAuth;
    const session = auth && auth.getSession && auth.getSession();
    if (session && auth.sameAccount && auth.sameAccount(session.account, order.accountName || order.tabName)) {
      fillEmptyOrderProfile(order, session);
    }
    return order;
  }

  function mergeRequirementFiles(previous, incoming) {
    return overlayFileUrls(previous || [], incoming || []);
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
        const files = (message.files || []).map(formatFileRef).filter(Boolean).join(" ; ");
        if (!text && !files) return;
        lines.push(label + " " + number + ": " + (text || "(no text)") + (files ? " | Files: " + files : ""));
      }
      line("Buyer Message", pair.buyer);
      line("Client Reply", pair.client);
      return lines.join("\n");
    }).filter(Boolean).join("\n");
  }

  function parseMessageThreadText(text) {
    const blocks = markedBlocks(text, /^(Buyer Message|Client Reply)\s+(\d+)\s*:\s*/gim);
    if (!blocks.matches.length) {
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
    return blocks.matches.map(function (item, i) {
      const label = item.match[1];
      const number = item.match[2];
      const stop = i + 1 < blocks.matches.length ? blocks.matches[i + 1].index : blocks.raw.length;
      const body = splitMessageBody(String(blocks.raw.slice(item.end, stop) || "").trim());
      const isClient = /^Client Reply$/i.test(label);
      return {
        id: (isClient ? "mt_sheet_c_" : "mt_sheet_b_") + number,
        role: isClient ? "client" : "buyer",
        createdAt: "",
        text: body.text,
        files: body.files
      };
    });
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
      order.overallStatus = order.overallStatus ||
        (order.boardStatus && boardStatusLabel(order.boardStatus)) ||
        "";
      order.status = computeStatus(order);
      return mergeSchedule(fillOrderAccountProfile(order, null), null);
    }
    const incomingRevisions = order.revisions || [];
    const looksLikeSheetStub = incomingRevisions.length && incomingRevisions.every(function (item) {
      return String(item.id || "").indexOf("rev_sheet") === 0;
    });
    const previousIsLocal = (previous.revisions || []).some(function (item) {
      return String(item.id || "").indexOf("rev_sheet") !== 0;
    });
    if (previous.revisions && previous.revisions.length && (!incomingRevisions.length || (looksLikeSheetStub && previousIsLocal))) {
      order.revisions = overlayRevisionFiles(previous.revisions, incomingRevisions);
    } else if (previous.revisions && previous.revisions.length) {
      order.revisions = overlayRevisionFiles(order.revisions, previous.revisions);
    }
    const incomingThread = order.messageThread || [];
    const previousThread = previous.messageThread || [];
    if (previousThread.length || incomingThread.length) {
      if (!previousThread.length) {
        order.messageThread = incomingThread;
      } else if (!incomingThread.length) {
        order.messageThread = previousThread;
      } else if (incomingThread.length >= previousThread.length) {
        order.messageThread = overlayMessageFiles(incomingThread, previousThread);
      } else {
        order.messageThread = overlayMessageFiles(previousThread, incomingThread);
      }
      order.messageText = formatMessageThread(order.messageThread) || order.messageText || previous.messageText;
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
    const incomingStatus = parseBoardStatus(order.boardStatus) || parseBoardStatus(order.overallStatus);
    const previousStatus = parseBoardStatus(previous.boardStatus) || parseBoardStatus(previous.overallStatus);
    const incomingUpdated = Date.parse(order.updatedAt || "") || 0;
    const previousUpdated = Date.parse(previous.updatedAt || "") || 0;
    if (previousUpdated > incomingUpdated && previousStatus) {
      order.boardStatus = previous.boardStatus || previousStatus;
      order.overallStatus = previous.overallStatus || boardStatusLabel(previousStatus);
    } else {
      order.boardStatus = incomingStatus || previousStatus || order.boardStatus || "";
      order.overallStatus = order.overallStatus ||
        (order.boardStatus && boardStatusLabel(parseBoardStatus(order.boardStatus))) ||
        previous.overallStatus ||
        "";
    }
    order.status = computeStatus(order);
    return mergeSchedule(fillOrderAccountProfile(order, previous), previous);
  }

  function importOrders(incoming) {
    const orders = getOrders();
    (incoming || []).forEach(function (order) {
      if (!order || !order.id) return;
      const index = orders.findIndex(function (item) { return item.id === order.id; });
      const previous = index === -1 ? null : orders[index];
      const next = hydrateImportedOrder(order, previous);
      rememberOrderNumber(next.id);
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
      const hydrated = hydrateImportedOrder(order, previous);
      rememberOrderNumber(hydrated.id);
      next.push(hydrated);
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
    fillOrderAccountProfile: fillOrderAccountProfile,
    orderNeedsProfileRepair: orderNeedsProfileRepair,
    applyManualSchedule: applyManualSchedule,
    placementStatusOf: placementStatusOf,
    isScheduleOverdue: isScheduleOverdue,
    placementBucket: placementBucket,
    formatPlaceOn: formatPlaceOn,
    ymd: ymd,
    todayYmd: todayYmd,
    normalizeSchedule: normalizeSchedule,
    adoptOrderId: adoptOrderId,
    rememberOrderNumber: rememberOrderNumber,
    orderNumberOf: orderNumberOf,
    padOrderId: padOrderId,
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
    parseFileRefs: parseFileRefs,
    formatFileRef: formatFileRef,
    repairRevisionMessages: repairRevisionMessages,
    isImageFile: isImageFile,
    filePreviewUrl: filePreviewUrl,
    filePreviewUrls: filePreviewUrls,
    fileDownloadUrl: fileDownloadUrl,
    mergeRequirementFiles: mergeRequirementFiles,
    overlayFileUrls: overlayFileUrls,
    overlayMessageFiles: overlayMessageFiles,
    overlayRevisionFiles: overlayRevisionFiles,
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
  global.OwlisticStore.fillOrderAccountProfile = fillOrderAccountProfile;
  global.OwlisticStore.orderNeedsProfileRepair = orderNeedsProfileRepair;
  global.OwlisticStore.applyManualSchedule = applyManualSchedule;
  global.OwlisticStore.placementStatusOf = placementStatusOf;
  global.OwlisticStore.isScheduleOverdue = isScheduleOverdue;
  global.OwlisticStore.placementBucket = placementBucket;
  global.OwlisticStore.formatPlaceOn = formatPlaceOn;
})(window);
