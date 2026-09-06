(function (global) {
  const config = global.OwlisticChatConfig || {};
  let timer = null;
  let badge = null;
  let link = null;
  let started = false;
  let lastTotal = null;
  let lastStamp = "";
  let originalTitle = "";
  let dismissedStamp = "";
  let toastUserId = "";

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

  function renderCount(total) {
    if (!link) ensureLink();
    if (!badge) badge = document.querySelector("[data-chat-badge]");
    const n = Number(total || 0);
    const label = countLabel(n);
    if (badge) {
      badge.textContent = label;
      badge.classList.toggle("is-on", n > 0);
      badge.setAttribute("aria-hidden", n > 0 ? "false" : "true");
      if (n > 0) badge.removeAttribute("hidden");
      else badge.setAttribute("hidden", "");
    }
    if (link) {
      link.setAttribute("data-unread", String(n));
      link.setAttribute("aria-label", n > 0 ? "Messages, " + label + " unread" : "Messages");
      link.classList.toggle("has-unread", n > 0);
    }
    if (!originalTitle) originalTitle = document.title.replace(/^\(\d+\+?\)\s+/, "");
    document.title = n > 0 ? "(" + label + ") " + originalTitle : originalTitle;
    updateToastCount(n);
    if (n < 1) hideToast();
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
      const summary = await api.unreadSummary();
      renderCount(summary.total);
      lastTotal = summary.total;
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

  async function listen() {
    const api = chat();
    const session = auth() && auth().getSession();
    if (!api || !session || !session.chatAccessToken) return;
    try {
      await api.subscribeInbox({
        onInsert: function () { refresh(); },
        onUpdate: function () { refresh(); },
        onDelete: function () { refresh(); },
        onThread: function () { refresh(); }
      }, "chat-nav-unread");
    } catch (err) {}
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
  }

  global.OwlisticChatNav = {
    mount: mount,
    refresh: refresh,
    renderCount: renderCount,
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
