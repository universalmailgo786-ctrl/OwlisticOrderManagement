const LOGIN_URL =
  process.env.OWLISTIC_LOGIN_URL ||
  "https://script.google.com/macros/s/AKfycbwlWvSU1b8SJ42_3xdrrl1w7GhUiezAjBN85w9MvD-uFc-jg8m6OGJdGJRLm-fLIdl2/exec";

function parseBody(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (err2) {
      return null;
    }
  }
}

function normalizeRole(role) {
  const raw = String(role || "user").trim().toLowerCase().replace(/\s+/g, "");
  if (raw === "superadmin" || raw === "admin") return "superadmin";
  return "user";
}

async function verifyOwlisticLogin(username, password) {
  const name = String(username || "").trim();
  if (!name || !password) {
    return { ok: false, error: "Username and password are required." };
  }
  const url =
    LOGIN_URL +
    (LOGIN_URL.indexOf("?") >= 0 ? "&" : "?") +
    "action=login" +
    "&username=" + encodeURIComponent(name) +
    "&password=" + encodeURIComponent(password);
  const response = await fetch(url, { method: "GET", redirect: "follow" });
  const text = await response.text();
  const data = parseBody(text);
  if (!data) return { ok: false, error: "Could not verify login." };
  if (!data.ok) return { ok: false, error: data.error || "Wrong username or password." };
  const role = normalizeRole(data.role);
  const loginUsername = String(data.username || name).trim();
  return {
    ok: true,
    username: loginUsername,
    role: role,
    displayName: String(data.personName || data.name || loginUsername).trim(),
    account: role === "superadmin" ? "" : String(data.account || "").trim()
  };
}

module.exports = {
  verifyOwlisticLogin,
  normalizeRole
};
