/* ============================================================
   NEXUS — Supabase Client
   supabase.js

   This file initializes the Supabase client using your project
   credentials stored in config.js (which you create locally
   and is never committed to Git).

   HOW IT WORKS:
   - Auth:      Supabase handles sign up, login, sessions
   - Database:  PostgreSQL via Supabase REST API
   - Realtime:  Live messages & notifications via WebSocket
   - Storage:   Avatar & post image uploads
   ============================================================ */

'use strict';

/* ----------------------------------------------------------
   CONFIG — loaded from config.js (see SETUP.md)
   ---------------------------------------------------------- */
// NEXUS_CONFIG is defined in config.js, which is gitignored.
// In production (Vercel), these come from Environment Variables
// injected at build time into a generated config.js.

const _cfg = window.NEXUS_CONFIG || {};

const SUPABASE_URL    = _cfg.SUPABASE_URL    || '';
const SUPABASE_ANON   = _cfg.SUPABASE_ANON   || '';

if (!SUPABASE_URL || !SUPABASE_ANON) {
  console.error(
    '[Nexus] Supabase credentials missing. ' +
    'Create config.js from config.example.js and fill in your keys.'
  );
}

/* ----------------------------------------------------------
   IMPORT SUPABASE CLIENT (loaded via CDN in index.html)
   ---------------------------------------------------------- */
// The global `supabase` object is provided by:
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>

const { createClient } = window.supabase;

/** The single Supabase client instance used across the entire app */
const db = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    autoRefreshToken:  true,
    persistSession:    true,
    detectSessionInUrl:true,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
  },
});

/* ----------------------------------------------------------
   AUTH HELPERS
   ---------------------------------------------------------- */

