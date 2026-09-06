const { Client } = require("pg");
const { POSTGRES_URL } = require("./env");

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

module.exports = {
  connectionConfig,
  withClient
};
