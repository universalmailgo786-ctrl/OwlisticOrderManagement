const { login, getChatProfile, normalizeRole } = require("./sheet-logic");

function asChatLogin(data, fallbackUsername) {
  const role = normalizeRole(data && data.role);
  const loginUsername = String((data && data.username) || fallbackUsername || "").trim();
  return {
    ok: true,
    username: loginUsername,
    role: role,
    displayName: String((data && (data.personName || data.displayName || data.name)) || loginUsername).trim(),
    account: role === "superadmin" ? "" : String((data && data.account) || "").trim()
  };
}

async function verifyOwlisticLogin(username, password) {
  const name = String(username || "").trim();
  if (!name || !password) {
    return { ok: false, error: "Username and password are required." };
  }
  const data = await login({ username: name, password: password });
  if (!data || !data.ok) {
    return { ok: false, error: (data && data.error) || "Wrong username or password." };
  }
  return asChatLogin(data, name);
}

async function resolveOwlisticUser(username) {
  const data = await getChatProfile(username);
  if (!data || !data.ok) {
    return { ok: false, error: (data && data.error) || "User was not found." };
  }
  return asChatLogin(data, username);
}

module.exports = {
  verifyOwlisticLogin,
  resolveOwlisticUser,
  normalizeRole
};
