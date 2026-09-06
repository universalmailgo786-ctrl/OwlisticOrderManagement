const { adminClient } = require("./supabase-admin");
const {
  BUCKET,
  LEGACY_BUCKET,
  parsePublicImageUrl,
  parseChatPath,
  deleteStorageObjects
} = require("./chat-files");

const RETENTION_DAYS = 10;
const MESSAGE_BATCH = 200;
const ORPHAN_AGE_MS = 24 * 60 * 60 * 1000;

function cutoffIso(now) {
  const date = now ? new Date(now) : new Date();
  date.setTime(date.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  return date.toISOString();
}

function storageItemsForMessage(message, attachments) {
  const items = [];
  (attachments || []).forEach(function (row) {
    if (row && row.storage_path) {
      items.push({ bucket: BUCKET, path: row.storage_path });
    }
  });
  const legacy = parsePublicImageUrl(message && message.image_url);
  if (legacy) items.push(legacy);
  return items;
}

async function deleteMessageStorage(admin, message, attachments) {
  return deleteStorageObjects(admin, storageItemsForMessage(message, attachments));
}

async function cleanupExpiredMessages(admin, options) {
  const limit = Math.max(1, Math.min(500, Number((options && options.limit) || MESSAGE_BATCH)));
  const cutoff = (options && options.cutoff) || cutoffIso();
  const listed = await admin
    .from("chat_messages")
    .select("id, thread_id, image_url, created_at")
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (listed.error) throw listed.error;
  const messages = listed.data || [];
  if (!messages.length) {
    return { scanned: 0, deletedMessages: 0, files: { deleted: 0, missing: 0, errors: [] } };
  }

  const ids = messages.map(function (row) { return row.id; });
  const atts = await admin.from("chat_attachments").select("message_id, storage_path").in("message_id", ids);
  if (atts.error) throw atts.error;

  const byMessage = {};
  (atts.data || []).forEach(function (row) {
    byMessage[row.message_id] = byMessage[row.message_id] || [];
    byMessage[row.message_id].push(row);
  });

  const items = [];
  messages.forEach(function (message) {
    storageItemsForMessage(message, byMessage[message.id] || []).forEach(function (item) {
      items.push(item);
    });
  });

  const files = await deleteStorageObjects(admin, items);
  const failedPaths = {};
  (files.errors || []).forEach(function (err) {
    (err.paths || []).forEach(function (objectPath) {
      failedPaths[objectPath] = true;
    });
  });
  const deletable = messages.filter(function (message) {
    return storageItemsForMessage(message, byMessage[message.id] || []).every(function (item) {
      return !failedPaths[item.path];
    });
  });
  if (!deletable.length) {
    return {
      scanned: messages.length,
      deletedMessages: 0,
      files: files,
      cutoff: cutoff,
      deferred: messages.length
    };
  }
  const deletableIds = deletable.map(function (row) { return row.id; });
  const removed = await admin.from("chat_messages").delete().in("id", deletableIds).select("id");
  if (removed.error) throw removed.error;

  return {
    scanned: messages.length,
    deletedMessages: (removed.data || []).length,
    files: files,
    cutoff: cutoff,
    deferred: messages.length - deletable.length
  };
}

async function listFolder(admin, bucket, prefix) {
  const listed = await admin.storage.from(bucket).list(prefix, {
    limit: 100,
    offset: 0,
    sortBy: { column: "name", order: "asc" }
  });
  if (listed.error) return [];
  return listed.data || [];
}

function isOldEnough(entry, ageMs) {
  const stamp = entry && (entry.created_at || entry.updated_at || entry.last_accessed_at);
  if (!stamp) return true;
  const time = new Date(stamp).getTime();
  if (isNaN(time)) return true;
  return Date.now() - time >= ageMs;
}

async function cleanupOrphanAttachments(admin) {
  const result = { deleted: 0, missing: 0, errors: [], scanned: 0 };
  const threads = await listFolder(admin, BUCKET, "chat");
  for (let t = 0; t < threads.length; t++) {
    const thread = threads[t];
    if (!thread || !thread.name || thread.id) continue;
    const messageFolders = await listFolder(admin, BUCKET, "chat/" + thread.name);
    for (let m = 0; m < messageFolders.length; m++) {
      const folder = messageFolders[m];
      if (!folder || !folder.name) continue;
      const messageId = folder.name;
      const existing = await admin.from("chat_messages").select("id").eq("id", messageId).maybeSingle();
      if (existing.error) {
        result.errors.push({ messageId: messageId, error: existing.error.message });
        continue;
      }
      if (existing.data) continue;
      const files = await listFolder(admin, BUCKET, "chat/" + thread.name + "/" + messageId);
      const stale = files.filter(function (file) {
        return file && file.name && isOldEnough(file, ORPHAN_AGE_MS);
      });
      result.scanned += files.length;
      if (!stale.length) continue;
      const paths = stale.map(function (file) {
        return { bucket: BUCKET, path: "chat/" + thread.name + "/" + messageId + "/" + file.name };
      });
      const removed = await deleteStorageObjects(admin, paths);
      result.deleted += removed.deleted;
      result.missing += removed.missing;
      result.errors = result.errors.concat(removed.errors);
    }
  }
  return result;
}

async function cleanupOrphanLegacyImages(admin) {
  const result = { deleted: 0, missing: 0, errors: [], scanned: 0 };
  const folders = await listFolder(admin, LEGACY_BUCKET, "");
  for (let i = 0; i < folders.length; i++) {
    const folder = folders[i];
    if (!folder || !folder.name) continue;
    const files = await listFolder(admin, LEGACY_BUCKET, folder.name);
    for (let f = 0; f < files.length; f++) {
      const file = files[f];
      if (!file || !file.name || !isOldEnough(file, RETENTION_DAYS * 24 * 60 * 60 * 1000)) continue;
      const objectPath = folder.name + "/" + file.name;
      result.scanned += 1;
      const used = await admin
        .from("chat_messages")
        .select("id")
        .ilike("image_url", "%" + objectPath)
        .limit(1);
      if (used.error) {
        result.errors.push({ path: objectPath, error: used.error.message });
        continue;
      }
      if (used.data && used.data.length) continue;
      const removed = await deleteStorageObjects(admin, [{ bucket: LEGACY_BUCKET, path: objectPath }]);
      result.deleted += removed.deleted;
      result.missing += removed.missing;
      result.errors = result.errors.concat(removed.errors);
    }
  }
  return result;
}

async function runChatCleanup(options) {
  const admin = (options && options.admin) || adminClient();
  if (!admin) {
    throw new Error("Server storage credentials are not configured.");
  }
  const expired = await cleanupExpiredMessages(admin, options);
  const orphans = await cleanupOrphanAttachments(admin);
  const legacy = await cleanupOrphanLegacyImages(admin);
  return {
    ok: true,
    retentionDays: RETENTION_DAYS,
    expired: expired,
    orphans: orphans,
    legacyImages: legacy
  };
}

module.exports = {
  RETENTION_DAYS,
  MESSAGE_BATCH,
  cutoffIso,
  storageItemsForMessage,
  deleteMessageStorage,
  cleanupExpiredMessages,
  cleanupOrphanAttachments,
  cleanupOrphanLegacyImages,
  runChatCleanup
};
