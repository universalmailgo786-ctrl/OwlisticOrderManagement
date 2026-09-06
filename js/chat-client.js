(function (global) {
  const config = global.OwlisticChatConfig || {};
  const PAGE_SIZE = Number(config.pageSize || 40);
  let client = null;
  let starting = null;
  const channels = {};

  function supabaseLib() {
    return global.supabase;
  }

  function auth() {
    return global.OwlisticAuth;
  }

  function sessionUser() {
    const session = auth() && auth().getSession();
    if (!session) return null;
    return {
      username: String(session.username || "").trim(),
      role: session.role === "superadmin" ? "superadmin" : "user",
      displayName: session.personName || session.name || session.username || "",
      account: session.account || "",
      isSuperAdmin: session.role === "superadmin"
    };
  }

  function isSuperAdminSender(senderId) {
    return /^(superadmin|admin)$/i.test(String(senderId || "").trim());
  }

  function saveTokens(tokens) {
    const current = auth() && auth().getSession();
    if (!current || !tokens) return;
    current.chatAccessToken = tokens.access_token || "";
    current.chatRefreshToken = tokens.refresh_token || "";
    current.chatExpiresAt = tokens.expires_at || 0;
    auth().setSession(current);
  }

  function clearTokens() {
    const current = auth() && auth().getSession();
    if (!current) return;
    delete current.chatAccessToken;
    delete current.chatRefreshToken;
    delete current.chatExpiresAt;
    auth().setSession(current);
  }

  async function requestSession(username, password) {
    const response = await fetch(config.sessionUrl || "/api/chat/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username, password: password })
    });
    const data = await response.json().catch(function () { return null; });
    if (!data || !data.ok) {
      return { ok: false, error: (data && data.error) || "Could not start Messages." };
    }
    saveTokens(data);
    return data;
  }

  async function createClientFromSession() {
    const lib = supabaseLib();
    if (!lib || typeof lib.createClient !== "function") {
      throw new Error("Chat library failed to load.");
    }
    const current = auth() && auth().getSession();
    if (!current || !current.chatAccessToken) {
      throw new Error("Messages is not connected for this sign-in. Sign out and sign in again.");
    }
    const next = lib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    });
    const result = await next.auth.setSession({
      access_token: current.chatAccessToken,
      refresh_token: current.chatRefreshToken || current.chatAccessToken
    });
    if (result.error) {
      throw new Error(result.error.message || "Chat session expired. Sign in again.");
    }
    if (result.data && result.data.session) {
      saveTokens(result.data.session);
    }
    return next;
  }

  async function ensureClient() {
    if (client) return client;
    if (starting) return starting;
    starting = createClientFromSession().then(function (created) {
      client = created;
      starting = null;
      return client;
    }).catch(function (err) {
      starting = null;
      throw err;
    });
    return starting;
  }

  async function signOut() {
    try {
      if (client) {
        const names = Object.keys(channels);
        for (let i = 0; i < names.length; i++) {
          await client.removeChannel(channels[names[i]]);
          delete channels[names[i]];
        }
        await client.auth.signOut();
      }
    } catch (err) {}
    client = null;
    clearTokens();
  }

  async function getOrCreateThread(userId) {
    const db = await ensureClient();
    const me = sessionUser();
    const wanted = String(userId || (me && !me.isSuperAdmin ? me.username : "")).trim();
    if (!wanted) throw new Error("No chat user selected.");
    if (/^(superadmin|admin)$/i.test(wanted)) throw new Error("Cannot open a chat as SuperAdmin.");
    const existing = await db.from("chat_threads").select("*").eq("user_id", wanted).maybeSingle();
    if (existing.error && existing.error.code !== "PGRST116") throw existing.error;
    if (existing.data) return existing.data;
    const created = await db.from("chat_threads").insert({ user_id: wanted }).select("*").single();
    if (created.error && (created.error.code === "23505" || /duplicate/i.test(created.error.message || ""))) {
      const retry = await db.from("chat_threads").select("*").eq("user_id", wanted).single();
      if (retry.error) throw retry.error;
      return retry.data;
    }
    if (created.error) throw created.error;
    return created.data;
  }

  async function listThreads() {
    const db = await ensureClient();
    const result = await db.from("chat_threads").select("*").order("updated_at", { ascending: false });
    if (result.error) throw result.error;
    return result.data || [];
  }

  async function unreadRows() {
    const db = await ensureClient();
    const result = await db.from("chat_messages").select("id, thread_id, sender_id, read_at").is("read_at", null);
    if (result.error) throw result.error;
    return result.data || [];
  }

  function unreadFor(rows, me) {
    const mine = String((me && me.username) || "").toLowerCase();
    const admin = Boolean(me && me.isSuperAdmin);
    const byThread = {};
    let total = 0;
    (rows || []).forEach(function (row) {
      const sender = String(row.sender_id || "").toLowerCase();
      const incoming = admin ? !isSuperAdminSender(sender) : sender !== mine;
      if (!incoming) return;
      byThread[row.thread_id] = (byThread[row.thread_id] || 0) + 1;
      total += 1;
    });
    return { total: total, byThread: byThread };
  }

  async function listMessages(threadId, before) {
    const db = await ensureClient();
    let query = db.from("chat_messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(PAGE_SIZE);
    if (before && before.created_at) {
      query = query.lt("created_at", before.created_at);
    }
    const result = await query;
    if (result.error) throw result.error;
    return (result.data || []).slice().reverse();
  }

  async function sendMessage(threadId, text) {
    const db = await ensureClient();
    const me = sessionUser();
    const message = String(text || "").trim();
    if (!message) throw new Error("Type a message first.");
    const senderId = me && me.isSuperAdmin ? (config.superAdminUsername || "SuperAdmin") : me.username;
    const result = await db.from("chat_messages").insert({
      thread_id: threadId,
      sender_id: senderId,
      message: message
    }).select("*").single();
    if (result.error) throw result.error;
    return result.data;
  }

  async function markRead(threadId) {
    const db = await ensureClient();
    const me = sessionUser();
    if (!me || !threadId) return;
    let query = db.from("chat_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("thread_id", threadId)
      .is("read_at", null);
    if (me.isSuperAdmin) {
      query = query.filter("sender_id", "not.in", '("SuperAdmin","superadmin","admin")');
    } else {
      query = query.neq("sender_id", me.username);
    }
    const result = await query;
    if (result.error) throw result.error;
  }

  async function replaceChannel(name, builder) {
    const db = await ensureClient();
    if (channels[name]) {
      await db.removeChannel(channels[name]);
      delete channels[name];
    }
    const next = builder(db.channel(name));
    channels[name] = next;
    return next;
  }

  async function subscribeThread(threadId, handlers) {
    return replaceChannel("chat-thread", function (named) {
      return named
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "chat_messages",
        filter: "thread_id=eq." + threadId
      }, function (payload) {
        if (handlers && handlers.onInsert) handlers.onInsert(payload.new);
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "chat_messages",
        filter: "thread_id=eq." + threadId
      }, function (payload) {
        if (handlers && handlers.onUpdate) handlers.onUpdate(payload.new);
      })
      .subscribe(function (status) {
        if (handlers && handlers.onStatus) handlers.onStatus(status);
      });
    });
  }

  async function subscribeInbox(handlers, channelName) {
    return replaceChannel(channelName || "chat-inbox", function (named) {
      return named
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_threads" }, function (payload) {
        if (handlers && handlers.onThread) handlers.onThread(payload);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, function (payload) {
        if (handlers && handlers.onInsert) handlers.onInsert(payload.new);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "chat_messages" }, function (payload) {
        if (handlers && handlers.onUpdate) handlers.onUpdate(payload.new);
      })
      .subscribe(function (status) {
        if (handlers && handlers.onStatus) handlers.onStatus(status);
      });
    });
  }

  async function unreadSummary() {
    const me = sessionUser();
    const rows = await unreadRows();
    return unreadFor(rows, me);
  }

  global.OwlisticChat = {
    sessionUser: sessionUser,
    isSuperAdminSender: isSuperAdminSender,
    requestSession: requestSession,
    ensureClient: ensureClient,
    signOut: signOut,
    getOrCreateThread: getOrCreateThread,
    listThreads: listThreads,
    listMessages: listMessages,
    sendMessage: sendMessage,
    markRead: markRead,
    subscribeThread: subscribeThread,
    subscribeInbox: subscribeInbox,
    unreadSummary: unreadSummary,
    unreadFor: unreadFor,
    pageSize: PAGE_SIZE
  };
})(window);