const Auth = {
  /**
   * Sign up a new user with email + password.
   * Also inserts a row into the `profiles` table.
   */
  async signUp(email, password, username, displayName) {
    const { data, error } = await db.auth.signUp({
      email,
      password,
      options: {
        data: { username, display_name: displayName },
      },
    });
    if (error) throw error;

    // Insert profile row (trigger also does this, belt-and-suspenders)
    if (data.user) {
      await db.from('profiles').upsert({
        id:           data.user.id,
        username:     username,
        display_name: displayName,
        avatar_seed:  username,
        created_at:   new Date().toISOString(),
      });
    }
    return data;
  },

  /**
   * Sign in with email + password.
   */
  async signIn(email, password) {
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  /**
   * Sign out the current user.
   */
  async signOut() {
    const { error } = await db.auth.signOut();
    if (error) throw error;
  },

  /**
   * Returns the currently logged-in user, or null.
   */
  async currentUser() {
    const { data: { user } } = await db.auth.getUser();
    return user;
  },

  /**
   * Returns the current session (has .access_token etc.)
   */
  async session() {
    const { data: { session } } = await db.auth.getSession();
    return session;
  },

  /**
   * Listen for auth state changes (login, logout, token refresh).
   * callback receives (event, session).
   */
  onAuthChange(callback) {
    return db.auth.onAuthStateChange(callback);
  },
};

/* ----------------------------------------------------------
   PROFILE HELPERS
   ---------------------------------------------------------- */

const Profiles = {
  async getById(userId) {
    const { data, error } = await db
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (error) throw error;
    return data;
  },

  async getByUsername(username) {
    const { data, error } = await db
      .from('profiles')
      .select('*')
      .eq('username', username)
      .single();
    if (error) throw error;
    return data;
  },

  async update(userId, fields) {
    const { data, error } = await db
      .from('profiles')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /** Upload avatar to Supabase Storage, return public URL */
  async uploadAvatar(userId, file) {
    const ext  = file.name.split('.').pop();
    const path = `${userId}/avatar.${ext}`;
    const { error: uploadErr } = await db.storage
      .from('avatars')
      .upload(path, file, { upsert: true });
    if (uploadErr) throw uploadErr;

    const { data } = db.storage.from('avatars').getPublicUrl(path);
    return data.publicUrl;
  },
};

/* ----------------------------------------------------------
   POSTS HELPERS
   ---------------------------------------------------------- */

const Posts = {
  /**
   * Fetch paginated feed posts.
   * @param {number} page  0-indexed page number
   * @param {number} limit rows per page (default 20)
   */
  async getFeed(page = 0, limit = 20) {
    const from = page * limit;
    const to   = from + limit - 1;

    const { data, error } = await db
      .from('posts')
      .select(`
        *,
        author:profiles!posts_author_id_fkey (
          id, username, display_name, avatar_url, avatar_seed
        ),
        likes_count:likes(count),
        comments_count:comments(count)
      `)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw error;
    return data;
  },

  /** Get a single post with full detail */
  async getById(postId) {
    const { data, error } = await db
      .from('posts')
      .select(`
        *,
        author:profiles!posts_author_id_fkey (
          id, username, display_name, avatar_url, avatar_seed
        )
      `)
      .eq('id', postId)
      .single();
    if (error) throw error;
    return data;
  },

  /** Create a new post */
  async create(authorId, body, imageUrl = null) {
    const { data, error } = await db
      .from('posts')
      .insert({
        author_id:  authorId,
        body,
        image_url:  imageUrl,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /** Toggle like on a post. Returns new liked state. */
  async toggleLike(postId, userId) {
    // Check if already liked
    const { data: existing } = await db
      .from('likes')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      await db.from('likes').delete().eq('id', existing.id);
      return false; // unliked
    } else {
      await db.from('likes').insert({ post_id: postId, user_id: userId });
      return true;  // liked
    }
  },

  /** Check which posts in an array the user has liked */
  async getLikedPostIds(userId, postIds) {
    const { data } = await db
      .from('likes')
      .select('post_id')
      .eq('user_id', userId)
      .in('post_id', postIds);
    return (data || []).map(r => r.post_id);
  },
};

/* ----------------------------------------------------------
   COMMENTS HELPERS
   ---------------------------------------------------------- */

const Comments = {
  async getForPost(postId) {
    const { data, error } = await db
      .from('comments')
      .select(`
        *,
        author:profiles!comments_author_id_fkey (
          id, username, display_name, avatar_url, avatar_seed
        )
      `)
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data;
  },

  async create(postId, authorId, body) {
    const { data, error } = await db
      .from('comments')
      .insert({
        post_id:    postId,
        author_id:  authorId,
        body,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};

/* ----------------------------------------------------------
   MESSAGES (REALTIME CHAT)
   ---------------------------------------------------------- */

const Messages = {
  /**
   * Fetch message history for a conversation.
   * A conversation is identified by a sorted pair of user IDs:
   * smaller_id:larger_id — keeps it symmetric.
   */
  async getHistory(conversationId, limit = 50) {
    const { data, error } = await db
      .from('messages')
      .select(`
        *,
        sender:profiles!messages_sender_id_fkey (
          id, username, display_name, avatar_url, avatar_seed
        )
      `)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(limit);
    if (error) throw error;
    return data;
  },

  /** Send a message */
  async send(conversationId, senderId, body, attachmentUrl = null) {
    const { data, error } = await db
      .from('messages')
      .insert({
        conversation_id: conversationId,
        sender_id:       senderId,
        body,
        attachment_url:  attachmentUrl,
        created_at:      new Date().toISOString(),
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /**
   * Subscribe to new messages in a conversation.
   * Returns the Supabase channel — call .unsubscribe() on cleanup.
   *
   * @param {string}   conversationId
   * @param {function} onNewMessage  called with each new message row
   */
  subscribe(conversationId, onNewMessage) {
    const channel = db
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        payload => onNewMessage(payload.new)
      )
      .subscribe();

    return channel;
  },

  /** Build a deterministic conversation ID from two user IDs */
  buildConversationId(userIdA, userIdB) {
    return [userIdA, userIdB].sort().join(':');
  },
};

/* ----------------------------------------------------------
   NOTIFICATIONS HELPERS
   ---------------------------------------------------------- */

const Notifications = {
  async getForUser(userId, limit = 30) {
    const { data, error } = await db
      .from('notifications')
      .select(`
        *,
        actor:profiles!notifications_actor_id_fkey (
          id, username, display_name, avatar_url, avatar_seed
        )
      `)
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  },

  async markRead(notificationId) {
    await db
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId);
  },

  async markAllRead(userId) {
    await db
      .from('notifications')
      .update({ read: true })
      .eq('recipient_id', userId);
  },

  /** Subscribe to new notifications for a user */
  subscribe(userId, onNew) {
    const channel = db
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'notifications',
          filter: `recipient_id=eq.${userId}`,
        },
        payload => onNew(payload.new)
      )
      .subscribe();

    return channel;
  },
};

/* ----------------------------------------------------------
   COMMUNITIES HELPERS
   ---------------------------------------------------------- */

const Communities = {
  async getAll() {
    const { data, error } = await db
      .from('communities')
      .select('*, member_count:community_members(count)')
      .order('member_count', { ascending: false });
    if (error) throw error;
    return data;
  },

  async getById(communityId) {
    const { data, error } = await db
      .from('communities')
      .select('*')
      .eq('id', communityId)
      .single();
    if (error) throw error;
    return data;
  },

  async toggleMembership(communityId, userId) {
    const { data: existing } = await db
      .from('community_members')
      .select('id')
      .eq('community_id', communityId)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      await db.from('community_members').delete().eq('id', existing.id);
      return false;
    } else {
      await db.from('community_members').insert({ community_id: communityId, user_id: userId });
      return true;
    }
  },

  async getMemberCommunityIds(userId) {
    const { data } = await db
      .from('community_members')
      .select('community_id')
      .eq('user_id', userId);
    return (data || []).map(r => r.community_id);
  },
};

/* ----------------------------------------------------------
   EXPORT — everything the rest of the app needs
   ---------------------------------------------------------- */
window.NexusDB = {
  client:        db,
  Auth,
  Profiles,
  Posts,
  Comments,
  Messages,
  Notifications,
  Communities,
};
