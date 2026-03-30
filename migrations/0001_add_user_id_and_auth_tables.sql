-- Migration: Add userId to items, outfits, activity_log; add sessions and auth columns to users
-- Applied manually via node script during Task #3 (Google sign-in & per-user data)

-- Add user_id column to items table
ALTER TABLE items ADD COLUMN IF NOT EXISTS user_id text;

-- Add user_id column to outfits table  
ALTER TABLE outfits ADD COLUMN IF NOT EXISTS user_id text;

-- Add user_id column to activity_log table
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS user_id text;

-- Create sessions table for express-session (Replit Auth)
CREATE TABLE IF NOT EXISTS sessions (
  sid varchar PRIMARY KEY,
  sess jsonb NOT NULL,
  expire timestamp NOT NULL
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON sessions (expire);

-- Extend users table with Replit Auth columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS email varchar;
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name varchar;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name varchar;
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image_url varchar;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT NOW();

-- Make legacy columns nullable for compatibility with Replit Auth users
ALTER TABLE users ALTER COLUMN username DROP NOT NULL;
ALTER TABLE users ALTER COLUMN password DROP NOT NULL;
