module.exports = `
-- Owlistic Google Sheets → Supabase. Chat tables are left unchanged.
-- Service-role / Postgres only; no anon grants (passwords stay off the public API).

CREATE TABLE IF NOT EXISTS public.sheet_users (
  username text PRIMARY KEY,
  password text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'user',
  account text NOT NULL DEFAULT '',
  display_name text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  whatsapp text NOT NULL DEFAULT '',
  fiverr_id text NOT NULL DEFAULT '',
  fiverr_gig_url text NOT NULL DEFAULT '',
  payment_status text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sheet_accounts (
  account text PRIMARY KEY,
  username text NOT NULL DEFAULT '',
  person_name text NOT NULL DEFAULT '',
  whatsapp text NOT NULL DEFAULT '',
  fiverr_id text NOT NULL DEFAULT '',
  fiverr_gig_url text NOT NULL DEFAULT '',
  payment_status text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sheet_orders (
  order_id text PRIMARY KEY,
  tab_name text NOT NULL,
  account_name text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sheet_orders_tab_idx ON public.sheet_orders (lower(tab_name));
CREATE INDEX IF NOT EXISTS sheet_orders_account_idx ON public.sheet_orders (lower(account_name));
CREATE INDEX IF NOT EXISTS sheet_orders_updated_idx ON public.sheet_orders (updated_at DESC);

CREATE TABLE IF NOT EXISTS public.sheet_hanif_records (
  order_id text PRIMARY KEY,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sheet_settings (
  key text PRIMARY KEY,
  value text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.sheet_settings (key, value)
VALUES ('pkr_rate', '275')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.sheet_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sheet_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sheet_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sheet_hanif_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sheet_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sheet_users FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sheet_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sheet_orders FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sheet_hanif_records FORCE ROW LEVEL SECURITY;
ALTER TABLE public.sheet_settings FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.sheet_users FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.sheet_accounts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.sheet_orders FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.sheet_hanif_records FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.sheet_settings FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  GRANT ALL ON TABLE public.sheet_users TO postgres;
  GRANT ALL ON TABLE public.sheet_accounts TO postgres;
  GRANT ALL ON TABLE public.sheet_orders TO postgres;
  GRANT ALL ON TABLE public.sheet_hanif_records TO postgres;
  GRANT ALL ON TABLE public.sheet_settings TO postgres;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

DO $$
BEGIN
  GRANT ALL ON TABLE public.sheet_users TO service_role;
  GRANT ALL ON TABLE public.sheet_accounts TO service_role;
  GRANT ALL ON TABLE public.sheet_orders TO service_role;
  GRANT ALL ON TABLE public.sheet_hanif_records TO service_role;
  GRANT ALL ON TABLE public.sheet_settings TO service_role;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;
`;
