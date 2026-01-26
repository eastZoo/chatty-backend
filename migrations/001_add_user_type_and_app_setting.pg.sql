-- ============================================================
-- PostgreSQL용: 사용 중인 DB가 PostgreSQL일 때 아래만 실행하세요.
-- ============================================================
-- 사용자 테이블에 type 컬럼 추가 (기본값 USER)
ALTER TABLE users ADD COLUMN IF NOT EXISTS type VARCHAR(20) DEFAULT 'USER';
UPDATE users SET type = 'USER' WHERE type IS NULL;

-- 앱 설정 테이블 생성
CREATE TABLE IF NOT EXISTS app_setting (
  key VARCHAR(255) PRIMARY KEY,
  value VARCHAR(255) NOT NULL
);
INSERT INTO app_setting (key, value) VALUES ('chat_auto_delete_hours', '0')
ON CONFLICT (key) DO NOTHING;
