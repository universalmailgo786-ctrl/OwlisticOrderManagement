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
  const inbox = document.getElementById("chat-inbox");
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
    mobileChat: false
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
    const now = new Date();
    const sameDay = date.toDateString() === now.toDateString();
    const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (sameDay) return time;
    return date.toLocaleDateString([], { month: "short", day: "numeric" }) + " · " + time;
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
      item.className = "chat-conv" + (state.thread && state.thread.id === thread.id ? " is-active" : "");
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
      item.querySelector(".chat-conv-preview").textContent = thread.last_message || "No messages yet";
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

  function messageNode(message) {
    const mine = isMine(message);
    const item = document.createElement("div");
    item.className = "chat-bubble-row" + (mine ? " is-mine" : "");
    item.setAttribute("data-message-id", message.id);
    const who = mine ? "You" : (chat.isSuperAdminSender(message.sender_id) ? (config.adminName || "Ashar") : directoryName(message.sender_id));
    item.innerHTML =
      '<div class="chat-bubble">' +
        '<p class="chat-bubble-text"></p>' +
        '<span class="chat-bubble-meta"></span>' +
      "</div>";
    item.querySelector(".chat-bubble-text").textContent = message.message || "";
    item.querySelector(".chat-bubble-meta").textContent = who + " · " + formatTime(message.created_at);
    return item;
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
    olderBtn.hidden = !state.hasMore;
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
    } catch (err) {
      state.directory = [];
    }
  }

  async function loadInbox() {
    if (!me.isSuperAdmin) return;
    state.threads = await chat.listThreads();
    await refreshUnread();
    renderInbox();
  }

  async function openThread(userId, fromInbox) {
    showError("");
    state.loading = true;
    setStatus("Loading…");
    try {
      const thread = await chat.getOrCreateThread(userId);
      state.thread = thread;
      const messages = await chat.listMessages(thread.id);
      state.messages = messages;
      state.hasMore = messages.length >= chat.pageSize;
      setHeader(thread);
      renderMessages();
      await chat.markRead(thread.id);
      await refreshUnread();
      await chat.subscribeThread(thread.id, {
        onInsert: function (row) {
          upsertMessage(row);
          renderMessages();
          if (state.thread && row.thread_id === state.thread.id && !isMine(row)) {
            chat.markRead(state.thread.id).then(refreshUnread);
          } else {
            refreshUnread();
          }
        },
        onUpdate: function (row) {
          upsertMessage(row);
        },
        onStatus: function (status) {
          if (status === "SUBSCRIBED") setStatus("Live");
          else if (status === "TIMED_OUT" || status === "CHANNEL_ERROR") setStatus("Reconnecting…", true);
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
    if (!text) return;
    state.sending = true;
    sendBtn.disabled = true;
    input.value = "";
    try {
      const saved = await chat.sendMessage(state.thread.id, text);
      upsertMessage(saved);
      renderMessages();
      await loadInbox();
    } catch (err) {
      input.value = text;
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

  input.addEventListener("input", autoGrow);
  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  });
  form.addEventListener("submit", send);
  olderBtn.addEventListener("click", loadOlder);
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

  async function boot() {
    layout.classList.toggle("is-admin", me.isSuperAdmin);
    layout.classList.toggle("is-user", !me.isSuperAdmin);
    setHeader(null);
    showError("");
    try {
      await chat.ensureClient();
    } catch (err) {
      showError(err.message || "Messages is not available yet.");
      setStatus("Offline", true);
      return;
    }
    await loadDirectory();
    if (me.isSuperAdmin) {
      await loadInbox();
      await chat.subscribeInbox({
        onThread: function () { loadInbox(); },
        onInsert: function () { loadInbox(); },
        onUpdate: function () { refreshUnread(); }
      });
      setStatus("Select a conversation");
    } else {
      await openThread(me.username, false);
    }
  }

  boot();
})();
