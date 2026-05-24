-- ============================================================
-- NEXUS — Supabase Database Schema
-- schema.sql
--
-- HOW TO USE:
--   1. Go to your Supabase project dashboard
--   2. Click "SQL Editor" in the left sidebar
--   3. Paste this entire file and click "Run"
--   4. All tables, policies, and triggers are created
-- ============================================================


-- ============================================================
-- EXTENSIONS
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ============================================================
-- PROFILES
-- One row per user. Linked to auth.users via id.
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username      TEXT        UNIQUE NOT NULL,
  display_name  TEXT        NOT NULL DEFAULT '',
  bio           TEXT        DEFAULT '',
  avatar_url    TEXT        DEFAULT '',
  avatar_seed   TEXT        DEFAULT '',    -- used for dicebear fallback
  website       TEXT        DEFAULT '',
  followers_count INT       DEFAULT 0,
  following_count INT       DEFAULT 0,
  posts_count   INT         DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile row when a new user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, avatar_seed)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username',  SPLIT_PART(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'display_name', SPLIT_PART(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'username',  SPLIT_PART(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ============================================================
-- POSTS
-- ============================================================
CREATE TABLE IF NOT EXISTS posts (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_id   UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body        TEXT        NOT NULL,
  image_url   TEXT        DEFAULT NULL,
  has_image   BOOLEAN     GENERATED ALWAYS AS (image_url IS NOT NULL) STORED,
  reposts     INT         DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS posts_author_id_idx  ON posts(author_id);
CREATE INDEX IF NOT EXISTS posts_created_at_idx ON posts(created_at DESC);


-- ============================================================
-- LIKES
-- ============================================================
CREATE TABLE IF NOT EXISTS likes (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id     UUID        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS likes_post_id_idx ON likes(post_id);
CREATE INDEX IF NOT EXISTS likes_user_id_idx ON likes(user_id);


-- ============================================================
-- COMMENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS comments (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id     UUID        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id   UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body        TEXT        NOT NULL,
  likes       INT         DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS comments_post_id_idx ON comments(post_id);


-- ============================================================
-- MESSAGES (direct messages)
-- ============================================================
CREATE TABLE IF NOT EXISTS messages (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id  TEXT        NOT NULL,  -- "uid_a:uid_b" sorted
  sender_id        UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body             TEXT,
  attachment_url   TEXT,
  read             BOOLEAN     DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS messages_conversation_id_idx ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS messages_sender_id_idx       ON messages(sender_id);
CREATE INDEX IF NOT EXISTS messages_created_at_idx      ON messages(created_at ASC);


-- ============================================================
-- COMMUNITIES
-- ============================================================
CREATE TABLE IF NOT EXISTS communities (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT        NOT NULL,
  description TEXT        DEFAULT '',
  emoji       TEXT        DEFAULT '👥',
  owner_id    UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- COMMUNITY MEMBERS
-- ============================================================
CREATE TABLE IF NOT EXISTS community_members (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  community_id UUID        NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id      UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  joined_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (community_id, user_id)
);

CREATE INDEX IF NOT EXISTS community_members_user_idx ON community_members(user_id);


-- ============================================================
-- FOLLOWS
-- ============================================================
CREATE TABLE IF NOT EXISTS follows (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  follower_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  following_id UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (follower_id, following_id)
);


-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_id UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  actor_id     UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  type         TEXT        NOT NULL,  -- 'like' | 'comment' | 'follow' | 'mention' | 'reply'
  body         TEXT        NOT NULL,
  post_id      UUID        REFERENCES posts(id) ON DELETE CASCADE,
  read         BOOLEAN     DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_recipient_idx ON notifications(recipient_id);
CREATE INDEX IF NOT EXISTS notifications_read_idx      ON notifications(read);


-- ============================================================
-- STORAGE BUCKETS
-- Run these separately if you want file uploads:
-- ============================================================
-- INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);
-- INSERT INTO storage.buckets (id, name, public) VALUES ('post-images', 'post-images', true);


-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Protects all tables so users can only access their own data
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE communities      ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows          ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications    ENABLE ROW LEVEL SECURITY;


-- ---- PROFILES policies ----
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;
CREATE POLICY "Profiles are viewable by everyone"
  ON profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);


-- ---- POSTS policies ----
DROP POLICY IF EXISTS "Posts are viewable by everyone" ON posts;
CREATE POLICY "Posts are viewable by everyone"
  ON posts FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can create posts" ON posts;
CREATE POLICY "Authenticated users can create posts"
  ON posts FOR INSERT WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "Authors can update their own posts" ON posts;
CREATE POLICY "Authors can update their own posts"
  ON posts FOR UPDATE USING (auth.uid() = author_id);

DROP POLICY IF EXISTS "Authors can delete their own posts" ON posts;
CREATE POLICY "Authors can delete their own posts"
  ON posts FOR DELETE USING (auth.uid() = author_id);


-- ---- LIKES policies ----
DROP POLICY IF EXISTS "Likes are viewable by everyone" ON likes;
CREATE POLICY "Likes are viewable by everyone"
  ON likes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can like" ON likes;
CREATE POLICY "Authenticated users can like"
  ON likes FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can unlike their own likes" ON likes;
CREATE POLICY "Users can unlike their own likes"
  ON likes FOR DELETE USING (auth.uid() = user_id);


-- ---- COMMENTS policies ----
DROP POLICY IF EXISTS "Comments are viewable by everyone" ON comments;
CREATE POLICY "Comments are viewable by everyone"
  ON comments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can comment" ON comments;
CREATE POLICY "Authenticated users can comment"
  ON comments FOR INSERT WITH CHECK (auth.uid() = author_id);

DROP POLICY IF EXISTS "Authors can delete their own comments" ON comments;
CREATE POLICY "Authors can delete their own comments"
  ON comments FOR DELETE USING (auth.uid() = author_id);


-- ---- MESSAGES policies ----
DROP POLICY IF EXISTS "Users can see their own messages" ON messages;
CREATE POLICY "Users can see their own messages"
  ON messages FOR SELECT
  USING (
    conversation_id LIKE '%' || auth.uid()::text || '%'
  );

DROP POLICY IF EXISTS "Authenticated users can send messages" ON messages;
CREATE POLICY "Authenticated users can send messages"
  ON messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id);


-- ---- COMMUNITIES policies ----
DROP POLICY IF EXISTS "Communities are viewable by everyone" ON communities;
CREATE POLICY "Communities are viewable by everyone"
  ON communities FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated users can create communities" ON communities;
CREATE POLICY "Authenticated users can create communities"
  ON communities FOR INSERT WITH CHECK (auth.uid() = owner_id);


-- ---- COMMUNITY MEMBERS policies ----
DROP POLICY IF EXISTS "Community members are viewable by everyone" ON community_members;
CREATE POLICY "Community members are viewable by everyone"
  ON community_members FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can join communities" ON community_members;
CREATE POLICY "Users can join communities"
  ON community_members FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can leave communities" ON community_members;
CREATE POLICY "Users can leave communities"
  ON community_members FOR DELETE USING (auth.uid() = user_id);


-- ---- FOLLOWS policies ----
DROP POLICY IF EXISTS "Follows are viewable by everyone" ON follows;
CREATE POLICY "Follows are viewable by everyone"
  ON follows FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can follow others" ON follows;
CREATE POLICY "Users can follow others"
  ON follows FOR INSERT WITH CHECK (auth.uid() = follower_id);

DROP POLICY IF EXISTS "Users can unfollow" ON follows;
CREATE POLICY "Users can unfollow"
  ON follows FOR DELETE USING (auth.uid() = follower_id);


-- ---- NOTIFICATIONS policies ----
DROP POLICY IF EXISTS "Users can see their own notifications" ON notifications;
CREATE POLICY "Users can see their own notifications"
  ON notifications FOR SELECT USING (auth.uid() = recipient_id);

DROP POLICY IF EXISTS "System can create notifications" ON notifications;
CREATE POLICY "System can create notifications"
  ON notifications FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can mark their notifications as read" ON notifications;
CREATE POLICY "Users can mark their notifications as read"
  ON notifications FOR UPDATE USING (auth.uid() = recipient_id);


-- ============================================================
-- REALTIME — enable realtime for these tables
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;


-- ============================================================
-- SEED DATA (optional — remove if you don't want sample data)
-- ============================================================
-- INSERT INTO communities (name, description, emoji)
-- VALUES
--   ('Design Hub',     'A community for designers to share, learn and grow together.', '🪐'),
--   ('Tech Talk',      'All things engineering and technology.',                        '💬'),
--   ('Startup Lounge', 'Founders, builders and dreamers.',                              '🚀'),
--   ('Creative Circle','Art, illustration, and visual creation.',                       '🎨'),
--   ('AI Explorers',   'Everything artificial intelligence.',                           '🤖');
