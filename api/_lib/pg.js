const { Pool } = require("pg");
const { POSTGRES_URL } = require("./env");

let pool = null;

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
    ssl: { rejectUnauthorized: false },
    max: 4,
    idleTimeoutMillis: 15000,
    connectionTimeoutMillis: 8000
  };
}

function getPool() {
  const config = connectionConfig();
  if (!config) return null;
  if (!pool) pool = new Pool(config);
  return pool;
}

async function withClient(fn) {
  const active = getPool();
  if (!active) {
    throw new Error("Postgres connection is not available on this deployment.");
  }
  const previousTls = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  const client = await active.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
    if (previousTls == null) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previousTls;
  }
}

module.exports = {
  connectionConfig,
  withClient
};
