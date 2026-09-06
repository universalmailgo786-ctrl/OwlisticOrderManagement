const { cors, readJson, send } = require("./_lib/http");
const logic = require("./_lib/sheet-logic");

const DRIVE_URL =
  process.env.OWLISTIC_DRIVE_URL ||
  "https://script.google.com/macros/s/AKfycbwlWvSU1b8SJ42_3xdrrl1w7GhUiezAjBN85w9MvD-uFc-jg8m6OGJdGJRLm-fLIdl2/exec";

const DRIVE_ACTIONS = {
  uploadFile: true,
  getUpload: true,
  driveStatus: true
};

function queryParams(req) {
  try {
    const url = new URL(req.url, "http://localhost");
    const out = {};
    url.searchParams.forEach(function (value, key) {
      out[key] = value;
    });
    return out;
  } catch (err) {
    return {};
  }
}

async function proxyDrive(req, data) {
  const action = String(data.action || "");
  if (req.method === "GET") {
    const url = new URL(DRIVE_URL);
    Object.keys(data).forEach(function (key) {
      if (data[key] != null) url.searchParams.set(key, String(data[key]));
    });
    const response = await fetch(url.toString(), { method: "GET", redirect: "follow" });
    return response.text();
  }
  const response = await fetch(DRIVE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return response.text();
}

function parseBody(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try { return JSON.parse(match[0]); } catch (err2) { return null; }
  }
}

module.exports = async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  const q = queryParams(req);
  const body = req.method === "POST" ? readJson(req) : {};
  const data = Object.assign({}, q, body);
  try {
    if (DRIVE_ACTIONS[String(data.action || "")]) {
      const text = await proxyDrive(req, data);
      const parsed = parseBody(text);
      if (parsed) return send(res, 200, parsed);
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.end(text);
    }
    const result = await logic.handle(data);
    return send(res, result && result.ok === false ? 200 : 200, result);
  } catch (err) {
    return send(res, 500, { ok: false, error: err.message || "Sheet API failed." });
  }
};
