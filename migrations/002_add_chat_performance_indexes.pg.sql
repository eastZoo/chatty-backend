-- Keep message send, pagination, and unread-count queries index-backed as
-- conversation history grows.
CREATE INDEX IF NOT EXISTS idx_message_private_chat_created_at
  ON message (private_chat_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_message_chat_created_at
  ON message (chat_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_message_read_status_user_message
  ON message_read_status (user_id, message_id);

CREATE INDEX IF NOT EXISTS idx_chat_read_status_lookup
  ON chat_read_status (chat_id, chat_type, user_id);
