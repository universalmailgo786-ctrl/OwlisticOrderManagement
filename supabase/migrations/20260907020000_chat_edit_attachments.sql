-- Chat message edit/delete, private attachments, and 10-day retention helpers.

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS has_files boolean NOT NULL DEFAULT false;

ALTER TABLE public.chat_messages
  ALTER COLUMN message SET DEFAULT '';

ALTER TABLE public.chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_not_blank;

ALTER TABLE public.chat_messages
  DROP CONSTRAINT IF EXISTS chat_messages_has_content;

ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_has_content CHECK (
    length(trim(message)) > 0
    OR length(trim(COALESCE(image_url, ''))) > 0
    OR has_files
  );

CREATE TABLE IF NOT EXISTS public.chat_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.chat_messages(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  attachment_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_attachments_path_not_blank CHECK (length(trim(storage_path)) > 0),
  CONSTRAINT chat_attachments_name_not_blank CHECK (length(trim(file_name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_attachments_storage_path_idx
  ON public.chat_attachments (storage_path);

CREATE INDEX IF NOT EXISTS chat_attachments_message_id_idx
  ON public.chat_attachments (message_id);

CREATE INDEX IF NOT EXISTS chat_messages_created_at_expire_idx
  ON public.chat_messages (created_at);

CREATE OR REPLACE FUNCTION public.chat_refresh_thread_id(tid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  latest public.chat_messages%ROWTYPE;
  preview text;
  n_files int;
  n_images int;
BEGIN
  IF tid IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO latest
  FROM public.chat_messages
  WHERE thread_id = tid
  ORDER BY created_at DESC, id DESC
  LIMIT 1;

  IF latest.id IS NULL THEN
    UPDATE public.chat_threads
    SET
      updated_at = now(),
      last_message = NULL,
      last_sender_id = NULL
    WHERE id = tid;
    RETURN;
  END IF;

  SELECT
    count(*) FILTER (WHERE lower(COALESCE(attachment_type, '')) = 'image'),
    count(*)
  INTO n_images, n_files
  FROM public.chat_attachments
  WHERE message_id = latest.id;

  IF length(trim(latest.message)) > 0 AND lower(trim(latest.message)) NOT IN ('photo', 'file') THEN
    preview := latest.message;
  ELSIF length(trim(COALESCE(latest.image_url, ''))) > 0 OR n_images > 0 THEN
    preview := 'Photo';
  ELSIF latest.has_files OR n_files > 0 THEN
    preview := 'File';
  ELSE
    preview := latest.message;
  END IF;

  UPDATE public.chat_threads
  SET
    updated_at = now(),
    last_message = left(preview, 280),
    last_sender_id = latest.sender_id
  WHERE id = tid;
END;
$$;

CREATE OR REPLACE FUNCTION public.chat_refresh_thread()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.chat_refresh_thread_id(COALESCE(NEW.thread_id, OLD.thread_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.chat_refresh_thread_from_attachment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mid uuid;
  tid uuid;
BEGIN
  mid := COALESCE(NEW.message_id, OLD.message_id);
  SELECT thread_id INTO tid FROM public.chat_messages WHERE id = mid;
  PERFORM public.chat_refresh_thread_id(tid);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS chat_messages_touch_thread ON public.chat_messages;
CREATE TRIGGER chat_messages_touch_thread
AFTER INSERT OR DELETE ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.chat_refresh_thread();

DROP TRIGGER IF EXISTS chat_messages_touch_thread_update ON public.chat_messages;
CREATE TRIGGER chat_messages_touch_thread_update
AFTER UPDATE OF message, image_url, has_files, edited_at ON public.chat_messages
FOR EACH ROW
EXECUTE FUNCTION public.chat_refresh_thread();

DROP TRIGGER IF EXISTS chat_attachments_touch_thread ON public.chat_attachments;
CREATE TRIGGER chat_attachments_touch_thread
AFTER INSERT OR DELETE ON public.chat_attachments
FOR EACH ROW
EXECUTE FUNCTION public.chat_refresh_thread_from_attachment();

CREATE OR REPLACE FUNCTION public.chat_messages_guard_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  is_admin boolean := public.chat_is_superadmin();
  me text := public.chat_username();
  is_own boolean;
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.thread_id IS DISTINCT FROM OLD.thread_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.image_url IS DISTINCT FROM OLD.image_url
     OR NEW.has_files IS DISTINCT FROM OLD.has_files THEN
    RAISE EXCEPTION 'Cannot change message identity or attachments';
  END IF;

  is_own := (
    is_admin AND lower(OLD.sender_id) IN ('superadmin', 'admin')
  ) OR (
    (NOT is_admin) AND lower(OLD.sender_id) = me
  );

  IF NEW.message IS DISTINCT FROM OLD.message THEN
    IF NOT is_own THEN
      RAISE EXCEPTION 'Cannot edit another user''s message';
    END IF;
    NEW.message := trim(NEW.message);
    IF length(NEW.message) = 0
       AND length(trim(COALESCE(NEW.image_url, ''))) = 0
       AND NOT NEW.has_files THEN
      RAISE EXCEPTION 'Message cannot be empty';
    END IF;
    NEW.edited_at := now();
  ELSE
    NEW.edited_at := OLD.edited_at;
  END IF;

  IF NEW.read_at IS DISTINCT FROM OLD.read_at THEN
    IF is_own THEN
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

ALTER TABLE public.chat_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_attachments FORCE ROW LEVEL SECURITY;
ALTER TABLE public.chat_attachments REPLICA IDENTITY FULL;

REVOKE ALL ON TABLE public.chat_attachments FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON TABLE public.chat_attachments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.chat_messages TO authenticated;

DROP POLICY IF EXISTS chat_messages_insert ON public.chat_messages;
CREATE POLICY chat_messages_insert ON public.chat_messages
FOR INSERT TO authenticated
WITH CHECK (
  (
    length(trim(message)) > 0
    OR length(trim(COALESCE(image_url, ''))) > 0
    OR has_files
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

DROP POLICY IF EXISTS chat_messages_delete ON public.chat_messages;
CREATE POLICY chat_messages_delete ON public.chat_messages
FOR DELETE TO authenticated
USING (
  (
    public.chat_is_superadmin()
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
);

DROP POLICY IF EXISTS chat_attachments_select ON public.chat_attachments;
CREATE POLICY chat_attachments_select ON public.chat_attachments
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.chat_messages m
    JOIN public.chat_threads t ON t.id = m.thread_id
    WHERE m.id = chat_attachments.message_id
      AND (
        public.chat_is_superadmin()
        OR lower(t.user_id) = public.chat_username()
      )
  )
);

DROP POLICY IF EXISTS chat_attachments_insert ON public.chat_attachments;
CREATE POLICY chat_attachments_insert ON public.chat_attachments
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.chat_messages m
    JOIN public.chat_threads t ON t.id = m.thread_id
    WHERE m.id = chat_attachments.message_id
      AND (
        (
          public.chat_is_superadmin()
          AND lower(m.sender_id) IN ('superadmin', 'admin')
        )
        OR (
          NOT public.chat_is_superadmin()
          AND lower(m.sender_id) = public.chat_username()
          AND lower(t.user_id) = public.chat_username()
        )
      )
  )
);

DROP POLICY IF EXISTS chat_attachments_delete ON public.chat_attachments;
CREATE POLICY chat_attachments_delete ON public.chat_attachments
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.chat_messages m
    JOIN public.chat_threads t ON t.id = m.thread_id
    WHERE m.id = chat_attachments.message_id
      AND (
        public.chat_is_superadmin()
        OR (
          lower(m.sender_id) = public.chat_username()
          AND lower(t.user_id) = public.chat_username()
        )
      )
  )
);

GRANT EXECUTE ON FUNCTION public.chat_refresh_thread_id(uuid) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chat_attachments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_attachments;
  END IF;
END $$;

DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public, file_size_limit)
  VALUES ('chat-attachments', 'chat-attachments', false, 10485760)
  ON CONFLICT (id) DO UPDATE
  SET
    public = false,
    file_size_limit = 10485760;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN insufficient_privilege THEN NULL;
  WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  DROP POLICY IF EXISTS chat_attachments_storage_select ON storage.objects;
  DROP POLICY IF EXISTS chat_attachments_storage_insert ON storage.objects;
  DROP POLICY IF EXISTS chat_attachments_storage_update ON storage.objects;
  DROP POLICY IF EXISTS chat_attachments_storage_delete ON storage.objects;

  CREATE POLICY chat_attachments_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND split_part(name, '/', 1) = 'chat'
    AND (
      public.chat_is_superadmin()
      OR EXISTS (
        SELECT 1 FROM public.chat_threads t
        WHERE t.id::text = split_part(name, '/', 2)
          AND lower(t.user_id) = public.chat_username()
      )
    )
  );

  CREATE POLICY chat_attachments_storage_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (false);

  CREATE POLICY chat_attachments_storage_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (false)
  WITH CHECK (false);

  CREATE POLICY chat_attachments_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (false);
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN insufficient_privilege THEN NULL;
  WHEN undefined_object THEN NULL;
  WHEN OTHERS THEN NULL;
END $$;
