const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const files = [
  "api/chat/session.js",
  "api/chat/setup.js",
  "api/chat/unread.js",
  "api/chat/mark-read.js",
  "api/chat/upload.js",
  "api/chat/signed-url.js",
  "api/chat/purge-files.js",
  "api/chat/delete-message.js",
  "api/cron/chat-cleanup.js",
  "api/_lib/chat-images-sql.js",
  "api/_lib/chat-edit-sql.js",
  "api/_lib/chat-files.js",
  "api/_lib/chat-cleanup.js",
  "api/_lib/env.js",
  "api/_lib/chat-schema.js",
  "api/_lib/owlistic-login.js",
  "api/_lib/chat-jwt.js",
  "api/_lib/supabase-admin.js",
  "api/_lib/http.js",
  "api/_lib/pg.js",
  "api/_lib/sheet-sql.js",
  "api/_lib/sheet-logic.js",
  "api/sheet.js",
  "api/sheet-import.js",
  "js/chat-config.js",
  "js/chat-client.js",
  "js/chat-nav.js",
  "js/chat-page.js",
  "js/auth.js",
  "js/sheet-sync.js",
  "js/hanif-sheet.js",
  "scripts/apply-chat-migration.js",
  "scripts/test-chat-cleanup.js",
  "scripts/load-env.js"
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

const sheetSql = fs.readFileSync(path.join(ROOT, "supabase/migrations/20260907010000_sheet_tables.sql"), "utf8");
const sheetRequired = [
  "CREATE TABLE IF NOT EXISTS public.sheet_users",
  "CREATE TABLE IF NOT EXISTS public.sheet_accounts",
  "CREATE TABLE IF NOT EXISTS public.sheet_orders",
  "CREATE TABLE IF NOT EXISTS public.sheet_hanif_records",
  "CREATE TABLE IF NOT EXISTS public.sheet_settings"
];
sheetRequired.forEach(function (token) {
  if (sheetSql.indexOf(token) < 0) {
    failed += 1;
    console.error("FAIL sheet migration missing", token);
  } else {
    console.log("ok sheet migration has", token);
  }
});

const editSql = fs.readFileSync(path.join(ROOT, "supabase/migrations/20260907020000_chat_edit_attachments.sql"), "utf8");
const editRequired = [
  "edited_at",
  "CREATE TABLE IF NOT EXISTS public.chat_attachments",
  "chat_messages_delete",
  "chat-attachments",
  "chat_refresh_thread_id"
];
editRequired.forEach(function (token) {
  if (editSql.indexOf(token) < 0) {
    failed += 1;
    console.error("FAIL edit migration missing", token);
  } else {
    console.log("ok edit migration has", token);
  }
});

const filesLib = require(path.join(ROOT, "api/_lib/chat-files.js"));
if (!filesLib.classifyFile("spec.pdf", "application/pdf").ok || filesLib.classifyFile("bad.exe", "").ok) {
  failed += 1;
  console.error("FAIL file allowlist");
} else {
  console.log("ok file allowlist");
}

if (filesLib.MAX_BYTES !== 10 * 1024 * 1024) {
  failed += 1;
  console.error("FAIL max attachment size");
} else {
  console.log("ok max attachment size");
}

const pageJs = fs.readFileSync(path.join(ROOT, "js/chat-page.js"), "utf8");
if (pageJs.indexOf("document.hasFocus()") < 0) {
  failed += 1;
  console.error("FAIL chat-page must require window focus before marking read");
} else {
  console.log("ok chat-page marks read only when focused");
}

const navJs = fs.readFileSync(path.join(ROOT, "js/chat-nav.js"), "utf8");
const navRequired = [
  "is-on",
  "unreadSummary",
  "data-chat-badge",
  "chat-nav-label",
  "applyIncoming",
  "applyThreadRead",
  "owlistic-unread",
  "BroadcastChannel",
  "subscribeInbox"
];
navRequired.forEach(function (token) {
  if (navJs.indexOf(token) < 0) {
    failed += 1;
    console.error("FAIL chat-nav missing", token);
  } else {
    console.log("ok chat-nav has", token);
  }
});

const clientJs = fs.readFileSync(path.join(ROOT, "js/chat-client.js"), "utf8");
const clientRequired = ["bindRealtimeAuth", "realtime.setAuth", "isIncomingRow", "postgres_changes"];
clientRequired.forEach(function (token) {
  if (clientJs.indexOf(token) < 0) {
    failed += 1;
    console.error("FAIL chat-client missing", token);
  } else {
    console.log("ok chat-client has", token);
  }
});

if (pageJs.indexOf("applyIncoming") < 0 || pageJs.indexOf("owlistic-unread") < 0) {
  failed += 1;
  console.error("FAIL chat-page must sync realtime unread with the nav badge");
} else {
  console.log("ok chat-page syncs realtime unread");
}

const css = fs.readFileSync(path.join(ROOT, "css/styles.css"), "utf8");
if (css.indexOf("#e23c3c") < 0 || css.indexOf(".chat-unread-badge.is-on") < 0 || css.indexOf(".chat-nav-link .chat-unread-badge.is-on") < 0) {
  failed += 1;
  console.error("FAIL unread badge styles");
} else {
  console.log("ok unread badge styles");
}

const configJs = fs.readFileSync(path.join(ROOT, "js/chat-config.js"), "utf8");
if (configJs.indexOf('unreadUrl: "/api/chat/unread"') < 0 || configJs.indexOf('markReadUrl: "/api/chat/mark-read"') < 0) {
  failed += 1;
  console.error("FAIL chat-config unread/mark-read urls");
} else {
  console.log("ok chat-config unread and mark-read urls");
}

if (failed) {
  console.error("chat checks failed:", failed);
  process.exit(1);
}
console.log("chat checks passed");
