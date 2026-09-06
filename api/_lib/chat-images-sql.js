module.exports = `-- Images in private Superadmin ↔ user chat.

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS image_url text;

ALTER TABLE public.chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_not_blank;

ALTER TABLE public.chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_has_content;

ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_has_content CHECK (
    length(trim(message)) > 0
    OR length(trim(COALESCE(image_url, ''))) > 0
  );

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
    last_message = left(
      CASE
        WHEN length(trim(NEW.message)) > 0 THEN NEW.message
        WHEN length(trim(COALESCE(NEW.image_url, ''))) > 0 THEN 'Photo'
        ELSE NEW.message
      END,
      280
    ),
    last_sender_id = NEW.sender_id
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
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
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.image_url IS DISTINCT FROM OLD.image_url THEN
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

DROP POLICY IF EXISTS chat_messages_insert ON public.chat_messages;
CREATE POLICY chat_messages_insert ON public.chat_messages
FOR INSERT TO authenticated
WITH CHECK (
  (
    length(trim(message)) > 0
    OR length(trim(COALESCE(image_url, ''))) > 0
  )
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

DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public, file_size_limit)
  VALUES ('chat-images', 'chat-images', true, 5242880)
  ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN insufficient_privilege THEN NULL;
  WHEN OTHERS THEN NULL;
END $$;
`;
