const { createClient } = require("@supabase/supabase-js");
const { SUPABASE_URL, PUBLISHABLE_KEY, SERVICE_KEY } = require("./env");

function adminClient() {
  if (!SERVICE_KEY) return null;
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

function anonClient() {
  return createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

module.exports = {
  SUPABASE_URL,
  PUBLISHABLE_KEY,
  SERVICE_KEY,
  adminClient,
  anonClient
};
