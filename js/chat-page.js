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
  const confirmEl = document.getElementById("chat-confirm");

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
    fingerprint: "",
    editingId: "",
    openMenuId: "",
    uploadProgress: {}
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

  function canEdit(message) {
    return isMine(message);
  }

  function canDelete(message) {
    return isMine(message) || me.isSuperAdmin;
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

  function captionOf(message) {
    const text = String(message.message || "").trim();
    if (!text || /^(photo|file)$/i.test(text)) return "";
    return text;
  }

  function imageSrc(att) {
    return att.signedUrl || att.image_url || "";
  }

  function messageAttachments(message) {
    return Array.isArray(message.attachments) ? message.attachments : [];
  }

  function askDelete() {
    return new Promise(function (resolve) {
      if (!confirmEl) {
        resolve(window.confirm("Delete this message?"));
        return;
      }
      confirmEl.hidden = false;
      const ok = confirmEl.querySelector("[data-confirm-ok]");
      const cancels = confirmEl.querySelectorAll("[data-confirm-cancel]");
      function finish(value) {
        confirmEl.hidden = true;
        ok.removeEventListener("click", onOk);
        cancels.forEach(function (el) { el.removeEventListener("click", onCancel); });
        resolve(value);
      }
      function onOk() { finish(true); }
      function onCancel() { finish(false); }
      ok.addEventListener("click", onOk);
      cancels.forEach(function (el) { el.addEventListener("click", onCancel); });
    });
  }

  function closeMenus() {
    state.openMenuId = "";
    logEl.querySelectorAll(".chat-msg-menu").forEach(function (el) {
      el.hidden = true;
    });
  }

  function messageNode(message) {
    const mine = isMine(message);
    const item = document.createElement("div");
    item.className = "chat-bubble-row" + (mine ? " is-mine" : "");
    item.setAttribute("data-message-id", message.id);
    const who = mine ? "You" : (chat.isSuperAdminSender(message.sender_id) ? (config.adminName || "Ashar") : directoryName(message.sender_id));
    const caption = captionOf(message);
    const imageUrl = String(message.image_url || "").trim();
    const atts = messageAttachments(message);
    const images = atts.filter(function (att) { return String(att.attachment_type || "") === "image"; });
    const files = atts.filter(function (att) { return String(att.attachment_type || "") !== "image"; });
    const editing = state.editingId === message.id;
    const showMenu = canEdit(message) || canDelete(message);
    const when = formatTime(message.created_at) + (message.edited_at ? " · Edited" : "");
    item.innerHTML =
      '<div class="chat-bubble">' +
        (showMenu
          ? '<div class="chat-msg-actions">' +
              '<button type="button" class="chat-msg-more" aria-label="Message actions">•••</button>' +
              '<div class="chat-msg-menu" hidden></div>' +
            "</div>"
          : "") +
        (imageUrl ? '<button type="button" class="chat-image-btn" data-legacy-image><img class="chat-image" alt=""></button>' : "") +
        '<div class="chat-att-images"></div>' +
        '<div class="chat-att-files"></div>' +
        (editing
          ? '<div class="chat-edit-box"><textarea class="chat-edit-input" rows="2"></textarea><div class="chat-edit-actions"><button type="button" class="ghost-btn" data-edit-cancel>Cancel</button><button type="button" class="submit-btn" data-edit-save>Save</button></div></div>'
          : (caption ? '<p class="chat-bubble-text"></p>' : "")) +
        '<span class="chat-bubble-meta">' +
          '<span class="chat-bubble-when"></span>' +
          (mine ? '<span class="chat-receipt"></span>' : "") +
        "</span>" +
      "</div>";

    if (imageUrl) {
      const img = item.querySelector(".chat-image");
      img.src = imageUrl;
      img.alt = caption || "Photo";
      item.querySelector("[data-legacy-image]").addEventListener("click", function () {
        openLightbox(imageUrl);
      });
    }

    const imageWrap = item.querySelector(".chat-att-images");
    images.forEach(function (att) {
      const src = imageSrc(att);
      if (!src) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chat-image-btn";
      btn.innerHTML = '<img class="chat-image" alt="">';
      btn.querySelector("img").src = src;
      btn.querySelector("img").alt = att.file_name || "Photo";
      btn.addEventListener("click", function () { openLightbox(src); });
      imageWrap.appendChild(btn);
    });

    const fileWrap = item.querySelector(".chat-att-files");
    files.forEach(function (att) {
      const link = document.createElement("a");
      link.className = "chat-file-card";
      link.href = att.signedUrl || "#";
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.innerHTML = '<span class="chat-file-icon" aria-hidden="true">📎</span><span class="chat-file-copy"><strong></strong><em></em></span>';
      link.querySelector("strong").textContent = att.file_name || "File";
      link.querySelector("em").textContent = chat.formatBytes(att.size_bytes || 0);
      if (!att.signedUrl) {
        link.addEventListener("click", function (event) {
          event.preventDefault();
          showError("That file is not available right now.");
        });
      }
      fileWrap.appendChild(link);
    });

    if (editing) {
      const area = item.querySelector(".chat-edit-input");
      area.value = caption || String(message.message || "").replace(/^(photo|file)$/i, "");
      item.querySelector("[data-edit-cancel]").addEventListener("click", function () {
        state.editingId = "";
        renderMessages();
      });
      item.querySelector("[data-edit-save]").addEventListener("click", function () {
        saveEdit(message, area.value);
      });
      window.setTimeout(function () { area.focus(); }, 0);
    } else if (caption) {
      item.querySelector(".chat-bubble-text").textContent = caption;
    }

    item.querySelector(".chat-bubble-when").textContent = who + " · " + when;
    if (mine) {
      const receipt = item.querySelector(".chat-receipt");
      const read = Boolean(message.read_at);
      receipt.textContent = read ? "Read" : "Sent";
      receipt.className = "chat-receipt " + (read ? "is-read" : "is-sent");
      if (read) receipt.title = "Read " + formatTime(message.read_at);
    }

    if (showMenu) {
      const more = item.querySelector(".chat-msg-more");
      const menu = item.querySelector(".chat-msg-menu");
      if (canEdit(message)) {
        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.textContent = "Edit";
        editBtn.addEventListener("click", function () {
          closeMenus();
          state.editingId = message.id;
          renderMessages();
        });
        menu.appendChild(editBtn);
      }
      if (canDelete(message)) {
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.textContent = "Delete";
        delBtn.addEventListener("click", function () {
          closeMenus();
          removeMessage(message);
        });
        menu.appendChild(delBtn);
      }
      more.addEventListener("click", function (event) {
        event.stopPropagation();
        const open = state.openMenuId === message.id;
        closeMenus();
        if (!open) {
          state.openMenuId = message.id;
          menu.hidden = false;
        }
      });
    }
    return item;
  }

  async function saveEdit(message, raw) {
    const text = String(raw || "").trim();
    const hasAtt = Boolean(String(message.image_url || "").trim()) || messageAttachments(message).length > 0 || message.has_files;
    if (!text && !hasAtt) {
      showError("Message cannot be empty.");
      return;
    }
    showError("");
    try {
      const saved = await chat.editMessage(message.id, text || (hasAtt ? (messageAttachments(message).some(function (att) { return att.attachment_type === "image"; }) || message.image_url ? "Photo" : "File") : ""));
      if (saved) {
        saved.attachments = message.attachments || [];
        upsertMessage(saved);
      }
      state.editingId = "";
      renderMessages();
      await loadInbox({ silent: true });
    } catch (err) {
      showError(err.message || "Could not save that edit.");
    }
  }

  async function removeMessage(message) {
    const ok = await askDelete();
    if (!ok) return;
    showError("");
    try {
      await chat.deleteMessage(message.id);
      removeMessageLocal(message.id);
      renderMessages();
      await refreshUnread();
      await loadInbox({ silent: true });
    } catch (err) {
      showError(err.message || "Could not delete that message.");
    }
  }

  function setComposerEnabled(on) {
    if (!form) return;
    form.classList.toggle("is-disabled", !on);
    input.disabled = !on;
    sendBtn.disabled = !on || state.sending;
    if (attachBtn) attachBtn.disabled = !on;
    input.placeholder = on ? "Write a message or attach a file" : "Select a conversation to reply";
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
      emptyEl.querySelector("p").textContent = "Send a message or attach a file to start this conversation.";
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
    if (index >= 0) {
      const prev = state.messages[index];
      if (!message.attachments && prev.attachments) message.attachments = prev.attachments;
      state.messages[index] = message;
    } else {
      state.messages.push(message);
    }
    state.messages.sort(function (a, b) {
      const at = String(a.created_at || "");
      const bt = String(b.created_at || "");
      if (at === bt) return String(a.id).localeCompare(String(b.id));
      return at < bt ? -1 : 1;
    });
  }

  function removeMessageLocal(id) {
    state.messages = state.messages.filter(function (item) { return item.id !== id; });
    if (state.editingId === id) state.editingId = "";
  }

  async function hydrateOne(message) {
    if (!message || !message.id) return message;
    try {
      const atts = await chat.loadAttachments(message.id);
      message.attachments = atts;
    } catch (err) {
      message.attachments = message.attachments || [];
    }
    return message;
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
      const progress = state.uploadProgress[index];
      if (item.kind === "image" && item.preview) {
        chip.className = "chat-preview-chip";
        chip.innerHTML = '<img alt=""><button type="button" aria-label="Remove file">×</button>';
        chip.querySelector("img").src = item.preview;
      } else {
        chip.className = "chat-preview-chip is-file";
        chip.innerHTML = '<span class="chat-file-icon" aria-hidden="true">📎</span><span class="chat-file-copy"><strong></strong><em></em></span><button type="button" aria-label="Remove file">×</button>';
        chip.querySelector("strong").textContent = item.name || "File";
        chip.querySelector("em").textContent = progress != null
          ? "Uploading " + Math.round(progress * 100) + "%"
          : chat.formatBytes(item.size || 0);
      }
      if (progress != null) chip.classList.add("is-uploading");
      chip.querySelector("button").addEventListener("click", function () {
        if (state.sending) return;
        state.pending.splice(index, 1);
        renderPreviews();
      });
      previewsEl.appendChild(chip);
    });
  }

  async function addPendingFiles(fileList) {
    const files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;
    showError("");
    for (let i = 0; i < files.length; i++) {
      if (state.pending.length >= chat.maxPending) {
        showError("You can attach up to " + chat.maxPending + " files in one message.");
        break;
      }
      const classified = chat.classifyClientFile(files[i]);
      if (!classified.ok) {
        showError(classified.error);
        continue;
      }
      try {
        if (classified.type === "image") {
          const compressed = await chat.compressImage(files[i]);
          state.pending.push({
            file: files[i],
            kind: "image",
            preview: compressed.preview,
            name: files[i].name,
            size: files[i].size
          });
        } else {
          state.pending.push({
            file: files[i],
            kind: "file",
            name: files[i].name,
            size: files[i].size
          });
        }
      } catch (err) {
        showError(err.message || "Could not add that file.");
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

  async function handleIncoming(row) {
    if (!row || !state.thread || row.thread_id !== state.thread.id) return;
    upsertMessage(row);
    renderMessages();
    hydrateOne(row).then(function (full) {
      upsertMessage(full);
      renderMessages();
    });
    if (!isMine(row)) markOpenThreadRead();
    else refreshUnread();
  }

  async function openThread(userId, fromInbox) {
    showError("");
    state.loading = true;
    state.editingId = "";
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
          handleIncoming(row);
        },
        onUpdate: function (row) {
          if (!row || (state.thread && row.thread_id !== state.thread.id)) return;
          upsertMessage(row);
          renderMessages();
        },
        onDelete: function (row) {
          if (!row || !row.id) return;
          removeMessageLocal(row.id);
          renderMessages();
          refreshUnread();
          loadInbox({ silent: true });
        },
        onAttachment: function (payload) {
          const row = (payload && (payload.new || payload.old)) || {};
          if (!row.message_id) return;
          const message = state.messages.find(function (item) { return item.id === row.message_id; });
          if (!message) return;
          hydrateOne(message).then(function (full) {
            upsertMessage(full);
            renderMessages();
          });
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
    try {
      let saved;
      if (pending.length) {
        saved = await chat.sendWithAttachments(state.thread.id, text, pending, function (index, ratio) {
          state.uploadProgress[index] = ratio;
          renderPreviews();
        });
      } else {
        saved = await chat.sendMessage(state.thread.id, text);
      }
      state.pending = [];
      state.uploadProgress = {};
      renderPreviews();
      upsertMessage(saved);
      renderMessages();
      await loadInbox({ silent: true });
    } catch (err) {
      input.value = text;
      state.pending = pending;
      state.uploadProgress = {};
      renderPreviews();
      showError(err.message || "Message was not sent.");
    }
    state.sending = false;
    sendBtn.disabled = false;
    setComposerEnabled(Boolean(state.thread));
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
        if (items[i].kind === "file") {
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
  document.addEventListener("click", function () {
    closeMenus();
  });

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") markOpenThreadRead();
  });

  function syncOpenMessages() {
    if (!state.thread) return;
    chat.listMessages(state.thread.id).then(function (rows) {
      let changed = false;
      const before = state.messages.length;
      const serverIds = {};
      (rows || []).forEach(function (row) {
        serverIds[row.id] = true;
        const prev = state.messages.find(function (item) { return item.id === row.id; });
        if (!prev || prev.read_at !== row.read_at || prev.message !== row.message || prev.image_url !== row.image_url || prev.edited_at !== row.edited_at) {
          changed = true;
        }
        upsertMessage(row);
      });
      const oldest = rows && rows[0] ? rows[0].created_at : "";
      const kept = state.messages.filter(function (item) {
        if (!oldest || String(item.created_at || "") >= String(oldest)) {
          return Boolean(serverIds[item.id]);
        }
        return true;
      });
      if (kept.length !== state.messages.length) {
        state.messages = kept;
        changed = true;
      }
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
          if (payload && payload.id && state.thread && payload.thread_id === state.thread.id) {
            upsertMessage(payload);
            renderMessages();
          }
          refreshUnread();
          loadInbox({ silent: true });
        },
        onDelete: function () {
          refreshUnread();
          loadInbox({ silent: true });
          if (state.thread) syncOpenMessages();
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
