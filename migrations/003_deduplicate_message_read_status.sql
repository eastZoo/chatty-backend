-- SQLite/local equivalent: keep one row per user/message pair, then make
-- concurrent mark-as-read inserts idempotent.
DELETE FROM message_read_status
WHERE rowid NOT IN (
  SELECT MIN(rowid)
  FROM message_read_status
  GROUP BY user_id, message_id
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_message_read_status_user_message
  ON message_read_status (user_id, message_id);

DROP INDEX IF EXISTS idx_message_read_status_user_message;

DELETE FROM chat_read_status AS duplicate
WHERE EXISTS (
  SELECT 1
  FROM chat_read_status AS canonical
  WHERE canonical.chat_id = duplicate.chat_id
    AND canonical.chat_type = duplicate.chat_type
    AND canonical.user_id = duplicate.user_id
    AND (
      canonical.last_read_at > duplicate.last_read_at
      OR (
        canonical.last_read_at = duplicate.last_read_at
        AND canonical.rowid < duplicate.rowid
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_read_status_chat_type_user
  ON chat_read_status (chat_id, chat_type, user_id);

DROP INDEX IF EXISTS idx_chat_read_status_lookup;

DELETE FROM fcm_token
WHERE rowid NOT IN (
  SELECT MIN(rowid)
  FROM fcm_token
  GROUP BY token
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fcm_token_token
  ON fcm_token (token);
