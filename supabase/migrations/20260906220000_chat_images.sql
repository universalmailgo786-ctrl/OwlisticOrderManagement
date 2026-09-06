-- Images in private Superadmin ↔ user chat.

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
