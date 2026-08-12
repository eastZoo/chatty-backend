-- Existing concurrent mark-as-read requests may have produced duplicate rows.
-- Keep the oldest row for each user/message pair before enforcing idempotency.
DELETE FROM message_read_status duplicate
USING message_read_status canonical
WHERE duplicate.user_id = canonical.user_id
  AND duplicate.message_id = canonical.message_id
  AND duplicate.id > canonical.id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_message_read_status_user_message
  ON message_read_status (user_id, message_id);

-- The unique index covers the same lookup prefix as the earlier non-unique one.
DROP INDEX IF EXISTS idx_message_read_status_user_message;

DELETE FROM chat_read_status duplicate
USING chat_read_status canonical
WHERE duplicate.chat_id = canonical.chat_id
  AND duplicate.chat_type = canonical.chat_type
  AND duplicate.user_id = canonical.user_id
  AND (
    duplicate.last_read_at < canonical.last_read_at
    OR (
      duplicate.last_read_at = canonical.last_read_at
      AND duplicate.id > canonical.id
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_read_status_chat_type_user
  ON chat_read_status (chat_id, chat_type, user_id);

DROP INDEX IF EXISTS idx_chat_read_status_lookup;

-- A registration token identifies one browser/device. Retain one row for
-- tokens accumulated by the legacy per-user update logic.
DELETE FROM fcm_token duplicate
USING fcm_token canonical
WHERE duplicate.token = canonical.token
  AND duplicate.id > canonical.id;

CREATE UNIQUE INDEX IF NOT EXISTS uq_fcm_token_token
  ON fcm_token (token);
