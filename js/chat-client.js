(function (global) {
  const config = global.OwlisticChatConfig || {};
  const PAGE_SIZE = Number(config.pageSize || 40);
  const MAX_BYTES = Number(config.maxAttachmentBytes || 10 * 1024 * 1024);
  const ALLOWED_EXT = {
    jpg: "image", jpeg: "image", png: "image", webp: "image", gif: "image", svg: "image",
    pdf: "file", doc: "file", docx: "file", xls: "file", xlsx: "file", csv: "file", txt: "file", zip: "file"
  };
  let client = null;
  let starting = null;
  const channels = {};
  const signedCache = {};

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

  function newId() {
    if (global.crypto && typeof global.crypto.randomUUID === "function") {
      return global.crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      const r = Math.random() * 16 | 0;
      const v = c === "x" ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function fileExt(name) {
    const parts = String(name || "").toLowerCase().split(".");
    return parts.length > 1 ? parts.pop().replace(/[^a-z0-9]/g, "") : "";
  }

  function classifyClientFile(file) {
    if (!file) return { ok: false, error: "No file selected." };
    const ext = fileExt(file.name);
    if (!ext || !ALLOWED_EXT[ext]) {
      return { ok: false, error: "That file type is not allowed." };
    }
    if (file.size > MAX_BYTES) {
      return { ok: false, error: "That file is too large. Maximum size is 10 MB." };
    }
    return { ok: true, type: ALLOWED_EXT[ext], ext: ext };
  }

  function formatBytes(n) {
    const size = Number(n || 0);
    if (size < 1024) return size + " B";
    if (size < 1048576) return (size / 1024).toFixed(size < 10 * 1024 ? 1 : 0) + " KB";
    return (size / 1048576).toFixed(size < 10 * 1048576 ? 1 : 0) + " MB";
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

  function fileToDataUrl(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result || "")); };
      reader.onerror = function () { reject(new Error("Could not read that file.")); };
      reader.readAsDataURL(file);
    });
  }

  function compressImage(file) {
    return new Promise(function (resolve, reject) {
      if (!file) return reject(new Error("No image selected."));
      if (!/^image\//i.test(file.type || "") || /svg/i.test(file.type || "")) {
        return fileToDataUrl(file).then(function (dataUrl) {
          resolve({
            contentType: file.type || "image/jpeg",
            filename: file.name || "photo",
            data: dataUrl,
            preview: dataUrl,
            size: file.size
          });
        }).catch(reject);
      }
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
          preview: dataUrl,
          size: Math.round((dataUrl.length - dataUrl.indexOf(",") - 1) * 0.75)
        });
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        fileToDataUrl(file).then(function (dataUrl) {
          resolve({
            contentType: file.type || "image/jpeg",
            filename: file.name || "photo",
            data: dataUrl,
            preview: dataUrl,
            size: file.size
          });
        }).catch(reject);
      };
      img.src = url;
    });
  }

  function postJson(url, body, onProgress) {
    const token = currentAccessToken();
    if (!token) return Promise.reject(new Error("Messages is not connected for this sign-in. Sign out and sign in again."));
    return new Promise(function (resolve, reject) {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.setRequestHeader("Authorization", "Bearer " + token);
      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = function (event) {
          if (event.lengthComputable) onProgress(event.loaded / event.total);
        };
      }
      xhr.onload = function () {
        let data = null;
        try { data = JSON.parse(xhr.responseText || "null"); } catch (err) {}
        if (!data) return reject(new Error("Could not complete that request."));
        resolve(data);
      };
      xhr.onerror = function () { reject(new Error("Could not complete that request.")); };
      xhr.send(JSON.stringify(body));
    });
  }

  async function signUrls(paths) {
    const needed = (paths || []).filter(function (path) {
      if (!path) return false;
      const cached = signedCache[path];
      return !cached || cached.expires < Date.now() + 60 * 1000;
    });
    if (needed.length) {
      const data = await postJson(config.signedUrl || "/api/chat/signed-url", { paths: needed });
      if (!data || !data.ok) throw new Error((data && data.error) || "Could not open that file.");
      const urls = data.urls || {};
      Object.keys(urls).forEach(function (path) {
        signedCache[path] = { url: urls[path], expires: Date.now() + 50 * 60 * 1000 };
      });
    }
    const out = {};
    (paths || []).forEach(function (path) {
      if (signedCache[path]) out[path] = signedCache[path].url;
    });
    return out;
  }

  function triggerSave(url, filename) {
    const name = filename || "download";
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error("download");
      return res.blob();
    }).then(function (blob) {
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 1500);
    }).catch(function () {
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
  }

  async function downloadAttachment(att) {
    if (!att) throw new Error("No file to download.");
    const name = String(att.file_name || att.filename || "download").trim() || "download";
    const path = String(att.storage_path || "").trim();
    if (path) {
      const data = await postJson(config.signedUrl || "/api/chat/signed-url", {
        paths: [path],
        download: true,
        names: (function () {
          const map = {};
          map[path] = name;
          return map;
        })()
      });
      if (!data || !data.ok) throw new Error((data && data.error) || "Could not download that file.");
      const url = data.urls && data.urls[path];
      if (url) {
        await triggerSave(url, name);
        return;
      }
    }
    const src = att.signedUrl || att.image_url || att.url || "";
    if (!src) throw new Error("That file is not available right now.");
    await triggerSave(src, name);
  }

  async function hydrateAttachments(messages) {
    const rows = messages || [];
    if (!rows.length) return rows;
    const db = await ensureClient();
    const ids = rows.map(function (row) { return row.id; });
    const result = await db.from("chat_attachments").select("*").in("message_id", ids);
    if (result.error) {
      rows.forEach(function (row) {
        row.attachments = row.attachments || [];
      });
      return rows;
    }
    const byMessage = {};
    (result.data || []).forEach(function (att) {
      byMessage[att.message_id] = byMessage[att.message_id] || [];
      byMessage[att.message_id].push(att);
    });
    const paths = [];
    (result.data || []).forEach(function (att) {
      if (att.storage_path) paths.push(att.storage_path);
    });
    let urls = {};
    try {
      urls = await signUrls(paths);
    } catch (err) {
      urls = {};
    }
    rows.forEach(function (row) {
      row.attachments = (byMessage[row.id] || []).map(function (att) {
        att.signedUrl = urls[att.storage_path] || att.signedUrl || "";
        return att;
      });
    });
    return rows;
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
    const rows = (result.data || []).slice().reverse();
    await hydrateAttachments(rows);
    return rows;
  }

  async function loadAttachments(messageId) {
    const db = await ensureClient();
    const result = await db.from("chat_attachments").select("*").eq("message_id", messageId);
    if (result.error) throw result.error;
    const rows = result.data || [];
    const urls = await signUrls(rows.map(function (row) { return row.storage_path; }));
    rows.forEach(function (row) {
      row.signedUrl = urls[row.storage_path] || "";
    });
    return rows;
  }

  function placeholderFor(text, hasImage, hasFile) {
    const message = String(text || "").trim();
    if (message) return message;
    if (hasImage) return "Photo";
    if (hasFile) return "File";
    return "";
  }

  async function sendMessage(threadId, text, options) {
    const db = await ensureClient();
    const me = sessionUser();
    const opts = options || {};
    const files = opts.files || [];
    const messageId = opts.id || newId();
    const hasImage = files.some(function (file) { return file.attachmentType === "image"; });
    const hasFile = files.length > 0;
    const message = placeholderFor(text, hasImage, hasFile);
    if (!message && !hasFile) throw new Error("Type a message or attach a file.");
    const senderId = me && me.isSuperAdmin ? (config.superAdminUsername || "SuperAdmin") : me.username;
    const row = {
      id: messageId,
      thread_id: threadId,
      sender_id: senderId,
      message: message
    };
    if (hasFile) row.has_files = true;
    const inserted = await db.from("chat_messages").insert(row).select("*").single();
    if (inserted.error) throw inserted.error;
    if (files.length) {
      const payload = files.map(function (file) {
        return {
          message_id: messageId,
          storage_path: file.path,
          file_name: file.fileName || file.filename || "file",
          mime_type: file.mimeType || file.contentType || "",
          size_bytes: file.sizeBytes || file.size || 0,
          attachment_type: file.attachmentType || "file"
        };
      });
      const atts = await db.from("chat_attachments").insert(payload).select("*");
      if (atts.error) {
        await db.from("chat_messages").delete().eq("id", messageId);
        throw atts.error;
      }
      inserted.data.attachments = atts.data || [];
      const urls = await signUrls((atts.data || []).map(function (att) { return att.storage_path; }));
      inserted.data.attachments.forEach(function (att) {
        att.signedUrl = urls[att.storage_path] || fileSignedUrl(files, att.storage_path);
      });
    } else {
      inserted.data.attachments = [];
    }
    return inserted.data;
  }

  function fileSignedUrl(files, path) {
    const match = (files || []).find(function (file) { return file.path === path; });
    return match && match.signedUrl ? match.signedUrl : "";
  }

  async function editMessage(id, text) {
    const db = await ensureClient();
    const message = String(text || "").trim();
    if (!message) throw new Error("Message cannot be empty.");
    const result = await db.from("chat_messages").update({ message: message }).eq("id", id).select("*").single();
    if (result.error) throw result.error;
    return result.data;
  }

  async function deleteMessage(id) {
    const data = await postJson(config.deleteUrl || "/api/chat/delete-message", { id: id });
    if (!data || !data.ok) throw new Error((data && data.error) || "Could not delete that message.");
    return data;
  }

  async function purgeFiles(paths) {
    if (!paths || !paths.length) return { ok: true };
    try {
      await postJson(config.purgeUrl || "/api/chat/purge-files", { paths: paths });
    } catch (err) {}
  }

  async function uploadFile(file, meta, onProgress) {
    const token = currentAccessToken();
    if (!token) throw new Error("Messages is not connected for this sign-in. Sign out and sign in again.");
    const classified = classifyClientFile(file);
    if (!classified.ok) throw new Error(classified.error);
    let payload;
    if (classified.type === "image" && file.type && !/svg/i.test(file.type)) {
      const compressed = await compressImage(file);
      payload = {
        contentType: compressed.contentType,
        filename: compressed.filename,
        data: compressed.data,
        threadId: meta.threadId,
        messageId: meta.messageId
      };
    } else {
      payload = {
        contentType: file.type || "application/octet-stream",
        filename: file.name || "file",
        data: await fileToDataUrl(file),
        threadId: meta.threadId,
        messageId: meta.messageId
      };
    }
    const data = await postJson(config.uploadUrl || "/api/chat/upload", payload, onProgress);
    if (!data || !data.ok) {
      throw new Error((data && data.error) || "Could not upload the file.");
    }
    if (data.path && data.signedUrl) {
      signedCache[data.path] = { url: data.signedUrl, expires: Date.now() + 50 * 60 * 1000 };
    }
    return data;
  }

  async function sendWithAttachments(threadId, text, pending, onProgress) {
    const files = pending || [];
    const messageId = newId();
    const uploaded = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const item = files[i];
        if (onProgress) onProgress(i, 0);
        const saved = await uploadFile(item.file, { threadId: threadId, messageId: messageId }, function (ratio) {
          if (onProgress) onProgress(i, ratio);
        });
        uploaded.push(saved);
        if (onProgress) onProgress(i, 1);
      }
      return await sendMessage(threadId, text, { id: messageId, files: uploaded });
    } catch (err) {
      await purgeFiles(uploaded.map(function (file) { return file.path; }));
      throw err;
    }
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
      query = query.not("sender_id", "ilike", "superadmin").not("sender_id", "ilike", "admin");
    } else {
      query = query.not("sender_id", "ilike", me.username);
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
      .on("postgres_changes", {
        event: "DELETE",
        schema: "public",
        table: "chat_messages",
        filter: "thread_id=eq." + threadId
      }, function (payload) {
        if (handlers && handlers.onDelete) handlers.onDelete(payload.old || payload.new);
      })
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "chat_attachments"
      }, function (payload) {
        if (handlers && handlers.onAttachment) handlers.onAttachment(payload);
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
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "chat_messages" }, function (payload) {
        if (handlers && handlers.onDelete) handlers.onDelete(payload.old || payload.new);
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
    sendWithAttachments: sendWithAttachments,
    editMessage: editMessage,
    deleteMessage: deleteMessage,
    uploadFile: uploadFile,
    uploadImage: async function (file, meta) {
      return uploadFile(file, meta || {});
    },
    compressImage: compressImage,
    classifyClientFile: classifyClientFile,
    formatBytes: formatBytes,
    loadAttachments: loadAttachments,
    downloadAttachment: downloadAttachment,
    markRead: markRead,
    subscribeThread: subscribeThread,
    subscribeInbox: subscribeInbox,
    unreadSummary: unreadSummary,
    unreadFor: unreadFor,
    pageSize: PAGE_SIZE,
    maxBytes: MAX_BYTES,
    maxPending: Number(config.maxPending || 8)
  };
})(window);
