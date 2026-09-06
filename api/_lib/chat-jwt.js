const crypto = require("crypto");

const UUID_NS = Buffer.from("6ba7b8119dad11d180b400c04fd430c8", "hex");

function uuidFromUsername(username) {
  const hash = crypto.createHash("sha1")
    .update(UUID_NS)
    .update(String(username || "").trim().toLowerCase())
    .digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return (
    hex.slice(0, 8) + "-" +
    hex.slice(8, 12) + "-" +
    hex.slice(12, 16) + "-" +
    hex.slice(16, 20) + "-" +
    hex.slice(20, 32)
  );
}

function base64url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function mintSupabaseJwt(profile, secret, ttlSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const ttl = Number(ttlSeconds || 60 * 60 * 24 * 7);
  const username = String(profile.username || "").trim();
  const payload = {
    aud: "authenticated",
    role: "authenticated",
    iss: "supabase",
    sub: uuidFromUsername(username),
    email: emailForUsername(username),
    iat: now,
    exp: now + ttl,
    username: username,
    user_metadata: {
      username: username,
      role: profile.role,
      displayName: profile.displayName || username,
      account: profile.account || ""
    },
    app_metadata: {
      provider: "owlistic",
      username: username,
      role: profile.role
    }
  };
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const sig = crypto
    .createHmac("sha256", secret)
    .update(header + "." + body)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  return header + "." + body + "." + sig;
}

function emailForUsername(username) {
  const slug = crypto
    .createHash("sha256")
    .update(String(username || "").trim().toLowerCase())
    .digest("hex")
    .slice(0, 20);
  return "u" + slug + "@owlistic.chat";
}

function randomPassword() {
  return crypto.randomBytes(24).toString("hex");
}

module.exports = {
  uuidFromUsername,
  mintSupabaseJwt,
  emailForUsername,
  randomPassword
};
