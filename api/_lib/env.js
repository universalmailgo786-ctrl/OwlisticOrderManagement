function firstEnv(names) {
  for (let i = 0; i < names.length; i++) {
    const value = process.env[names[i]];
    if (value && String(value).trim()) return String(value).trim();
  }
  return "";
}

const SUPABASE_URL = firstEnv([
  "SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL"
]) || "https://bgejcfjgolnascjkgdly.supabase.co";

const PUBLISHABLE_KEY = firstEnv([
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_ANON_KEY"
]) || "sb_publishable_BA5zWllwh8JB3iGWfKUjGA_v6x-MfWt";

const SERVICE_KEY = firstEnv([
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_KEY"
]);

const JWT_SECRET = firstEnv([
  "SUPABASE_JWT_SECRET"
]);

const POSTGRES_URL = firstEnv([
  "POSTGRES_URL_NON_POOLING",
  "POSTGRES_URL",
  "DATABASE_URL",
  "POSTGRES_PRISMA_URL"
]);

function envFlags() {
  return {
    hasUrl: Boolean(SUPABASE_URL),
    hasPublishableKey: Boolean(PUBLISHABLE_KEY),
    hasServiceRole: Boolean(SERVICE_KEY),
    hasJwtSecret: Boolean(JWT_SECRET),
    hasPostgres: Boolean(POSTGRES_URL)
  };
}

module.exports = {
  firstEnv,
  SUPABASE_URL,
  PUBLISHABLE_KEY,
  SERVICE_KEY,
  JWT_SECRET,
  POSTGRES_URL,
  envFlags
};
