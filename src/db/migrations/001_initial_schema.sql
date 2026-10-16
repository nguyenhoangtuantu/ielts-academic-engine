-- Migration: 001_initial_schema.sql
-- Description: Initial schema for IELTS Academic Feedback Engine with Supabase Row-Level Security (RLS)
-- Tables: users, payments, essays, mistakes

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. USERS TABLE
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'pro')),
  pro_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. PAYMENTS TABLE (VietQR / PayOS transactions)
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_code BIGINT NOT NULL UNIQUE,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled', 'failed')),
  signature TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. ESSAYS TABLE (Submitted essays with public SEO support)
CREATE TABLE IF NOT EXISTS essays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  anonymous_session_id TEXT,
  title TEXT NOT NULL DEFAULT 'Untitled Essay',
  original_text TEXT NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT true,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 5. MISTAKES TABLE (Automated Mistake Bank & SM-2 Spaced Repetition)
CREATE TABLE IF NOT EXISTS mistakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  anonymous_session_id TEXT,
  essay_id UUID NOT NULL REFERENCES essays(id) ON DELETE CASCADE,
  context_sentence TEXT NOT NULL,
  blank_phrase TEXT NOT NULL,
  corrected_phrase TEXT NOT NULL,
  error_tag TEXT NOT NULL,
  interval INTEGER NOT NULL DEFAULT 1 CHECK (interval >= 1),
  efactor NUMERIC(4, 2) NOT NULL DEFAULT 2.50 CHECK (efactor >= 1.30),
  repetitions INTEGER NOT NULL DEFAULT 0 CHECK (repetitions >= 0),
  due_date TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. INDEXES
-- Performance and foreign key indexes (specifically slug, user_id, due_date as required)
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_code ON payments(order_code);

CREATE INDEX IF NOT EXISTS idx_essays_slug ON essays(slug);
CREATE INDEX IF NOT EXISTS idx_essays_user_id ON essays(user_id);
CREATE INDEX IF NOT EXISTS idx_essays_anonymous_session_id ON essays(anonymous_session_id);
CREATE INDEX IF NOT EXISTS idx_essays_is_public ON essays(is_public);

CREATE INDEX IF NOT EXISTS idx_mistakes_user_id ON mistakes(user_id);
CREATE INDEX IF NOT EXISTS idx_mistakes_essay_id ON mistakes(essay_id);
CREATE INDEX IF NOT EXISTS idx_mistakes_due_date ON mistakes(due_date);
CREATE INDEX IF NOT EXISTS idx_mistakes_user_due_date ON mistakes(user_id, due_date);

-- 7. ROW-LEVEL SECURITY (RLS) ENABLEMENT
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE essays ENABLE ROW LEVEL SECURITY;
ALTER TABLE mistakes ENABLE ROW LEVEL SECURITY;

-- 8. POLICIES: USERS
CREATE POLICY "Users can view their own profile"
  ON users FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id);

-- 9. POLICIES: PAYMENTS
CREATE POLICY "Users can view their own payments"
  ON payments FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own payments"
  ON payments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 10. POLICIES: ESSAYS
-- Policy 1: Public essay visibility for SEO
CREATE POLICY "Public essays are viewable by everyone"
  ON essays FOR SELECT
  USING (is_public = true);

-- Policy 2: User isolation (viewing own essays, including private ones)
CREATE POLICY "Users can view their own essays"
  ON essays FOR SELECT
  USING (auth.uid() = user_id);

-- Policy 3: Anonymous session handling
CREATE POLICY "Anonymous sessions can view their essays"
  ON essays FOR SELECT
  USING (
    user_id IS NULL AND
    anonymous_session_id IS NOT NULL AND
    anonymous_session_id = coalesce(current_setting('request.headers', true)::json->>'x-anonymous-session-id', '')
  );

-- Policy 4: Insertion by authenticated user or anonymous session
CREATE POLICY "Authenticated users or anonymous sessions can insert essays"
  ON essays FOR INSERT
  WITH CHECK (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR
    (auth.uid() IS NULL AND user_id IS NULL)
  );

-- Policy 5: Users can update their own essays
CREATE POLICY "Users can update their own essays"
  ON essays FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy 6: Anonymous data claiming on Google OAuth login
CREATE POLICY "Users can claim anonymous essays"
  ON essays FOR UPDATE
  USING (user_id IS NULL)
  WITH CHECK (auth.uid() = user_id);

-- 11. POLICIES: MISTAKES
-- Policy 1: User isolation
CREATE POLICY "Users can view their own mistakes"
  ON mistakes FOR SELECT
  USING (auth.uid() = user_id);

-- Policy 2: Public essay mistakes visibility for public SEO sample pages
CREATE POLICY "Public essay mistakes are viewable"
  ON mistakes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM essays
      WHERE essays.id = mistakes.essay_id AND essays.is_public = true
    )
  );

-- Policy 3: Anonymous session handling
CREATE POLICY "Anonymous sessions can view their mistakes"
  ON mistakes FOR SELECT
  USING (
    user_id IS NULL AND
    anonymous_session_id IS NOT NULL AND
    anonymous_session_id = coalesce(current_setting('request.headers', true)::json->>'x-anonymous-session-id', '')
  );

-- Policy 4: Insertion by authenticated user or anonymous session
CREATE POLICY "Users and anonymous sessions can insert mistakes"
  ON mistakes FOR INSERT
  WITH CHECK (
    (auth.uid() IS NOT NULL AND auth.uid() = user_id) OR
    (auth.uid() IS NULL AND user_id IS NULL)
  );

-- Policy 5: Users can update their own mistakes (SM-2 progression updates)
CREATE POLICY "Users can update their own mistakes"
  ON mistakes FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy 6: Anonymous data claiming on Google OAuth login
CREATE POLICY "Users can claim anonymous mistakes"
  ON mistakes FOR UPDATE
  USING (user_id IS NULL)
  WITH CHECK (auth.uid() = user_id);

-- 12. TRIGGERS: AUTOMATED UPDATED_AT TIMESTAMP
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_essays_updated_at
  BEFORE UPDATE ON essays
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_mistakes_updated_at
  BEFORE UPDATE ON mistakes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
