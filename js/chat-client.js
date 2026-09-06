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

  function currentAccessToken() {
    const current = auth() && auth().getSession();
    return current && current.chatAccessToken ? current.chatAccessToken : "";
  }

  async function createClientFromSession() {
    const lib = supabaseLib();
    if (!lib || typeof lib.createClient !== "function") {
      throw new Error("Chat library failed to load.");
    }
    const accessToken = currentAccessToken();
    if (!accessToken) {
      throw new Error("Messages is not connected for this sign-in. Sign out and sign in again.");
    }
    // JWT mode mints a signed token without creating auth.users. Do not call
    // setSession — GoTrue would look up the `sub` claim and fail.
    const next = lib.createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      },
      global: {
        headers: {
          Authorization: "Bearer " + accessToken
        }
      },
      accessToken: function () {
        return Promise.resolve(currentAccessToken() || accessToken);
      }
    });
    if (next.realtime && typeof next.realtime.setAuth === "function") {
      next.realtime.setAuth(accessToken);
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
    const listed = await db.from("chat_threads").select("*");
    if (listed.error) throw listed.error;
    const existing = (listed.data || []).find(function (row) {
      return String(row.user_id || "").toLowerCase() === wanted.toLowerCase();
    });
    if (existing) return existing;
    const created = await db.from("chat_threads").insert({ user_id: wanted }).select("*").single();
    if (created.error && (created.error.code === "23505" || /duplicate/i.test(created.error.message || ""))) {
      const retry = await db.from("chat_threads").select("*");
      if (retry.error) throw retry.error;
      const found = (retry.data || []).find(function (row) {
        return String(row.user_id || "").toLowerCase() === wanted.toLowerCase();
      });
      if (!found) throw created.error;
      return found;
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

  async function sendMessage(threadId, text, imageUrl) {
    const db = await ensureClient();
    const me = sessionUser();
    const message = String(text || "").trim();
    const image = String(imageUrl || "").trim();
    if (!message && !image) throw new Error("Type a message or add an image.");
    const senderId = me && me.isSuperAdmin ? (config.superAdminUsername || "SuperAdmin") : me.username;
    const row = {
      thread_id: threadId,
      sender_id: senderId,
      message: message || (image ? "Photo" : "")
    };
    if (image) row.image_url = image;
    const result = await db.from("chat_messages").insert(row).select("*").single();
    if (result.error) throw result.error;
    return result.data;
  }

  function fileToDataUrl(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || "")); };
      reader.onerror = function () { reject(new Error("Could not read that image.")); };
      reader.readAsDataURL(file);
    });
  }

  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      if (!file) return reject(new Error("No image selected."));
      if (!/^image\//i.test(file.type || "")) return reject(new Error("That file is not an image."));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        const max = 1600;
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;
        if (width > max || height > max) {
          const scale = Math.min(max / width, max / height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, width);
        canvas.height = Math.max(1, height);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const quality = file.size > 1200000 ? 0.72 : 0.82;
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve({
          contentType: "image/jpeg",
          filename: String(file.name || "photo").replace(/\.[^.]+$/, "") + ".jpg",
          data: dataUrl,
          preview: dataUrl
        });
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        fileToDataUrl(file).then(function (dataUrl) {
          resolve({
            contentType: file.type || "image/jpeg",
            filename: file.name || "photo",
            data: dataUrl,
            preview: dataUrl
          });
        }).catch(reject);
      };
      img.src = url;
    });
  }

  async function uploadImage(file) {
    const token = currentAccessToken();
    if (!token) throw new Error("Messages is not connected for this sign-in. Sign out and sign in again.");
    const compressed = await compressImage(file);
    const response = await fetch(config.uploadUrl || "/api/chat/upload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify({
        contentType: compressed.contentType,
        filename: compressed.filename,
        data: compressed.data
      })
    });
    const data = await response.json().catch(function () { return null; });
    if (!data || !data.ok) {
      throw new Error((data && data.error) || "Could not upload the image.");
    }
    return { url: data.url, preview: compressed.preview };
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
    uploadImage: uploadImage,
    compressImage: compressImage,
    markRead: markRead,
    subscribeThread: subscribeThread,
    subscribeInbox: subscribeInbox,
    unreadSummary: unreadSummary,
    unreadFor: unreadFor,
    pageSize: PAGE_SIZE
  };
})(window);
