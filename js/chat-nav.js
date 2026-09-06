(function (global) {
  const config = global.OwlisticChatConfig || {};
  let timer = null;
  let badge = null;
  let link = null;
  let started = false;
  let lastTotal = null;
  let lastByThread = {};
  let lastStamp = "";
  let originalTitle = "";
  let dismissedStamp = "";
  let toastUserId = "";
  let refreshTimer = null;
  let listenAttempt = 0;
  let listenRetry = null;
  let skipNextToast = false;
  let fetchGen = 0;
  const seenIncoming = {};
  const seenRead = {};
  let broadcast = null;
  try {
    broadcast = new BroadcastChannel("owlistic-unread");
  } catch (err) {
    broadcast = null;
  }

  function auth() {
    return global.OwlisticAuth;
  }

  function chat() {
    return global.OwlisticChat;
  }

  function currentPage() {
    return (window.location.pathname.split("/").pop() || "index.html").split("?")[0];
  }

  function messagesUrl(userId) {
    const id = String(userId || "").trim();
    return id ? "messages.html?user=" + encodeURIComponent(id) : "messages.html";
  }

  function countLabel(total) {
    const n = Number(total || 0);
    if (n < 1) return "0";
    return n > 99 ? "99+" : String(n);
  }

  function ensureLink() {
    const nav = document.querySelector(".app-nav-links");
    if (!nav) return null;
    link = nav.querySelector("[data-chat-nav]");
    if (link) {
      badge = link.querySelector("[data-chat-badge]");
      return link;
    }
    link = document.createElement("a");
    link.className = "app-nav-link chat-nav-link";
    link.href = "messages.html";
    link.setAttribute("data-chat-nav", "1");
    link.innerHTML = '<span class="chat-nav-label">Messages</span><span class="chat-unread-badge" data-chat-badge hidden>0</span>';
    nav.appendChild(link);
    badge = link.querySelector("[data-chat-badge]");
    return link;
  }

  function setActive() {
    if (!link) return;
    if (currentPage() === "messages.html") link.classList.add("is-active");
    else link.classList.remove("is-active");
  }

  function viewingThread(threadId) {
    if (!threadId) return false;
    if (currentPage() !== "messages.html") return false;
    if (document.visibilityState !== "visible") return false;
    if (typeof document.hasFocus === "function" && !document.hasFocus()) return false;
    return global.OwlisticChatViewingThreadId === threadId;
  }

  function publishCount(options) {
    const opts = options || {};
    const detail = {
      total: Number(lastTotal || 0),
      byThread: lastByThread || {}
    };
    try {
      document.dispatchEvent(new CustomEvent("owlistic-unread", { detail: detail }));
    } catch (err) {}
    if (!opts.fromBroadcast && broadcast) {
      try {
        broadcast.postMessage({ type: "unread", total: detail.total, byThread: detail.byThread });
      } catch (err) {}
    }
  }

  function renderCount(total, options) {
    const opts = options || {};
    if (!link) ensureLink();
    if (!badge) badge = document.querySelector("[data-chat-badge]");
    const n = Math.max(0, Number(total || 0));
    lastTotal = n;
    const label = countLabel(n);
    document.querySelectorAll("[data-chat-badge]").forEach(function (el) {
      el.textContent = label;
      el.classList.toggle("is-on", n > 0);
      el.setAttribute("aria-hidden", n > 0 ? "false" : "true");
      if (n > 0) el.removeAttribute("hidden");
      else el.setAttribute("hidden", "");
    });
    if (link) {
      link.setAttribute("data-unread", String(n));
      link.setAttribute("aria-label", n > 0 ? "Messages, " + label + " unread" : "Messages");
      link.classList.toggle("has-unread", n > 0);
    }
    if (!originalTitle) originalTitle = document.title.replace(/^\(\d+\+?\)\s+/, "");
    document.title = n > 0 ? "(" + label + ") " + originalTitle : originalTitle;
    updateToastCount(n);
    if (n < 1) hideToast();
    if (!opts.silent) publishCount(opts);
  }

  function setSummary(summary, options) {
    const total = summary && typeof summary.total === "number" ? summary.total : 0;
    lastByThread = Object.assign({}, (summary && summary.byThread) || {});
    renderCount(total, options);
  }

  function refreshSoon() {
    if (refreshTimer) window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(function () {
      refreshTimer = null;
      refresh();
    }, 200);
  }

  function applyIncoming(row) {
    const api = chat();
    const me = api && api.sessionUser && api.sessionUser();
    if (!row || !row.id || row.read_at) return false;
    if (seenIncoming[row.id] || seenRead[row.id]) return false;
    const incoming = api && typeof api.isIncomingRow === "function"
      ? api.isIncomingRow(row, me)
      : Boolean(me && me.isSuperAdmin && api && !api.isSuperAdminSender(row.sender_id));
    if (!incoming) return false;
    if (viewingThread(row.thread_id)) return false;
    seenIncoming[row.id] = true;
    fetchGen += 1;
    if (lastTotal == null) lastTotal = 0;
    lastByThread = lastByThread || {};
    lastByThread[row.thread_id] = (lastByThread[row.thread_id] || 0) + 1;
    renderCount((lastTotal || 0) + 1);
    skipNextToast = currentPage() === "messages.html";
    refreshSoon();
    return true;
  }

  function applyRead(row) {
    if (!row || !row.id) return false;
    if (seenRead[row.id]) return false;
    const wasUnread = Boolean(seenIncoming[row.id] || (lastByThread && lastByThread[row.thread_id]));
    if (!row.read_at && wasUnread === false) return false;
    seenRead[row.id] = true;
    delete seenIncoming[row.id];
    fetchGen += 1;
    const tid = row.thread_id;
    if (tid && lastByThread[tid] > 0) {
      lastByThread[tid] -= 1;
      renderCount(Math.max(0, (lastTotal || 1) - 1));
    }
    refreshSoon();
    return true;
  }

  function applyThreadRead(threadId) {
    const tid = String(threadId || "");
    if (!tid) return false;
    const n = Number((lastByThread && lastByThread[tid]) || 0);
    if (n < 1) {
      refreshSoon();
      return false;
    }
    fetchGen += 1;
    lastByThread[tid] = 0;
    renderCount(Math.max(0, (lastTotal || n) - n));
    refreshSoon();
    return true;
  }

  function playPing() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.2);
    } catch (err) {}
  }

  function openMessages(userId) {
    const url = messagesUrl(userId);
    if (currentPage() === "messages.html" && typeof global.OwlisticChatOpenUser === "function") {
      global.OwlisticChatOpenUser(userId);
      return;
    }
    const opened = window.open(url, "owlistic-messages");
    if (!opened) window.location.href = url;
  }

  function desktopNotify(title, body, userId) {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    try {
      const note = new Notification(title || "New message", {
        body: body || "You have a new private message.",
        tag: "owlistic-chat",
        silent: false
      });
      note.onclick = function () {
        openMessages(userId);
        note.close();
      };
    } catch (err) {}
  }

  function askPermission() {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "default") return;
    try { Notification.requestPermission();     } catch (err) {}
  }

  function hideToast() {
    const el = document.getElementById("chat-toast");
    if (el) el.hidden = true;
  }

  function updateToastCount(total) {
    const el = document.getElementById("chat-toast");
    if (!el) return;
    const n = Number(total || 0);
    const count = el.querySelector("[data-chat-toast-count]");
    const qty = el.querySelector("[data-chat-toast-qty]");
    const label = countLabel(n);
    if (count) {
      count.hidden = n < 1;
      count.textContent = label;
    }
    if (qty) {
      qty.textContent = n === 1 ? "1 unread message" : label + " unread messages";
    }
  }

  function ensureToast() {
    let el = document.getElementById("chat-toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "chat-toast";
      el.className = "chat-toast";
      el.hidden = true;
      document.body.appendChild(el);
    }
    if (!el.getAttribute("data-chat-toast-bound")) {
      el.setAttribute("data-chat-toast-bound", "1");
      el.setAttribute("role", "status");
      el.innerHTML =
        '<span class="chat-toast-count" data-chat-toast-count hidden>0</span>' +
        "<strong>New message</strong>" +
        "<span data-chat-toast-body></span>" +
        '<em class="chat-toast-qty" data-chat-toast-qty></em>' +
        '<span class="chat-toast-hint">Click to open messages</span>' +
        '<button type="button" class="chat-toast-close" data-chat-toast-close aria-label="Dismiss">×</button>';
      el.addEventListener("click", function (event) {
        if (event.target && event.target.closest && event.target.closest("[data-chat-toast-close]")) {
          event.preventDefault();
          event.stopPropagation();
          dismissedStamp = lastStamp;
          hideToast();
          return;
        }
        hideToast();
        openMessages(toastUserId);
      });
    }
    return el;
  }

  function showToast(title, body, options) {
    const opts = options || {};
    const el = ensureToast();
    toastUserId = String(opts.userId || "");
    el.hidden = false;
    el.setAttribute("data-user-id", toastUserId);
    const strong = el.querySelector("strong");
    const span = el.querySelector("[data-chat-toast-body]") || el.querySelector("span:not(.chat-toast-count):not(.chat-toast-hint)");
    if (strong) strong.textContent = title || "New message";
    if (span) span.textContent = body || "";
    updateToastCount(opts.total != null ? opts.total : lastTotal);
  }

  function notifyNew(title, body, options) {
    const opts = options || {};
    if (opts.sound !== false) playPing();
    desktopNotify(title, body, opts.userId);
    showToast(title, body, opts);
  }

  async function refresh() {
    const api = chat();
    const session = auth() && auth().getSession();
    if (!api || !session || !session.chatAccessToken) {
      if (lastTotal == null) renderCount(0);
      return;
    }
    try {
      const gen = ++fetchGen;
      const summary = await api.unreadSummary();
      if (gen !== fetchGen) return;
      setSummary(summary);
      let threads = [];
      try {
        threads = typeof api.listThreads === "function" ? await api.listThreads() : [];
      } catch (err) {}
      const latest = (threads && threads[0]) || null;
      const unreadThread = (threads || []).find(function (thread) {
        return summary.byThread && summary.byThread[thread.id];
      }) || latest;
      const stamp = latest ? String(latest.id) + ":" + String(latest.updated_at || "") + ":" + String(latest.last_message || "") : "";
      const me = api.sessionUser && api.sessionUser();
      const fromMe = latest && me && (
        me.isSuperAdmin
          ? api.isSuperAdminSender(latest.last_sender_id)
          : String(latest.last_sender_id || "").toLowerCase() === String(me.username || "").toLowerCase()
      );
      const first = lastStamp === "";
      const who = me && me.isSuperAdmin
        ? ((unreadThread && unreadThread.user_id) || "A user")
        : (config.adminName || "Ashar");
      const title = "Message from " + who;
      const body = (unreadThread && unreadThread.last_message) || "You have unread messages.";
      const toastOpts = {
        userId: unreadThread && unreadThread.user_id,
        total: summary.total
      };
      if (currentPage() === "messages.html") {
        hideToast();
      } else if (skipNextToast) {
        skipNextToast = false;
        if (summary.total > 0 && stamp !== dismissedStamp) showToast(title, body, toastOpts);
      } else if (summary.total > 0 && stamp !== dismissedStamp) {
        if (!first && stamp && stamp !== lastStamp && !fromMe) {
          notifyNew(title, body, toastOpts);
        } else {
          showToast(title, body, toastOpts);
        }
      }
      lastStamp = stamp;
    } catch (err) {
      if (lastTotal == null) renderCount(0);
    }
  }

  function scheduleListenRetry(attempt) {
    if (listenRetry) return;
    listenRetry = window.setTimeout(function () {
      listenRetry = null;
      if (attempt === listenAttempt) listen();
    }, 1200);
  }

  async function listen() {
    const api = chat();
    const session = auth() && auth().getSession();
    if (!api || !session || !session.chatAccessToken) return;
    const attempt = ++listenAttempt;
    try {
      await api.subscribeInbox({
        onInsert: function (row) { applyIncoming(row); },
        onUpdate: function (row, oldRow) {
          const becameRead = row && row.read_at && !(oldRow && oldRow.read_at);
          if (becameRead) applyRead(row);
          else refreshSoon();
        },
        onDelete: function (row) {
          if (row && !row.read_at) applyRead(row);
          else refreshSoon();
        },
        onThread: function () { refreshSoon(); },
        onStatus: function (status) {
          if (attempt !== listenAttempt) return;
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            scheduleListenRetry(attempt);
          }
        }
      }, "chat-nav-unread");
    } catch (err) {
      scheduleListenRetry(attempt);
    }
  }

  function mount() {
    if (!auth() || !auth().getSession()) return;
    ensureLink();
    setActive();
    if (started) {
      refresh();
      return;
    }
    started = true;
    originalTitle = document.title.replace(/^\(\d+\+?\)\s+/, "");
    askPermission();
    refresh();
    listen();
    const pollMs = Number(config.pollMs || 4000);
    timer = window.setInterval(refresh, pollMs);
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) refresh();
    });
    window.addEventListener("focus", function () {
      refresh();
    });
    if (broadcast) {
      broadcast.onmessage = function (event) {
        const data = event && event.data;
        if (!data || data.type !== "unread" || typeof data.total !== "number") return;
        lastByThread = Object.assign({}, data.byThread || {});
        renderCount(data.total, { fromBroadcast: true });
      };
    }
  }

  global.OwlisticChatNav = {
    mount: mount,
    refresh: refresh,
    renderCount: renderCount,
    setSummary: setSummary,
    applyIncoming: applyIncoming,
    applyRead: applyRead,
    applyThreadRead: applyThreadRead,
    notifyNew: notifyNew,
    showToast: showToast,
    openMessages: openMessages
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      window.setTimeout(mount, 0);
    });
  } else {
    window.setTimeout(mount, 0);
  }
})(window);
