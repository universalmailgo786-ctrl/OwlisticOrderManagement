(function (global) {
  const config = global.OwlisticChatConfig || {};
  let timer = null;
  let badge = null;
  let link = null;
  let started = false;

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
      renderCount(summary.total);
    } catch (err) {
      renderCount(0);
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
    refresh();
    listen();
    timer = window.setInterval(refresh, 30000);
  }

  global.OwlisticChatNav = {
    mount: mount,
    refresh: refresh,
    renderCount: renderCount
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      window.setTimeout(mount, 0);
    });
  } else {
    window.setTimeout(mount, 0);
  }
})(window);
