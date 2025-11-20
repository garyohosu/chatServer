-- Test data for development
-- Note: In production, users should register through the web interface

-- Sample verified user (password: testpass123)
-- Password hash is for demonstration only - generated using argon2id
INSERT OR IGNORE INTO users (id, email, password_hash, verified, created_at) VALUES 
  ('test-user-1', 'test@example.com', '$argon2id$v=19$m=19456,t=2,p=1$aAbBcCdDeEfFgGhHiIjJkK$LlMmNnOoPpQqRrSsTtUuVvWwXxYyZz0', 1, strftime('%s', 'now') * 1000);

-- Sample messages
INSERT OR IGNORE INTO messages (user_id, message, created_at) VALUES 
  ('test-user-1', 'Welcome to the chat app!', strftime('%s', 'now') * 1000),
  ('test-user-1', 'This is a sample message.', strftime('%s', 'now') * 1000 + 1000);
