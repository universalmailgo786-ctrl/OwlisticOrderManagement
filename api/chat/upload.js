const crypto = require("crypto");
const { verifySupabaseJwt, chatUserFromJwt } = require("../_lib/chat-jwt");
const { JWT_SECRET } = require("../_lib/env");
const { adminClient, SUPABASE_URL } = require("../_lib/supabase-admin");
const { cors, readJson, send } = require("../_lib/http");

const ALLOWED = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif"
};
const MAX_BYTES = 3.5 * 1024 * 1024;

function bearer(req) {
  const header = String(req.headers.authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

async function ensureBucket(admin) {
  const existing = await admin.storage.getBucket("chat-images");
  if (existing.data) return;
  const created = await admin.storage.createBucket("chat-images", {
    public: true,
    fileSizeLimit: 5242880,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"]
  });
  if (created.error && !/already exists/i.test(created.error.message || "")) {
    throw created.error;
  }
}

module.exports = async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== "POST") {
    return send(res, 405, { ok: false, error: "Method not allowed." });
  }
  if (!JWT_SECRET) {
    return send(res, 503, { ok: false, error: "Chat is not configured." });
  }
  const payload = verifySupabaseJwt(bearer(req), JWT_SECRET);
  const user = chatUserFromJwt(payload);
  if (!payload || !user.username) {
    return send(res, 401, { ok: false, error: "Sign in again to send images." });
  }

  const body = readJson(req);
  const contentType = String(body.contentType || "image/jpeg").toLowerCase();
  const ext = ALLOWED[contentType];
  if (!ext) {
    return send(res, 400, { ok: false, error: "Use a JPEG, PNG, WebP, or GIF image." });
  }
  const raw = String(body.data || "").replace(/^data:[^;]+;base64,/, "");
  let buf;
  try {
    buf = Buffer.from(raw, "base64");
  } catch (err) {
    return send(res, 400, { ok: false, error: "Could not read that image." });
  }
  if (!buf.length) {
    return send(res, 400, { ok: false, error: "Image data was empty." });
  }
  if (buf.length > MAX_BYTES) {
    return send(res, 400, { ok: false, error: "Image is too large. Use a smaller photo." });
  }

  const admin = adminClient();
  if (!admin) {
    return send(res, 503, { ok: false, error: "Image upload is not available yet." });
  }

  try {
    await ensureBucket(admin);
    const folder = user.username.toLowerCase().replace(/[^a-z0-9._-]/g, "") || "chat";
    const path = folder + "/" + crypto.randomBytes(16).toString("hex") + "." + ext;
    const uploaded = await admin.storage.from("chat-images").upload(path, buf, {
      contentType: contentType === "image/jpg" ? "image/jpeg" : contentType,
      upsert: false
    });
    if (uploaded.error) {
      return send(res, 500, { ok: false, error: uploaded.error.message || "Could not save the image." });
    }
    const pub = admin.storage.from("chat-images").getPublicUrl(path);
    const url = (pub.data && pub.data.publicUrl) || (SUPABASE_URL + "/storage/v1/object/public/chat-images/" + path);
    return send(res, 200, { ok: true, url: url, path: path });
  } catch (err) {
    return send(res, 500, { ok: false, error: err.message || "Could not save the image." });
  }
};
