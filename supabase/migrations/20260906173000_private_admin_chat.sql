-- Private Superadmin ↔ user chat for Owlistic.
-- user_id / sender_id are the existing login usernames (text), not a new auth system.

CREATE TABLE IF NOT EXISTS public.chat_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_message text,
  last_sender_id text,
  CONSTRAINT chat_threads_user_id_key UNIQUE (user_id),
  CONSTRAINT chat_threads_user_id_not_blank CHECK (length(trim(user_id)) > 0),
  CONSTRAINT chat_threads_not_superadmin CHECK (lower(trim(user_id)) NOT IN ('superadmin', 'admin'))
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  sender_id text NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  CONSTRAINT chat_messages_not_blank CHECK (length(trim(message)) > 0),
  CONSTRAINT chat_messages_sender_not_blank CHECK (length(trim(sender_id)) > 0)
);

CREATE TABLE IF NOT EXISTS public.chat_auth_secrets (
  username text PRIMARY KEY,
  auth_user_id uuid,
  password text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_threads_user_id_idx ON public.chat_threads (user_id);
CREATE INDEX IF NOT EXISTS chat_threads_updated_at_idx ON public.chat_threads (updated_at DESC);
CREATE INDEX IF NOT EXISTS chat_messages_thread_id_idx ON public.chat_messages (thread_id);
CREATE INDEX IF NOT EXISTS chat_messages_created_at_idx ON public.chat_messages (created_at);
CREATE INDEX IF NOT EXISTS chat_messages_thread_created_idx ON public.chat_messages (thread_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS chat_messages_unread_idx ON public.chat_messages (thread_id) WHERE read_at IS NULL;

CREATE OR REPLACE FUNCTION public.chat_touch_thread()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.chat_threads
  SET
    updated_at = now(),
    last_message = left(NEW.message, 280),
    last_sender_id = NEW.sender_id
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_messages_touch_thread ON public.chat_messages;
CREATE TRIGGER chat_messages_touch_thread
AFTER INSERT ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.chat_touch_thread();

CREATE OR REPLACE FUNCTION public.chat_claim(key text)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(trim(auth.jwt() -> 'user_metadata' ->> key), ''),
    NULLIF(trim(auth.jwt() -> 'app_metadata' ->> key), ''),
    NULLIF(trim(auth.jwt() ->> key), '')
  );
$$;

CREATE OR REPLACE FUNCTION public.chat_username()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT lower(trim(COALESCE(public.chat_claim('username'), '')));
$$;

CREATE OR REPLACE FUNCTION public.chat_is_superadmin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    lower(COALESCE(public.chat_claim('role'), '')) IN ('superadmin', 'admin')
    OR public.chat_username() IN ('superadmin', 'admin');
$$;

CREATE OR REPLACE FUNCTION public.chat_messages_guard_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.message IS DISTINCT FROM OLD.message
     OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.thread_id IS DISTINCT FROM OLD.thread_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Only read_at can be updated on chat messages';
  END IF;
  IF NEW.read_at IS DISTINCT FROM OLD.read_at THEN
    IF public.chat_is_superadmin() THEN
      IF lower(OLD.sender_id) IN ('superadmin', 'admin') THEN
        RAISE EXCEPTION 'Cannot change read state of your own messages';
      END IF;
    ELSIF lower(OLD.sender_id) = public.chat_username() THEN
      RAISE EXCEPTION 'Cannot change read state of your own messages';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_messages_guard_update ON public.chat_messages;
CREATE TRIGGER chat_messages_guard_update
BEFORE UPDATE ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.chat_messages_guard_update();

ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_auth_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_threads FORCE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages FORCE ROW LEVEL SECURITY;
ALTER TABLE public.chat_auth_secrets FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.chat_threads FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.chat_messages FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.chat_auth_secrets FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.chat_threads TO authenticated;
GRANT UPDATE (updated_at, last_message, last_sender_id) ON TABLE public.chat_threads TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.chat_messages TO authenticated;
GRANT EXECUTE ON FUNCTION public.chat_claim(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_username() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_is_superadmin() TO anon, authenticated;

DROP POLICY IF EXISTS chat_threads_select ON public.chat_threads;
CREATE POLICY chat_threads_select ON public.chat_threads
FOR SELECT TO authenticated
USING (
  public.chat_is_superadmin()
  OR lower(user_id) = public.chat_username()
);

DROP POLICY IF EXISTS chat_threads_insert ON public.chat_threads;
CREATE POLICY chat_threads_insert ON public.chat_threads
FOR INSERT TO authenticated
WITH CHECK (
  lower(user_id) NOT IN ('superadmin', 'admin')
  AND (
    public.chat_is_superadmin()
    OR lower(user_id) = public.chat_username()
  )
);

DROP POLICY IF EXISTS chat_threads_update ON public.chat_threads;
CREATE POLICY chat_threads_update ON public.chat_threads
FOR UPDATE TO authenticated
USING (
  public.chat_is_superadmin()
  OR lower(user_id) = public.chat_username()
)
WITH CHECK (
  lower(user_id) NOT IN ('superadmin', 'admin')
  AND (
    public.chat_is_superadmin()
    OR lower(user_id) = public.chat_username()
  )
);

DROP POLICY IF EXISTS chat_messages_select ON public.chat_messages;
CREATE POLICY chat_messages_select ON public.chat_messages
FOR SELECT TO authenticated
USING (
  public.chat_is_superadmin()
  OR EXISTS (
    SELECT 1 FROM public.chat_threads t
    WHERE t.id = chat_messages.thread_id
      AND lower(t.user_id) = public.chat_username()
  )
);

DROP POLICY IF EXISTS chat_messages_insert ON public.chat_messages;
CREATE POLICY chat_messages_insert ON public.chat_messages
FOR INSERT TO authenticated
WITH CHECK (
  length(trim(message)) > 0
  AND (
    (
      public.chat_is_superadmin()
      AND lower(sender_id) IN ('superadmin', 'admin')
    )
    OR (
      NOT public.chat_is_superadmin()
      AND lower(sender_id) = public.chat_username()
      AND EXISTS (
        SELECT 1 FROM public.chat_threads t
        WHERE t.id = chat_messages.thread_id
          AND lower(t.user_id) = public.chat_username()
      )
    )
  )
);

DROP POLICY IF EXISTS chat_messages_update ON public.chat_messages;
CREATE POLICY chat_messages_update ON public.chat_messages
FOR UPDATE TO authenticated
USING (
  public.chat_is_superadmin()
  OR EXISTS (
    SELECT 1 FROM public.chat_threads t
    WHERE t.id = chat_messages.thread_id
      AND lower(t.user_id) = public.chat_username()
  )
)
WITH CHECK (
  public.chat_is_superadmin()
  OR EXISTS (
    SELECT 1 FROM public.chat_threads t
    WHERE t.id = chat_messages.thread_id
      AND lower(t.user_id) = public.chat_username()
  )
);

ALTER TABLE public.chat_threads REPLICA IDENTITY FULL;
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chat_threads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_threads;
  END IF;
END $$;
