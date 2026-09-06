const { verifyOwlisticLogin } = require("../_lib/owlistic-login");
const { mintSupabaseJwt, emailForUsername, randomPassword } = require("../_lib/chat-jwt");
const { adminClient, anonClient, SERVICE_KEY } = require("../_lib/supabase-admin");
const { cors, readJson, send } = require("../_lib/http");

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET || "";

async function getOrCreateAuthUser(profile) {
  const admin = adminClient();
  if (!admin) {
    return { ok: false, error: "Missing SUPABASE_SERVICE_ROLE_KEY." };
  }
  const username = String(profile.username || "").trim();
  const email = emailForUsername(username);
  const key = username.toLowerCase();
  const metadata = {
    username: username,
    role: profile.role,
    displayName: profile.displayName || username,
    account: profile.account || ""
  };
  const appMetadata = {
    provider: "owlistic",
    username: username,
    role: profile.role
  };

  const existingSecret = await admin
    .from("chat_auth_secrets")
    .select("username, auth_user_id, password")
    .eq("username", key)
    .maybeSingle();

  let password = existingSecret.data && existingSecret.data.password;
  if (!password) password = randomPassword();

  let userId = existingSecret.data && existingSecret.data.auth_user_id;
  if (!userId) {
    const created = await admin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: metadata,
      app_metadata: appMetadata
    });
    if (created.data && created.data.user) {
      userId = created.data.user.id;
    } else {
      const byEmail = admin.auth.admin.getUserByEmail
        ? await admin.auth.admin.getUserByEmail(email)
        : { data: { user: null } };
      const found = byEmail.data && byEmail.data.user;
      if (!found) {
        return { ok: false, error: (created.error && created.error.message) || "Could not create chat login." };
      }
      userId = found.id;
      await admin.auth.admin.updateUserById(userId, {
        password: password,
        user_metadata: metadata,
        app_metadata: appMetadata
      });
    }
  } else {
    await admin.auth.admin.updateUserById(userId, {
      password: password,
      email_confirm: true,
      user_metadata: metadata,
      app_metadata: appMetadata
    });
  }

  await admin.from("chat_auth_secrets").upsert({
    username: key,
    auth_user_id: userId,
    password: password,
    updated_at: new Date().toISOString()
  });

  const anon = anonClient();
  const signed = await anon.auth.signInWithPassword({ email: email, password: password });
  if (signed.error || !signed.data || !signed.data.session) {
    return { ok: false, error: (signed.error && signed.error.message) || "Could not start chat session." };
  }
  return {
    ok: true,
    session: signed.data.session,
    user: metadata
  };
}

module.exports = async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== "POST") {
    return send(res, 405, { ok: false, error: "Method not allowed." });
  }

  const body = readJson(req);
  let login;
  try {
    login = await verifyOwlisticLogin(body.username, body.password);
  } catch (err) {
    return send(res, 502, { ok: false, error: "Could not reach the existing login service." });
  }
  if (!login.ok) {
    return send(res, 401, { ok: false, error: login.error || "Wrong username or password." });
  }

  if (JWT_SECRET) {
    const accessToken = mintSupabaseJwt(login, JWT_SECRET);
    return send(res, 200, {
      ok: true,
      mode: "jwt",
      access_token: accessToken,
      refresh_token: accessToken,
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
      user: {
        username: login.username,
        role: login.role,
        displayName: login.displayName,
        account: login.account
      }
    });
  }

  if (!SERVICE_KEY) {
    return send(res, 503, {
      ok: false,
      error: "Add SUPABASE_SERVICE_ROLE_KEY or SUPABASE_JWT_SECRET in Vercel environment variables to enable Messages."
    });
  }

  try {
    const result = await getOrCreateAuthUser(login);
    if (!result.ok) return send(res, 500, { ok: false, error: result.error });
    const session = result.session;
    return send(res, 200, {
      ok: true,
      mode: "auth",
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      user: result.user
    });
  } catch (err) {
    return send(res, 500, { ok: false, error: err.message || "Could not open chat session." });
  }
};
