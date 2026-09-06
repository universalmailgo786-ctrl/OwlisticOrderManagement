const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const files = [
  "api/chat/session.js",
  "api/chat/setup.js",
  "api/chat/upload.js",
  "api/_lib/chat-images-sql.js",
  "api/_lib/env.js",
  "api/_lib/chat-schema.js",
  "api/_lib/owlistic-login.js",
  "api/_lib/chat-jwt.js",
  "api/_lib/supabase-admin.js",
  "api/_lib/http.js",
  "js/chat-config.js",
  "js/chat-client.js",
  "js/chat-nav.js",
  "js/chat-page.js",
  "js/auth.js",
  "scripts/apply-chat-migration.js"
];

let failed = 0;
files.forEach(function (file) {
  const result = spawnSync(process.execPath, ["--check", path.join(ROOT, file)], { encoding: "utf8" });
  if (result.status !== 0) {
    failed += 1;
    console.error("FAIL", file, result.stderr || result.stdout);
  } else {
    console.log("ok", file);
  }
});

const sql = fs.readFileSync(path.join(ROOT, "supabase/migrations/20260906173000_private_admin_chat.sql"), "utf8");
const required = [
  "CREATE TABLE IF NOT EXISTS public.chat_threads",
  "CREATE TABLE IF NOT EXISTS public.chat_messages",
  "ENABLE ROW LEVEL SECURITY",
  "chat_is_superadmin",
  "supabase_realtime",
  "chat_messages_touch_thread"
];
required.forEach(function (token) {
  if (sql.indexOf(token) < 0) {
    failed += 1;
    console.error("FAIL migration missing", token);
  } else {
    console.log("ok migration has", token);
  }
});

const jwt = require(path.join(ROOT, "api/_lib/chat-jwt.js"));
const token = jwt.mintSupabaseJwt({ username: "block", role: "user", displayName: "Block" }, "test-secret");
if (token.split(".").length !== 3) {
  failed += 1;
  console.error("FAIL jwt format");
} else {
  console.log("ok jwt minted");
}
const verified = jwt.verifySupabaseJwt(token, "test-secret");
if (!verified || jwt.chatUserFromJwt(verified).username !== "block") {
  failed += 1;
  console.error("FAIL jwt verify");
} else {
  console.log("ok jwt verify");
}

if (failed) {
  console.error("chat checks failed:", failed);
  process.exit(1);
}
console.log("chat checks passed");
