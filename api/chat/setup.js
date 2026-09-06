const { Client } = require("pg");
const { POSTGRES_URL, envFlags } = require("../_lib/env");
const { cors, send } = require("../_lib/http");
const SQL = require("../_lib/chat-schema");
const IMAGES_SQL = require("../_lib/chat-images-sql");
const SHEET_SQL = require("../_lib/sheet-sql");

function connectionConfig() {
  let url = POSTGRES_URL;
  if (!url) return null;
  url = url
    .replace(/[?&]sslmode=[^&]*/gi, "")
    .replace(/[?&]ssl=[^&]*/gi, "")
    .replace(/\?&/, "?")
    .replace(/[?&]$/, "");
  return {
    connectionString: url,
    ssl: { rejectUnauthorized: false }
  };
}

async function withClient(fn) {
  const config = connectionConfig();
  if (!config) {
    throw new Error("Postgres connection is not available on this deployment.");
  }
  const previousTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  const client = new Client(config);
  try {
    await client.connect();
    return await fn(client);
  } finally {
    await client.end().catch(function () {});
    if (previousTls == null) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previousTls;
  }
}

async function tableExists(client, name) {
  const result = await client.query(
    "select to_regclass($1) as id",
    ["public." + name]
  );
  return Boolean(result.rows[0] && result.rows[0].id);
}

async function status() {
  const flags = envFlags();
  if (!POSTGRES_URL) {
    return { ok: false, applied: false, flags: flags, error: "No POSTGRES_URL on this deployment yet." };
  }
  return withClient(async function (client) {
    const threads = await tableExists(client, "chat_threads");
    const messages = await tableExists(client, "chat_messages");
    const rls = threads
      ? (await client.query("select relrowsecurity from pg_class where relname = $1", ["chat_threads"])).rows[0]
      : null;
    const realtime = messages
      ? (await client.query(
        "select count(*)::int as n from pg_publication_tables where pubname = $1 and tablename = any($2::text[])",
        ["supabase_realtime", ["chat_threads", "chat_messages"]]
      )).rows[0].n
      : 0;
    const imageCol = messages
      ? (await client.query(
        "select 1 from information_schema.columns where table_schema = 'public' and table_name = 'chat_messages' and column_name = 'image_url'"
      )).rowCount > 0
      : false;
    return {
      ok: true,
      applied: threads && messages,
      flags: flags,
      tables: {
        chat_threads: threads,
        chat_messages: messages
      },
      images: imageCol,
      rls: Boolean(rls && rls.relrowsecurity),
      realtimeTables: realtime
    };
  });
}

async function apply() {
  return withClient(async function (client) {
    await client.query(SQL);
    await client.query(IMAGES_SQL);
    await client.query(SHEET_SQL);
    return status();
  });
}

module.exports = async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  try {
    if (req.method === "GET") {
      return send(res, 200, await status());
    }
    if (req.method !== "POST") {
      return send(res, 405, { ok: false, error: "Method not allowed." });
    }
    const current = await status();
    if (!current.flags.hasPostgres) {
      return send(res, 503, current);
    }
    const result = await apply();
    return send(res, 200, Object.assign({
      appliedNow: true,
      upgradedImages: Boolean(result.images)
    }, result));
  } catch (err) {
    return send(res, 500, {
      ok: false,
      error: err.message || "Could not apply the chat migration.",
      flags: envFlags()
    });
  }
};
