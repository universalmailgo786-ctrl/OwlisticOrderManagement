(function () {
  const auth = window.OwlisticAuth;
  const chat = window.OwlisticChat;
  const config = window.OwlisticChatConfig || {};
  const session = auth.requirePage();
  if (!session) return;
  auth.bindNav();
  if (window.OwlisticChatNav) window.OwlisticChatNav.mount();

  const me = chat.sessionUser();
  const layout = document.getElementById("chat-layout");
  const inboxList = document.getElementById("chat-inbox-list");
  const inboxSearch = document.getElementById("chat-inbox-search");
  const inboxEmpty = document.getElementById("chat-inbox-empty");
  const startUser = document.getElementById("chat-start-user");
  const startBtn = document.getElementById("chat-start-btn");
  const backBtn = document.getElementById("chat-back");
  const headerTitle = document.getElementById("chat-header-title");
  const headerSub = document.getElementById("chat-header-sub");
  const headerAvatar = document.getElementById("chat-header-avatar");
  const statusEl = document.getElementById("chat-status");
  const logEl = document.getElementById("chat-log");
  const emptyEl = document.getElementById("chat-empty");
  const errorEl = document.getElementById("chat-error");
  const olderBtn = document.getElementById("chat-load-older");
  const form = document.getElementById("chat-composer");
  const input = document.getElementById("chat-input");
  const sendBtn = document.getElementById("chat-send");
  const attachBtn = document.getElementById("chat-attach");
  const fileInput = document.getElementById("chat-file");
  const previewsEl = document.getElementById("chat-previews");
  const toastEl = document.getElementById("chat-toast");
  const lightbox = document.getElementById("chat-image-lightbox");
  const lightboxImg = document.getElementById("chat-image-lightbox-img");

  const state = {
    thread: null,
    messages: [],
    threads: [],
    directory: [],
    unread: { total: 0, byThread: {} },
    hasMore: false,
    loading: false,
    sending: false,
    search: "",
    mobileChat: false,
    pending: [],
    fingerprint: ""
  };

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function initials(name) {
    const parts = String(name || "?").trim().split(/\s+/).slice(0, 2);
    return parts.map(function (part) { return part.charAt(0).toUpperCase(); }).join("") || "?";
  }

  function formatTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (isNaN(date.getTime())) return "";
    const day = date.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
    const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return day + " · " + time;
  }

  function setStatus(text, isError) {
    if (!statusEl) return;
    statusEl.textContent = text || "";
    statusEl.classList.toggle("is-error", Boolean(isError));
  }

  function showError(text) {
    if (!errorEl) return;
    errorEl.hidden = !text;
    errorEl.textContent = text || "";
  }

  function showToast(title, body) {
    if (!toastEl) return;
    toastEl.hidden = false;
    toastEl.innerHTML = "<strong></strong><span></span>";
    toastEl.querySelector("strong").textContent = title || "New message";
    toastEl.querySelector("span").textContent = body || "";
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(function () {
      toastEl.hidden = true;
    }, 5000);
  }

  window.OwlisticChatNotify = function (title, body) {
    showToast(title, body);
  };

  function directoryName(userId) {
    const wanted = String(userId || "").toLowerCase();
    const match = state.directory.find(function (item) {
      return String(item.username || "").toLowerCase() === wanted ||
        String(item.account || "").toLowerCase() === wanted;
    });
    if (match) return match.displayName || match.personName || match.account || match.username;
    const thread = state.threads.find(function (item) { return String(item.user_id).toLowerCase() === wanted; });
    return (thread && thread.user_id) || userId || "User";
  }

  function previewText(thread) {
    const text = String((thread && thread.last_message) || "").trim();
    if (text) return text;
    return "No messages yet";
  }

  function renderInbox() {
    if (!me.isSuperAdmin || !inboxList) return;
    const q = String(state.search || "").trim().toLowerCase();
    const rows = state.threads.filter(function (thread) {
      if (!q) return true;
      const label = directoryName(thread.user_id).toLowerCase();
      return label.indexOf(q) >= 0 || String(thread.user_id).toLowerCase().indexOf(q) >= 0 ||
        String(thread.last_message || "").toLowerCase().indexOf(q) >= 0;
    });
    inboxList.innerHTML = "";
    if (!rows.length) {
      inboxEmpty.hidden = false;
      inboxEmpty.textContent = q ? "No conversations match that search." : "No conversations yet. Start one from the list below.";
    } else {
      inboxEmpty.hidden = true;
    }
    rows.forEach(function (thread) {
      const label = directoryName(thread.user_id);
      const unread = state.unread.byThread[thread.id] || 0;
      const item = document.createElement("button");
      item.type = "button";
      item.className = "chat-conv" + (state.thread && state.thread.id === thread.id ? " is-active" : "") + (unread ? " has-unread" : "");
      item.innerHTML =
        '<span class="chat-avatar" aria-hidden="true">' + escapeHtml(initials(label)) + "</span>" +
        '<span class="chat-conv-body">' +
          '<span class="chat-conv-top">' +
            '<span class="chat-conv-name"></span>' +
            '<span class="chat-conv-time"></span>' +
          "</span>" +
          '<span class="chat-conv-preview"></span>' +
        "</span>" +
        (unread ? '<span class="chat-unread-badge">' + (unread > 99 ? "99+" : unread) + "</span>" : "");
      item.querySelector(".chat-conv-name").textContent = label;
      item.querySelector(".chat-conv-time").textContent = formatTime(thread.updated_at);
      item.querySelector(".chat-conv-preview").textContent = previewText(thread);
      item.addEventListener("click", function () {
        openThread(thread.user_id, true);
      });
      inboxList.appendChild(item);
    });

    if (startUser) {
      const existing = {};
      state.threads.forEach(function (thread) {
        existing[String(thread.user_id).toLowerCase()] = true;
      });
      const previous = startUser.value;
      startUser.innerHTML = '<option value="">Start a conversation…</option>';
      state.directory.forEach(function (user) {
        const id = String(user.username || "").trim();
        if (!id || /^(superadmin|admin)$/i.test(id) || existing[id.toLowerCase()]) return;
        const option = document.createElement("option");
        option.value = id;
        option.textContent = (user.displayName || user.personName || id) + " · " + id;
        startUser.appendChild(option);
      });
      if (previous) startUser.value = previous;
    }
  }

  function isMine(message) {
    const sender = String(message.sender_id || "");
    if (me.isSuperAdmin) return chat.isSuperAdminSender(sender);
    return sender.toLowerCase() === String(me.username).toLowerCase();
  }

  function openLightbox(src) {
    if (!lightbox || !lightboxImg || !src) return;
    lightboxImg.src = src;
    lightbox.hidden = false;
  }

  function closeLightbox() {
    if (!lightbox) return;
    lightbox.hidden = true;
    if (lightboxImg) lightboxImg.removeAttribute("src");
  }

  function messageNode(message) {
    const mine = isMine(message);
    const item = document.createElement("div");
    item.className = "chat-bubble-row" + (mine ? " is-mine" : "");
    item.setAttribute("data-message-id", message.id);
    const who = mine ? "You" : (chat.isSuperAdminSender(message.sender_id) ? (config.adminName || "Ashar") : directoryName(message.sender_id));
    const text = String(message.message || "").trim();
    const imageUrl = String(message.image_url || "").trim();
    const caption = text && text.toLowerCase() !== "photo" ? text : "";
    item.innerHTML =
      '<div class="chat-bubble">' +
        (imageUrl ? '<button type="button" class="chat-image-btn"><img class="chat-image" alt=""></button>' : "") +
        (caption ? '<p class="chat-bubble-text"></p>' : "") +
        '<span class="chat-bubble-meta">' +
          '<span class="chat-bubble-when"></span>' +
          (mine ? '<span class="chat-receipt"></span>' : "") +
        "</span>" +
      "</div>";
    if (imageUrl) {
      const img = item.querySelector(".chat-image");
      img.src = imageUrl;
      img.alt = caption || "Photo";
      item.querySelector(".chat-image-btn").addEventListener("click", function () {
        openLightbox(imageUrl);
      });
    }
    if (caption) item.querySelector(".chat-bubble-text").textContent = caption;
    item.querySelector(".chat-bubble-when").textContent = who + " · " + formatTime(message.created_at);
    if (mine) {
      const receipt = item.querySelector(".chat-receipt");
      const read = Boolean(message.read_at);
      receipt.textContent = read ? "Read" : "Sent";
      receipt.className = "chat-receipt " + (read ? "is-read" : "is-sent");
      if (read) receipt.title = "Read " + formatTime(message.read_at);
    }
    return item;
  }

  function setComposerEnabled(on) {
    if (!form) return;
    form.classList.toggle("is-disabled", !on);
    input.disabled = !on;
    sendBtn.disabled = !on || state.sending;
    if (attachBtn) attachBtn.disabled = !on;
    input.placeholder = on ? "Write a message or paste an image" : "Select a conversation to reply";
  }

  function renderMessages() {
    const stickToBottom = logEl.scrollTop + logEl.clientHeight >= logEl.scrollHeight - 80;
    logEl.querySelectorAll("[data-message-id]").forEach(function (node) {
      node.remove();
    });
    state.messages.forEach(function (message) {
      logEl.appendChild(messageNode(message));
    });
    emptyEl.hidden = state.messages.length > 0 || !state.thread;
    if (emptyEl && !state.thread) {
      emptyEl.hidden = false;
      emptyEl.querySelector("strong").textContent = "Select a conversation";
      emptyEl.querySelector("p").textContent = "Open a user on the left to read and reply.";
    } else if (emptyEl && state.thread && !state.messages.length) {
      emptyEl.querySelector("strong").textContent = "No messages yet";
      emptyEl.querySelector("p").textContent = "Send a message or paste an image to start this conversation.";
    }
    olderBtn.hidden = !state.hasMore;
    setComposerEnabled(Boolean(state.thread));
    if (stickToBottom || !state.messages.length) {
      logEl.scrollTop = logEl.scrollHeight;
    }
  }

  function upsertMessage(message) {
    if (!message || !message.id) return;
    const index = state.messages.findIndex(function (item) { return item.id === message.id; });
    if (index >= 0) state.messages[index] = message;
    else state.messages.push(message);
    state.messages.sort(function (a, b) {
      const at = String(a.created_at || "");
      const bt = String(b.created_at || "");
      if (at === bt) return String(a.id).localeCompare(String(b.id));
      return at < bt ? -1 : 1;
    });
  }

  function setHeader(thread) {
    if (!thread) {
      headerTitle.textContent = me.isSuperAdmin ? "Messages" : ("Chat with " + (config.adminName || "Admin"));
      headerSub.textContent = me.isSuperAdmin ? "Select a conversation" : "Private conversation with Superadmin";
      headerAvatar.textContent = initials(config.adminName || "A");
      return;
    }
    if (me.isSuperAdmin) {
      const label = directoryName(thread.user_id);
      headerTitle.textContent = label;
      headerSub.textContent = thread.user_id;
      headerAvatar.textContent = initials(label);
    } else {
      headerTitle.textContent = "Chat with " + (config.adminName || "Admin");
      headerSub.textContent = "Private conversation with Superadmin";
      headerAvatar.textContent = initials(config.adminName || "A");
    }
  }

  function setMobileChat(open) {
    state.mobileChat = Boolean(open);
    layout.classList.toggle("is-chat-open", state.mobileChat);
  }

  function renderPreviews() {
    if (!previewsEl) return;
    previewsEl.innerHTML = "";
    state.pending.forEach(function (item, index) {
      const chip = document.createElement("div");
      chip.className = "chat-preview-chip";
      chip.innerHTML = '<img alt=""><button type="button" aria-label="Remove image">×</button>';
      chip.querySelector("img").src = item.preview;
      chip.querySelector("button").addEventListener("click", function () {
        state.pending.splice(index, 1);
        renderPreviews();
      });
      previewsEl.appendChild(chip);
    });
  }

  async function addPendingFiles(fileList) {
    const files = Array.prototype.slice.call(fileList || []).filter(function (file) {
      return file && /^image\//i.test(file.type || "");
    });
    if (!files.length) return;
    showError("");
    for (let i = 0; i < files.length; i++) {
      if (state.pending.length >= 4) break;
      try {
        const compressed = await chat.compressImage(files[i]);
        state.pending.push({ file: files[i], preview: compressed.preview });
      } catch (err) {
        showError(err.message || "Could not add that image.");
      }
    }
    renderPreviews();
  }

  async function refreshUnread() {
    state.unread = await chat.unreadSummary();
    if (window.OwlisticChatNav) window.OwlisticChatNav.renderCount(state.unread.total);
    renderInbox();
  }

  async function loadDirectory() {
    if (!me.isSuperAdmin || !window.OwlisticSheet || typeof window.OwlisticSheet.fetchLoginUsers !== "function") {
      state.directory = [];
      return;
    }
    try {
      const result = await window.OwlisticSheet.fetchLoginUsers();
      state.directory = (result && result.users) || [];
      renderInbox();
    } catch (err) {
      state.directory = [];
    }
  }

  function fingerprintOf(threads) {
    return (threads || []).map(function (thread) {
      return thread.id + ":" + (thread.updated_at || "") + ":" + (thread.last_message || "");
    }).join("|");
  }

  async function loadInbox(options) {
    if (!me.isSuperAdmin) return;
    const silent = options && options.silent;
    try {
      const threads = await chat.listThreads();
      const nextPrint = fingerprintOf(threads);
      const changed = nextPrint !== state.fingerprint;
      state.threads = threads;
      state.fingerprint = nextPrint;
      await refreshUnread();
      renderInbox();
      if (!silent) setStatus(state.thread ? "Live" : "Select a conversation");
      return changed;
    } catch (err) {
      if (!silent) showError(err.message || "Could not load conversations.");
      return false;
    }
  }

  function viewingThisChat() {
    return Boolean(state.thread) && document.visibilityState === "visible";
  }

  async function markOpenThreadRead() {
    if (!state.thread || !viewingThisChat()) return;
    window.OwlisticChatViewingThreadId = state.thread.id;
    try {
      await chat.markRead(state.thread.id);
      await refreshUnread();
    } catch (err) {}
  }

  async function openThread(userId, fromInbox) {
    showError("");
    state.loading = true;
    setStatus("Loading…");
    try {
      const thread = await chat.getOrCreateThread(userId);
      state.thread = thread;
      window.OwlisticChatViewingThreadId = thread.id;
      const messages = await chat.listMessages(thread.id);
      state.messages = messages;
      state.hasMore = messages.length >= chat.pageSize;
      setHeader(thread);
      renderMessages();
      await markOpenThreadRead();
      await chat.subscribeThread(thread.id, {
        onInsert: function (row) {
          upsertMessage(row);
          renderMessages();
          if (row.thread_id === state.thread.id && !isMine(row)) {
            markOpenThreadRead();
          } else {
            refreshUnread();
          }
        },
        onUpdate: function (row) {
          upsertMessage(row);
          renderMessages();
        },
        onStatus: function (status) {
          if (status === "SUBSCRIBED") setStatus("Live");
          else if (status === "TIMED_OUT" || status === "CHANNEL_ERROR") setStatus("Checking for new messages…", true);
        }
      });
      setStatus("Live");
      if (fromInbox) setMobileChat(true);
      input.focus();
    } catch (err) {
      showError(err.message || "Could not open this conversation.");
      setStatus("Error", true);
    }
    state.loading = false;
    renderInbox();
  }

  async function loadOlder() {
    if (!state.thread || !state.messages.length) return;
    const first = state.messages[0];
    olderBtn.disabled = true;
    try {
      const older = await chat.listMessages(state.thread.id, first);
      state.hasMore = older.length >= chat.pageSize;
      older.forEach(upsertMessage);
      const previousHeight = logEl.scrollHeight;
      renderMessages();
      logEl.scrollTop = logEl.scrollHeight - previousHeight;
    } catch (err) {
      showError(err.message || "Could not load older messages.");
    }
    olderBtn.disabled = false;
  }

  async function send(event) {
    if (event) event.preventDefault();
    if (state.sending || !state.thread) return;
    const text = input.value.trim();
    const pending = state.pending.slice();
    if (!text && !pending.length) return;
    state.sending = true;
    sendBtn.disabled = true;
    input.value = "";
    state.pending = [];
    renderPreviews();
    try {
      if (pending.length) {
        for (let i = 0; i < pending.length; i++) {
          const uploaded = await chat.uploadImage(pending[i].file);
          const caption = i === pending.length - 1 ? text : "";
          const saved = await chat.sendMessage(state.thread.id, caption, uploaded.url);
          upsertMessage(saved);
        }
      } else {
        const saved = await chat.sendMessage(state.thread.id, text);
        upsertMessage(saved);
      }
      renderMessages();
      await loadInbox({ silent: true });
    } catch (err) {
      input.value = text;
      state.pending = pending.concat(state.pending);
      renderPreviews();
      showError(err.message || "Message was not sent.");
    }
    state.sending = false;
    sendBtn.disabled = false;
    input.focus();
  }

  function autoGrow() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 140) + "px";
  }

  function newestUnreadThread() {
    return state.threads.find(function (thread) {
      return state.unread.byThread[thread.id];
    }) || null;
  }

  input.addEventListener("input", autoGrow);
  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  });
  const chatMain = document.getElementById("chat-main");
  if (chatMain) {
    chatMain.addEventListener("paste", function (event) {
      const items = event.clipboardData && event.clipboardData.items;
      if (!items || !state.thread) return;
      const files = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.indexOf("image") === 0) {
          const file = items[i].getAsFile();
          if (file) files.push(file);
        }
      }
      if (!files.length) return;
      event.preventDefault();
      addPendingFiles(files);
    });
  }
  form.addEventListener("submit", send);
  form.addEventListener("dragover", function (event) {
    event.preventDefault();
    form.classList.add("is-drop");
  });
  form.addEventListener("dragleave", function () {
    form.classList.remove("is-drop");
  });
  form.addEventListener("drop", function (event) {
    event.preventDefault();
    form.classList.remove("is-drop");
    addPendingFiles(event.dataTransfer && event.dataTransfer.files);
  });
  olderBtn.addEventListener("click", loadOlder);
  if (attachBtn && fileInput) {
    attachBtn.addEventListener("click", function () {
      fileInput.click();
    });
    fileInput.addEventListener("change", function () {
      addPendingFiles(fileInput.files);
      fileInput.value = "";
    });
  }
  if (lightbox) {
    lightbox.addEventListener("click", function (event) {
      if (event.target === lightbox || event.target.hasAttribute("data-close-lightbox")) closeLightbox();
    });
  }
  if (backBtn) {
    backBtn.addEventListener("click", function () {
      setMobileChat(false);
    });
  }
  if (inboxSearch) {
    inboxSearch.addEventListener("input", function () {
      state.search = inboxSearch.value;
      renderInbox();
    });
  }
  if (startBtn) {
    startBtn.addEventListener("click", function () {
      const userId = startUser && startUser.value;
      if (!userId) return;
      openThread(userId, true);
    });
  }
  if (toastEl) {
    toastEl.addEventListener("click", function () {
      toastEl.hidden = true;
      const thread = newestUnreadThread();
      if (thread) openThread(thread.user_id, true);
    });
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") markOpenThreadRead();
  });

  function syncOpenMessages() {
    if (!state.thread) return;
    chat.listMessages(state.thread.id).then(function (rows) {
      let changed = false;
      const before = state.messages.length;
      (rows || []).forEach(function (row) {
        const prev = state.messages.find(function (item) { return item.id === row.id; });
        if (!prev || prev.read_at !== row.read_at || prev.message !== row.message || prev.image_url !== row.image_url) {
          changed = true;
        }
        upsertMessage(row);
      });
      if (changed || (rows || []).length !== before) renderMessages();
    }).catch(function () {});
    markOpenThreadRead();
  }

  async function boot() {
    layout.classList.toggle("is-admin", me.isSuperAdmin);
    layout.classList.toggle("is-user", !me.isSuperAdmin);
    setHeader(null);
    showError("");
    setComposerEnabled(!me.isSuperAdmin);
    if (inboxEmpty) inboxEmpty.textContent = "Loading conversations…";
    setStatus("Loading…");
    try {
      await chat.ensureClient();
    } catch (err) {
      showError(err.message || "Messages is not available yet.");
      setStatus("Offline", true);
      return;
    }
    loadDirectory();
    if (me.isSuperAdmin) {
      await loadInbox();
      chat.subscribeInbox({
        onThread: function () { loadInbox({ silent: true }); },
        onInsert: function () { loadInbox({ silent: true }); },
        onUpdate: function (payload) {
          if (payload && payload.new) {
            upsertMessage(payload.new);
            if (state.thread) renderMessages();
          }
          refreshUnread();
        }
      });
      setStatus("Select a conversation");
    } else {
      await openThread(me.username, false);
    }
    window.setInterval(function () {
      if (me.isSuperAdmin) loadInbox({ silent: true });
      syncOpenMessages();
    }, Number(config.pollMs || 4000));
  }

  boot();
})();
