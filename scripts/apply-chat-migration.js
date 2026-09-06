const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

require("./load-env")();

const ROOT = path.join(__dirname, "..");
const REF = "bgejcfjgolnascjkgdly";
const MIGRATIONS = [
  path.join(ROOT, "supabase/migrations/20260906173000_private_admin_chat.sql"),
  path.join(ROOT, "supabase/migrations/20260906220000_chat_images.sql"),
  path.join(ROOT, "supabase/migrations/20260907020000_chat_edit_attachments.sql")
];

async function applyWithPostgres(sql) {
  const { withClient } = require("../api/_lib/pg");
  await withClient(async function (client) {
    await client.query(sql);
  });
}

async function applyWithManagementApi(token, sql) {
  const response = await fetch("https://api.supabase.com/v1/projects/" + REF + "/database/query", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query: sql })
  });
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch (err) {}
  if (!response.ok) {
    throw new Error((data && (data.message || data.error)) || text || ("HTTP " + response.status));
  }
  return data || { ok: true };
}

function applyWithCli(file) {
  const bin = path.join(ROOT, "node_modules/.bin/supabase");
  execFileSync(bin, [
    "db",
    "query",
    "--project-ref",
    REF,
    "--file",
    file
  ], {
    cwd: ROOT,
    stdio: "inherit"
  });
}

async function applyFile(file) {
  const sql = fs.readFileSync(file, "utf8");
  const name = path.basename(file);
  try {
    if (require("../api/_lib/env").POSTGRES_URL) {
      console.log("Applying", name, "via Postgres…");
      await applyWithPostgres(sql);
      console.log("Applied", name);
      return;
    }
  } catch (err) {
    console.error("Postgres apply failed for", name, err.message || err);
  }
  const token = process.env.SUPABASE_ACCESS_TOKEN || "";
  if (token) {
    console.log("Applying", name, "via Supabase Management API…");
    await applyWithManagementApi(token, sql);
    console.log("Applied", name);
    return;
  }
  console.log("Applying", name, "via supabase CLI…");
  applyWithCli(file);
}

async function main() {
  const onlyLatest = process.argv.indexOf("--latest") >= 0;
  const files = onlyLatest ? [MIGRATIONS[MIGRATIONS.length - 1]] : MIGRATIONS;
  for (let i = 0; i < files.length; i++) {
    await applyFile(files[i]);
  }
}

main().catch(function (err) {
  console.error(err.message || err);
  console.error("\nCould not apply the migration automatically.");
  console.error("Run: npx supabase login");
  console.error("Then: npx supabase link --project-ref " + REF);
  console.error("Then: node scripts/apply-chat-migration.js --latest");
  process.exit(1);
});
