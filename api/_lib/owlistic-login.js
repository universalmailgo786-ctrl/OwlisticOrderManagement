const { login, normalizeRole } = require("./sheet-logic");

async function verifyOwlisticLogin(username, password) {
  const name = String(username || "").trim();
  if (!name || !password) {
    return { ok: false, error: "Username and password are required." };
  }
  const data = await login({ username: name, password: password });
  if (!data || !data.ok) {
    return { ok: false, error: (data && data.error) || "Wrong username or password." };
  }
  const role = normalizeRole(data.role);
  const loginUsername = String(data.username || name).trim();
  return {
    ok: true,
    username: loginUsername,
    role: role,
    displayName: String(data.personName || data.displayName || data.name || loginUsername).trim(),
    account: role === "superadmin" ? "" : String(data.account || "").trim()
  };
}

module.exports = {
  verifyOwlisticLogin,
  normalizeRole
};
