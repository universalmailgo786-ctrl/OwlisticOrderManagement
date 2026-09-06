(function (global) {
  const config = global.OwlisticChatConfig || {};
  let timer = null;
  let badge = null;
  let link = null;
  let started = false;
  let lastTotal = null;
  let lastStamp = "";
  let originalTitle = "";

  function auth() {
    return global.OwlisticAuth;
  }

  function chat() {
    return global.OwlisticChat;
  }

  function currentPage() {
    return (window.location.pathname.split("/").pop() || "index.html").split("?")[0];
  }

  function ensureLink() {
    const nav = document.querySelector(".app-nav-links");
    if (!nav) return null;
    link = nav.querySelector("[data-chat-nav]");
    if (link) return link;
    link = document.createElement("a");
    link.className = "app-nav-link chat-nav-link";
    link.href = "messages.html";
    link.setAttribute("data-chat-nav", "1");
    link.innerHTML = 'Messages <span class="chat-unread-badge" data-chat-badge hidden>0</span>';
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
    if (!badge) badge = document.querySelector("[data-chat-badge]");
    if (!badge) return;
    const n = Number(total || 0);
    badge.hidden = n < 1;
    badge.textContent = n > 99 ? "99+" : String(n);
    if (!originalTitle) originalTitle = document.title.replace(/^\(\d+\+?\)\s+/, "");
    document.title = n > 0 ? "(" + (n > 99 ? "99+" : n) + ") " + originalTitle : originalTitle;
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

  function desktopNotify(title, body) {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    if (!document.hidden && currentPage() === "messages.html") return;
    try {
      const note = new Notification(title || "New message", {
        body: body || "You have a new private message.",
        tag: "owlistic-chat",
        silent: false
      });
      note.onclick = function () {
        window.focus();
        if (currentPage() !== "messages.html") window.location.href = "messages.html";
        note.close();
      };
    } catch (err) {}
  }

  function askPermission() {
    if (!("Notification" in window)) return;
    if (Notification.permission !== "default") return;
    try { Notification.requestPermission(); } catch (err) {}
  }

  function notifyNew(title, body) {
    playPing();
    desktopNotify(title, body);
    if (typeof global.OwlisticChatNotify === "function") {
      global.OwlisticChatNotify(title, body);
    }
  }

  async function refresh() {
    const api = chat();
    const session = auth() && auth().getSession();
    if (!api || !session || !session.chatAccessToken) {
      renderCount(0);
      return;
    }
    try {
      const summary = await api.unreadSummary();
      const threads = typeof api.listThreads === "function" ? await api.listThreads() : [];
      const latest = (threads && threads[0]) || null;
      const stamp = latest ? String(latest.id) + ":" + String(latest.updated_at || "") + ":" + String(latest.last_message || "") : "";
      renderCount(summary.total);
      const first = lastTotal == null;
      const grew = !first && (summary.total > lastTotal || (stamp && stamp !== lastStamp && summary.total > 0));
      if (grew) {
        const me = api.sessionUser && api.sessionUser();
        const fromMe = latest && me && (
          me.isSuperAdmin
            ? api.isSuperAdminSender(latest.last_sender_id)
            : String(latest.last_sender_id || "").toLowerCase() === String(me.username || "").toLowerCase()
        );
        if (!fromMe) {
          const who = me && me.isSuperAdmin
            ? ((latest && latest.user_id) || "A user")
            : (config.adminName || "Ashar");
          notifyNew(who, (latest && latest.last_message) || "New message");
        }
      }
      lastTotal = summary.total;
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
  }

  global.OwlisticChatNav = {
    mount: mount,
    refresh: refresh,
    renderCount: renderCount,
    notifyNew: notifyNew
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      window.setTimeout(mount, 0);
    });
  } else {
    window.setTimeout(mount, 0);
  }
})(window);
