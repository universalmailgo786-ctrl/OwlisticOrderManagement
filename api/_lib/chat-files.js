const crypto = require("crypto");

const BUCKET = "chat-attachments";
const LEGACY_BUCKET = "chat-images";
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_LABEL = "10 MB";

const BY_MIME = {
  "image/jpeg": { ext: "jpg", type: "image" },
  "image/jpg": { ext: "jpg", type: "image" },
  "image/png": { ext: "png", type: "image" },
  "image/webp": { ext: "webp", type: "image" },
  "image/gif": { ext: "gif", type: "image" },
  "image/svg+xml": { ext: "svg", type: "image" },
  "application/pdf": { ext: "pdf", type: "file" },
  "application/msword": { ext: "doc", type: "file" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { ext: "docx", type: "file" },
  "application/vnd.ms-excel": { ext: "xls", type: "file" },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { ext: "xlsx", type: "file" },
  "text/csv": { ext: "csv", type: "file" },
  "application/csv": { ext: "csv", type: "file" },
  "text/plain": { ext: "txt", type: "file" },
  "application/zip": { ext: "zip", type: "file" },
  "application/x-zip-compressed": { ext: "zip", type: "file" },
  "application/x-zip": { ext: "zip", type: "file" }
};

const BY_EXT = {
  jpg: "image",
  jpeg: "image",
  png: "image",
  webp: "image",
  gif: "image",
  svg: "image",
  pdf: "file",
  doc: "file",
  docx: "file",
  xls: "file",
  xlsx: "file",
  csv: "file",
  txt: "file",
  zip: "file"
};

const BLOCKED_EXT = {
  exe: true,
  bat: true,
  cmd: true,
  com: true,
  sh: true,
  msi: true,
  scr: true,
  js: true,
  vbs: true,
  ps1: true,
  apk: true,
  dmg: true,
  app: true,
  cpl: true,
  jar: true
};

function extOf(name, contentType) {
  const fromName = String(name || "").split(".").pop();
  const clean = String(fromName || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (clean && BLOCKED_EXT[clean]) return clean;
  if (clean && BY_EXT[clean]) return clean;
  const mime = BY_MIME[String(contentType || "").toLowerCase()];
  return mime ? mime.ext : "";
}

function classifyFile(filename, contentType) {
  const ext = extOf(filename, contentType);
  if (!ext || BLOCKED_EXT[ext]) {
    return { ok: false, error: "That file type is not allowed." };
  }
  const mimeKey = String(contentType || "").toLowerCase();
  const fromMime = BY_MIME[mimeKey];
  if (mimeKey && mimeKey !== "application/octet-stream" && !fromMime && !BY_EXT[ext]) {
    return { ok: false, error: "That file type is not allowed." };
  }
  const type = (fromMime && fromMime.type) || BY_EXT[ext] || "file";
  const storedMime = fromMime
    ? (mimeKey === "image/jpg" ? "image/jpeg" : mimeKey)
    : (ext === "pdf" ? "application/pdf"
      : ext === "zip" ? "application/zip"
      : ext === "txt" ? "text/plain"
      : ext === "csv" ? "text/csv"
      : "application/octet-stream");
  return {
    ok: true,
    ext: ext === "jpeg" ? "jpg" : ext,
    type: type,
    mime: storedMime
  };
}

function safeFileName(name) {
  const base = String(name || "file").split(/[/\\]/).pop() || "file";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return cleaned || "file";
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function storagePath(threadId, messageId, filename) {
  const unique = Date.now().toString(36) + "-" + crypto.randomBytes(8).toString("hex");
  return "chat/" + threadId + "/" + messageId + "/" + unique + "-" + safeFileName(filename);
}

function parseChatPath(storagePathValue) {
  const parts = String(storagePathValue || "").split("/").filter(Boolean);
  if (parts.length < 4 || parts[0] !== "chat") return null;
  if (!isUuid(parts[1]) || !isUuid(parts[2])) return null;
  return {
    threadId: parts[1],
    messageId: parts[2],
    fileName: parts.slice(3).join("/")
  };
}

function parsePublicImageUrl(url) {
  const raw = String(url || "");
  const marker = "/storage/v1/object/public/" + LEGACY_BUCKET + "/";
  const idx = raw.indexOf(marker);
  if (idx < 0) return null;
  const path = decodeURIComponent(raw.slice(idx + marker.length).split("?")[0]);
  if (!path) return null;
  return { bucket: LEGACY_BUCKET, path: path };
}

function isSuperAdminSender(senderId) {
  return /^(superadmin|admin)$/i.test(String(senderId || "").trim());
}

function canAccessThread(user, thread) {
  if (!user || !thread) return false;
  if (user.isSuperAdmin) return true;
  return String(thread.user_id || "").toLowerCase() === String(user.username || "").toLowerCase();
}

function canEditMessage(user, message, thread) {
  if (!canAccessThread(user, thread) || !message) return false;
  if (user.isSuperAdmin) return isSuperAdminSender(message.sender_id);
  return String(message.sender_id || "").toLowerCase() === String(user.username || "").toLowerCase();
}

function canDeleteMessage(user, message, thread) {
  if (!canAccessThread(user, thread) || !message) return false;
  const own = user.isSuperAdmin
    ? isSuperAdminSender(message.sender_id)
    : String(message.sender_id || "").toLowerCase() === String(user.username || "").toLowerCase();
  if (own) return true;
  return Boolean(user.isSuperAdmin && !isSuperAdminSender(message.sender_id));
}

async function ensurePrivateBucket(admin) {
  const existing = await admin.storage.getBucket(BUCKET);
  if (existing.data) {
    if (existing.data.public || Number(existing.data.file_size_limit || 0) !== MAX_BYTES) {
      await admin.storage.updateBucket(BUCKET, {
        public: false,
        fileSizeLimit: MAX_BYTES
      });
    }
    return;
  }
  const created = await admin.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: MAX_BYTES
  });
  if (created.error && !/already exists/i.test(created.error.message || "")) {
    throw created.error;
  }
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function deleteStorageObjects(admin, items) {
  const byBucket = {};
  (items || []).forEach(function (item) {
    if (!item || !item.path) return;
    const bucket = item.bucket || BUCKET;
    byBucket[bucket] = byBucket[bucket] || [];
    byBucket[bucket].push(item.path);
  });
  const result = { deleted: 0, missing: 0, errors: [] };
  const names = Object.keys(byBucket);
  for (let b = 0; b < names.length; b++) {
    const bucket = names[b];
    const paths = Array.from(new Set(byBucket[bucket]));
    const groups = chunk(paths, 50);
    for (let g = 0; g < groups.length; g++) {
      const removed = await admin.storage.from(bucket).remove(groups[g]);
      if (removed.error) {
        const msg = String(removed.error.message || "");
        if (/not found|does not exist/i.test(msg)) {
          result.missing += groups[g].length;
        } else {
          result.errors.push({ bucket: bucket, paths: groups[g], error: msg });
        }
      } else {
        result.deleted += groups[g].length;
      }
    }
  }
  return result;
}

module.exports = {
  BUCKET,
  LEGACY_BUCKET,
  MAX_BYTES,
  MAX_LABEL,
  BY_MIME,
  BY_EXT,
  classifyFile,
  safeFileName,
  isUuid,
  storagePath,
  parseChatPath,
  parsePublicImageUrl,
  isSuperAdminSender,
  canAccessThread,
  canEditMessage,
  canDeleteMessage,
  ensurePrivateBucket,
  deleteStorageObjects
};
