const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const REF = "bgejcfjgolnascjkgdly";
const MIGRATION = path.join(ROOT, "supabase/migrations/20260906173000_private_admin_chat.sql");
const SQL = fs.readFileSync(MIGRATION, "utf8");

async function applyWithManagementApi(token) {
  const response = await fetch("https://api.supabase.com/v1/projects/" + REF + "/database/query", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ query: SQL })
  });
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch (err) {}
  if (!response.ok) {
    throw new Error((data && (data.message || data.error)) || text || ("HTTP " + response.status));
  }
  return data || { ok: true };
}

function applyWithCli() {
  const bin = path.join(ROOT, "node_modules/.bin/supabase");
  try {
    execFileSync(bin, [
      "db",
      "push",
      "--project-ref",
      REF,
      "--yes",
      "--include-all"
    ], {
      cwd: ROOT,
      stdio: "inherit"
    });
    return;
  } catch (err) {
    execFileSync(bin, [
      "db",
      "query",
      "--project-ref",
      REF,
      "--file",
      MIGRATION
    ], {
      cwd: ROOT,
      stdio: "inherit"
    });
  }
}

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN || "";
  if (token) {
    console.log("Applying chat migration via Supabase Management API…");
    const result = await applyWithManagementApi(token);
    console.log("Applied.", result && result.message ? result.message : "ok");
    return;
  }
  try {
    console.log("Applying chat migration via supabase CLI…");
    applyWithCli();
  } catch (err) {
    console.error(err.message || err);
    console.error("\nCould not apply the migration automatically.");
    console.error("Run: npx supabase login");
    console.error("Then: npx supabase link --project-ref " + REF);
    console.error("Then: node scripts/apply-chat-migration.js");
    process.exit(1);
  }
}

main().catch(function (err) {
  console.error(err.message || err);
  process.exit(1);
});
