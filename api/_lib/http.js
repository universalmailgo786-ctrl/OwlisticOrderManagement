function cors(req, res) {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function readJson(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  const raw = Buffer.isBuffer(req.body)
    ? req.body.toString("utf8")
    : (typeof req.body === "string" ? req.body : "");
  if (raw && String(raw).trim()) {
    try {
      return JSON.parse(raw);
    } catch (err) {
      return {};
    }
  }
  return {};
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function bearer(req) {
  const header = String((req && req.headers && req.headers.authorization) || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function queryOf(req) {
  if (req && req.query && typeof req.query === "object") return req.query;
  try {
    const host = (req && req.headers && req.headers.host) || "localhost";
    const url = new URL(req && req.url ? req.url : "/", "http://" + host);
    const out = {};
    url.searchParams.forEach(function (value, key) {
      out[key] = value;
    });
    return out;
  } catch (err) {
    return {};
  }
}

module.exports = {
  cors,
  readJson,
  send,
  bearer,
  queryOf
};
