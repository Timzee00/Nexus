/* ============================================================
   NEXUS — Application Logic  v2.0
   app.js

   Architecture:
   ┌─────────────────────────────────────────────────────────┐
   │  State        — single source of truth (AppState)       │
   │  Auth Layer   — Supabase auth, session persistence      │
   │  Data Layer   — Supabase queries (with mock fallback)   │
   │  Router       — view state machine + history stack      │
   │  Renderers    — pure DOM writers, no side effects       │
   │  Handlers     — user interaction callbacks              │
   │  Realtime     — WebSocket subscriptions (messages)      │
   └─────────────────────────────────────────────────────────┘
   ============================================================ */

'use strict';

/* ============================================================
   APP STATE — single mutable object, never spread across globals
   ============================================================ */
const AppState = {
  currentUser:   null,   // Supabase auth user
  profile:       null,   // profiles table row for currentUser
  supabaseReady: false,  // true once client confirms credentials exist
  realtimeChannels: [],  // active subscriptions to clean up

  /* local caches (populated on demand) */
  posts:          [],
  chats:          [],
  communities:    [],
  notifications:  [],
  likedPostIds:   new Set(),
};

/* ============================================================
   MOCK DATA — fallback when Supabase is not configured yet
   All shapes match the Supabase schema exactly.
   ============================================================ */
const MockDB = {
  users: [
    { id: 'u1', username: 'tolu_creates', display_name: 'Tolu A.',    avatar_seed: 'tolu&backgroundColor=b6e3f4',  bio: 'Product designer & community builder.', followers_count: 2500, following_count: 320, posts_count: 128 },
    { id: 'u2', username: 'ada.designs',  display_name: 'Ada E.',     avatar_seed: 'ada&backgroundColor=c0aede',   bio: 'UI/UX designer. Coffee enthusiast.' },
    { id: 'u3', username: 'mike.builds',  display_name: 'Mike',       avatar_seed: 'mike&backgroundColor=d1f4cc',  bio: 'Full-stack builder.' },
    { id: 'u4', username: 'emma_d',       display_name: 'Emma D.',    avatar_seed: 'emma&backgroundColor=ffd5dc',  bio: 'Community manager.' },
    { id: 'u5', username: 'sophie_ui',    display_name: 'Sophie',     avatar_seed: 'sophie&backgroundColor=ffe4b5',bio: 'Frontend developer.' },
    { id: 'u6', username: 'designhub',    display_name: 'Design Hub', avatar_seed: 'hub&backgroundColor=b8d4ff',   bio: 'A community for designers.' },
    { id: 'u7', username: 'alex_builds',  display_name: 'Alex',       avatar_seed: 'alex&backgroundColor=c8f7c5',  bio: 'Mobile developer.' },
  ],
  posts: [
    { id: 'p1', author_id: 'u1', body: 'Just launched my new illustration pack!\nCheck it out and let me know what you think.', has_image: true, image_count: 5, likes_count: [{count:128}], comments_count: [{count:36}], reposts: 12, created_at: new Date(Date.now()-7200000).toISOString() },
    { id: 'p2', author_id: 'u6', body: 'Best fonts for modern UI design 👇',                                                      has_image: false, likes_count: [{count:84}],  comments_count: [{count:21}],  reposts: 30, created_at: new Date(Date.now()-14400000).toISOString() },
    { id: 'p3', author_id: 'u2', body: 'Color theory resources for beginners? Drop your favourites below 🎨',                      has_image: false, likes_count: [{count:61}],  comments_count: [{count:18}],  reposts: 7,  created_at: new Date(Date.now()-21600000).toISOString() },
    { id: 'p4', author_id: 'u3', body: 'Just shipped a new feature for our dashboard. Real-time charts using Canvas API — no lib needed. Performance is wild 🔥', has_image: false, likes_count: [{count:203}], comments_count: [{count:44}], reposts: 58, created_at: new Date(Date.now()-28800000).toISOString() },
    { id: 'p5', author_id: 'u4', body: 'Design critique session this Friday at 4PM UTC — join Design Hub and comment to get your work reviewed live!',            has_image: false, likes_count: [{count:45}],  comments_count: [{count:9}],   reposts: 14, created_at: new Date(Date.now()-36000000).toISOString() },
  ],
  comments: {
    p1: [
      { id: 'cm1', author_id: 'u2', body: 'Looks amazing! 🔥',                       created_at: new Date(Date.now()-3600000).toISOString(),  likes: 12 },
      { id: 'cm2', author_id: 'u5', body: 'This is fire, where can I download it?',  created_at: new Date(Date.now()-2700000).toISOString(),  likes: 4  },
      { id: 'cm3', author_id: 'u3', body: 'Been waiting for this drop 🙌',           created_at: new Date(Date.now()-1800000).toISOString(),  likes: 7  },
    ],
    p2: [
      { id: 'cm4', author_id: 'u4', body: 'Syne + DM Sans is underrated 🔥', created_at: new Date(Date.now()-10800000).toISOString(), likes: 18 },
    ],
  },
  chats: [
    { id: 'c1', peerId: 'u2', last_message: 'Hey! How\'s it going?', last_message_at: new Date(Date.now()-1800000).toISOString(), unread: 2, is_online: true  },
    { id: 'c3', peerId: 'u3', last_message: 'Voice message',          last_message_at: new Date(Date.now()-3600000).toISOString(), unread: 0, is_online: false },
    { id: 'c5', peerId: 'u7', last_message: 'Thanks! 🙌',            last_message_at: new Date(Date.now()-86400000).toISOString(),unread: 0 },
  ],
  messages: {
    c1: [
      { id: 'm1', sender_id: 'u2', mine: false, body: 'Hey! How\'s it going?',                     created_at: new Date(Date.now()-3600000).toISOString() },
      { id: 'm2', sender_id: 'u1', mine: true,  body: 'Pretty good! Just working on a new project.',created_at: new Date(Date.now()-3540000).toISOString() },
      { id: 'm3', sender_id: 'u2', mine: false, body: 'Nice! Can\'t wait to see it.',              created_at: new Date(Date.now()-3480000).toISOString() },
      { id: 'm4', sender_id: 'u1', mine: true,  body: 'Looks awesome 🔥',                          created_at: new Date(Date.now()-3420000).toISOString() },
    ],
  },
  communities: [
    { id: 'cm1', name: 'Design Hub',     member_count: [{count:12800}], emoji: '🪐', joined: true  },
    { id: 'cm2', name: 'Tech Talk',      member_count: [{count:8400}],  emoji: '💬', joined: false },
    { id: 'cm3', name: 'Startup Lounge', member_count: [{count:5200}],  emoji: '🚀', joined: false },
    { id: 'cm4', name: 'Creative Circle',member_count: [{count:9100}],  emoji: '🎨', joined: true  },
    { id: 'cm5', name: 'AI Explorers',   member_count: [{count:7300}],  emoji: '🤖', joined: false },
  ],
  notifications: [
    { id: 'n1', type: 'like',    actor_id: 'u2', body: 'liked your post.',       created_at: new Date(Date.now()-120000).toISOString(),   read: false },
    { id: 'n2', type: 'comment', actor_id: 'u3', body: 'commented on your post.',created_at: new Date(Date.now()-300000).toISOString(),   read: false },
    { id: 'n3', type: 'mention', actor_id: 'u6', body: 'mentioned you.',         created_at: new Date(Date.now()-900000).toISOString(),   read: false },
    { id: 'n4', type: 'reply',   actor_id: 'u7', body: 'replied to your comment.',created_at: new Date(Date.now()-1800000).toISOString(), read: true  },
    { id: 'n5', type: 'follow',  actor_id: 'u5', body: 'started following you.', created_at: new Date(Date.now()-3600000).toISOString(), read: true  },
  ],
  trending: [
    { tag: 'DesignInspo', posts: '24.5K posts' },
    { tag: 'StartupLife', posts: '18.2K posts' },
    { tag: 'AIRevolution',posts: '15.7K posts' },
    { tag: 'UIDesign',    posts: '12.1K posts' },
  ],
  transactions: [
    { id: 't1', name: 'Tolu A.',     peer_id: 'u1', type: 'Payment received', amount: '+$50.00', positive: true,  date: 'Today'     },
    { id: 't2', name: 'Design Hub',  peer_id: 'u6', type: 'Membership',       amount: '-$8.00',  positive: false, date: 'Yesterday' },
    { id: 't3', name: 'Ada E.',      peer_id: 'u2', type: 'Payment received', amount: '+$20.00', positive: true,  date: '2 days ago'},
    { id: 't4', name: 'Mobile Top Up', emoji: '📱',  type: 'Top up',          amount: '-$10.00', positive: false, date: '2 days ago'},
  ],
};

/* ============================================================
   UTILITIES
   ============================================================ */
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/\n/g, '<br>');
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.substring(0, len) + '…' : str;
}

function timeAgo(isoString) {
  if (!isoString) return '';
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60)    return `${diff}s`;
  if (diff < 3600)  return `${Math.floor(diff/60)}m`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h`;
  return `${Math.floor(diff/86400)}d`;
}

function nowStr() {
  return new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function avatarURL(seed) {
  if (!seed) return `https://api.dicebear.com/8.x/avataaars/svg?seed=default`;
  return `https://api.dicebear.com/8.x/avataaars/svg?seed=${seed}`;
}

function getMockUser(id) {
  return MockDB.users.find(u => u.id === id) || {};
}

function getMockUserDisplay(id) {
  const u = getMockUser(id);
  return { name: u.display_name || 'Unknown', handle: u.username || 'unknown', seed: u.avatar_seed || 'default' };
}

/** Format large numbers: 12800 → "12.8K" */
function fmtCount(n) {
  if (n >= 1000000) return (n/1000000).toFixed(1).replace('.0','') + 'M';
  if (n >= 1000)    return (n/1000).toFixed(1).replace('.0','')    + 'K';
  return String(n);
}

/* ============================================================
   TOAST
   ============================================================ */
let _toastTimer = null;
function toast(msg, type = 'default') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = `toast show ${type}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

/* ============================================================
   MODAL SYSTEM
   ============================================================ */
function openModal(id) {
  document.getElementById(id)?.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
  document.body.style.overflow = '';
}
function openStory(name) {
  document.getElementById('story-name').textContent = name;
  const bar = document.getElementById('story-progress-bar');
  bar.style.animation = 'none';
  void bar.offsetWidth;
  bar.style.animation = '';
  openModal('story-modal');
  setTimeout(() => closeStory(), 5200);
}
function closeStory() { closeModal('story-modal'); }

/* ============================================================
   AUTH UI HELPERS
   ============================================================ */
function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`tab-${tab}`)?.classList.add('active');
  document.getElementById('form-login').style.display   = tab === 'login'  ? 'flex' : 'none';
  document.getElementById('form-signup').style.display  = tab === 'signup' ? 'flex' : 'none';
  document.getElementById('form-confirm').style.display = 'none';
}

function setAuthLoading(formId, btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.classList.toggle('btn-loading', loading);
  btn.disabled = loading;
}

function showAuthError(formId, msg) {
  const el = document.getElementById(`${formId}-error`);
  if (!el) return;
  el.textContent = msg;
  el.style.display = msg ? 'block' : 'none';
}

/* ============================================================
   AUTH HANDLERS
   ============================================================ */
async function handleLogin() {
  const email    = document.getElementById('login-email')?.value.trim();
  const password = document.getElementById('login-password')?.value;
  showAuthError('login', '');

  if (!email || !password) { showAuthError('login', 'Email and password are required.'); return; }

  setAuthLoading('login', 'login-btn', true);

  if (!AppState.supabaseReady) {
    // Demo mode — skip real auth
    toast('Demo mode: Supabase not configured. Entering app…');
    setAuthLoading('login', 'login-btn', false);
    enterApp(null, { id: 'u1', username: 'tolu_creates', display_name: 'Tolu A.', avatar_seed: 'tolu&backgroundColor=b6e3f4' });
    return;
  }

  try {
    const { user } = await window.NexusDB.Auth.signIn(email, password);
    const profile  = await window.NexusDB.Profiles.getById(user.id);
    enterApp(user, profile);
  } catch (err) {
    showAuthError('login', err.message || 'Login failed. Check your credentials.');
  } finally {
    setAuthLoading('login', 'login-btn', false);
  }
}

async function handleSignUp() {
  const name     = document.getElementById('signup-name')?.value.trim();
  const username = document.getElementById('signup-username')?.value.trim().toLowerCase().replace(/[^a-z0-9_.]/g, '');
  const email    = document.getElementById('signup-email')?.value.trim();
  const password = document.getElementById('signup-password')?.value;
  showAuthError('signup', '');

  if (!name || !username || !email || !password) { showAuthError('signup', 'All fields are required.'); return; }
  if (password.length < 8) { showAuthError('signup', 'Password must be at least 8 characters.'); return; }
  if (username.length < 3) { showAuthError('signup', 'Username must be at least 3 characters.'); return; }

  setAuthLoading('signup', 'signup-btn', true);

  if (!AppState.supabaseReady) {
    toast('Demo mode: Supabase not configured. Entering app…');
    setAuthLoading('signup', 'signup-btn', false);
    enterApp(null, { id: 'u1', username, display_name: name, avatar_seed: username });
    return;
  }

  try {
    await window.NexusDB.Auth.signUp(email, password, username, name);
    document.getElementById('confirm-email-display').textContent = email;
    document.getElementById('form-signup').style.display  = 'none';
    document.getElementById('form-confirm').style.display = 'flex';
  } catch (err) {
    showAuthError('signup', err.message || 'Sign up failed. Try a different email.');
  } finally {
    setAuthLoading('signup', 'signup-btn', false);
  }
}

/* ============================================================
   APP ENTRY / EXIT
   ============================================================ */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
}

function enterApp(user, profile) {
  AppState.currentUser = user;
  AppState.profile     = profile;

  // Update topbar profile avatar
  updateTopbarUser(profile);

  showScreen('screen-app');
  Router.navigateTo('home');

  // Start realtime subscriptions if Supabase is ready
  if (AppState.supabaseReady && user) {
    startRealtimeSubscriptions(user.id);
  }
}

function updateTopbarUser(profile) {
  const actions = document.querySelector('.topbar-actions');
  if (!actions) return;
  // Remove existing avatar if any
  document.getElementById('topbar-user-avatar')?.remove();
  if (!profile) return;
  const div = document.createElement('div');
  div.id = 'topbar-user-avatar';
  div.className = 'user-avatar-topbar';
  div.title = profile.display_name;
  div.onclick = () => goTo('profile');
  div.innerHTML = `<img src="${avatarURL(profile.avatar_seed)}" alt="${profile.display_name}" />`;
  actions.prepend(div);
}

async function handleLogout() {
  // Cleanup realtime
  AppState.realtimeChannels.forEach(ch => ch.unsubscribe?.());
  AppState.realtimeChannels = [];

  if (AppState.supabaseReady && AppState.currentUser) {
    try { await window.NexusDB.Auth.signOut(); } catch(_) {}
  }

  AppState.currentUser  = null;
  AppState.profile      = null;
  AppState.posts        = [];
  AppState.likedPostIds = new Set();

  showScreen('screen-splash');
}

/* ============================================================
   REALTIME SUBSCRIPTIONS
   ============================================================ */
function startRealtimeSubscriptions(userId) {
  // Notification subscription
  const notifChannel = window.NexusDB.Notifications.subscribe(userId, (newNotif) => {
    AppState.notifications.unshift(newNotif);
    // Update badge
    const badge = document.querySelector('.notif-btn .badge');
    if (badge) {
      const count = parseInt(badge.textContent || '0') + 1;
      badge.textContent = count;
    }
    toast(`🔔 New notification`);
  });
  AppState.realtimeChannels.push(notifChannel);
}

/* ============================================================
   ROUTER — View state machine
   ============================================================ */
const Router = (() => {
  const viewMap = {
    home:              { viewId: 'view-home',             title: '☰ Home',           showBack: false },
    chats:             { viewId: 'view-chats',            title: '💬 Chats',          showBack: false },
    communities:       { viewId: 'view-communities',      title: '👥 Communities',    showBack: false },
    notifications:     { viewId: 'view-notifications',    title: '🔔 Notifications',  showBack: true  },
    profile:           { viewId: 'view-profile',          title: '👤 Profile',        showBack: false },
    search:            { viewId: 'view-search',           title: 'Search',            showBack: true  },
    wallet:            { viewId: 'view-wallet',           title: '💳 Wallet',         showBack: true  },
    'community-detail':{ viewId: 'view-community-detail', title: '',                  showBack: true  },
    'post-detail':     { viewId: 'view-post-detail',      title: 'Post',              showBack: true  },
    'create-post':     { viewId: 'view-create-post',      title: '✏️ Create Post',   showBack: true  },
    'chat-detail':     { viewId: 'view-chat-detail',      title: '...',               showBack: true  },
    settings:          { viewId: 'view-settings',         title: '⚙️ Settings',      showBack: true  },
  };

  let _current   = null;
  const _history = [];

  function navigateTo(viewName, params = {}) {
    const config = viewMap[viewName];
    if (!config) { console.warn(`[Router] Unknown view: ${viewName}`); return; }

    if (_current) _history.push(_current);
    _current = { name: viewName, params };

    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(config.viewId);
    if (target) target.classList.add('active');

    const titleEl = document.getElementById('topbar-title');
    if (titleEl) titleEl.innerHTML = `<span>${config.title}</span>`;

    const backBtn = document.getElementById('topbar-back');
    if (backBtn) backBtn.style.display = config.showBack ? 'flex' : 'none';

    const searchBtn = document.getElementById('topbar-search-btn');
    if (searchBtn) searchBtn.style.display = viewName === 'home' ? 'flex' : 'none';

    document.querySelectorAll('.nav-btn[data-view]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    Initializers[viewName]?.(params);
    target?.scrollTo({ top: 0, behavior: 'instant' });
  }

  function back() {
    if (_history.length > 0) {
      const prev = _history.pop();
      navigateTo(prev.name, prev.params);
    } else {
      navigateTo('home');
    }
  }

  return { navigateTo, back, current: () => _current };
})();

/* ============================================================
   VIEW INITIALIZERS
   ============================================================ */
const Initializers = {
  home()                        { loadAndRenderFeed(); },
  chats()                       { loadAndRenderChats(); },
  communities()                 { loadAndRenderCommunities(); },
  notifications()               { loadAndRenderNotifications(); },
  profile()                     { renderProfile(); renderProfileFeed(); },
  search()                      { renderSearchDefaults(); },
  wallet()                      { renderWallet(); },
  'community-detail'(params)    { renderCommunityDetail(params); },
  'post-detail'(params)         { loadAndRenderPostDetail(params); },
  'create-post'()               { setTimeout(() => document.getElementById('post-textarea')?.focus(), 300); },
  'chat-detail'(params)         { loadAndRenderChatDetail(params); },
  settings()                    {},
};

/* ============================================================
   DATA LOADERS — Try Supabase, fall back to MockDB
   ============================================================ */

async function loadAndRenderFeed() {
  const container = document.getElementById('feed-container');
  if (!container) return;
  container.innerHTML = `<div class="feed-loading">Loading…</div>`;

  let posts = [];
  if (AppState.supabaseReady) {
    try {
      posts = await window.NexusDB.Posts.getFeed(0, 20);
      // Enrich with liked state
      if (AppState.currentUser) {
        const likedIds = await window.NexusDB.Posts.getLikedPostIds(
          AppState.currentUser.id,
          posts.map(p => p.id)
        );
        AppState.likedPostIds = new Set(likedIds);
      }
    } catch (err) {
      console.warn('[Feed] Supabase fetch failed, using mock:', err.message);
      posts = buildMockFeedPosts();
    }
  } else {
    posts = buildMockFeedPosts();
  }

  AppState.posts = posts;
  container.innerHTML = posts.map((post, i) => buildPostCard(post, i)).join('') ||
    '<p style="padding:24px;color:var(--text-muted);text-align:center">No posts yet. Be the first!</p>';
}

function buildMockFeedPosts() {
  return MockDB.posts.map(p => {
    const u = getMockUser(p.author_id);
    return {
      ...p,
      author: { id: u.id, username: u.username, display_name: u.display_name, avatar_seed: u.avatar_seed },
      _likes:    p.likes_count?.[0]?.count ?? 0,
      _comments: p.comments_count?.[0]?.count ?? 0,
    };
  });
}

async function loadAndRenderChats() {
  // For now always use mock (full chat system needs conversation table)
  renderChatList(MockDB.chats);
}

async function loadAndRenderCommunities() {
  let communities = MockDB.communities;
  if (AppState.supabaseReady) {
    try {
      const rows = await window.NexusDB.Communities.getAll();
      if (AppState.currentUser) {
        const joined = await window.NexusDB.Communities.getMemberCommunityIds(AppState.currentUser.id);
        const joinedSet = new Set(joined);
        communities = rows.map(c => ({ ...c, joined: joinedSet.has(c.id), _count: c.member_count?.[0]?.count ?? 0 }));
      } else {
        communities = rows.map(c => ({ ...c, _count: c.member_count?.[0]?.count ?? 0 }));
      }
    } catch (err) {
      console.warn('[Communities] using mock:', err.message);
    }
  }
  AppState.communities = communities;
  renderCommunityList(communities);
}

async function loadAndRenderNotifications() {
  let notifs = MockDB.notifications;
  if (AppState.supabaseReady && AppState.currentUser) {
    try {
      notifs = await window.NexusDB.Notifications.getForUser(AppState.currentUser.id);
    } catch (err) {
      console.warn('[Notifs] using mock:', err.message);
    }
  }
  AppState.notifications = notifs;
  renderNotifications(notifs);
}

async function loadAndRenderPostDetail(params) {
  const { postId } = params;
  let post = AppState.posts.find(p => p.id === postId);

  if (!post && AppState.supabaseReady) {
    try { post = await window.NexusDB.Posts.getById(postId); } catch(_) {}
  }
  if (!post) {
    const raw = MockDB.posts.find(p => p.id === postId);
    if (raw) post = buildMockFeedPosts().find(p => p.id === postId);
  }

  if (!post) { toast('Post not found'); Router.back(); return; }

  // Comments
  let comments = MockDB.comments[postId] || [];
  if (AppState.supabaseReady) {
    try { comments = await window.NexusDB.Comments.getForPost(postId); } catch(_) {}
  }

  renderPostDetail(post, comments);
}

async function loadAndRenderChatDetail(params) {
  const { chatId } = params;
  const messages = MockDB.messages[chatId] || [];
  renderChatDetail(params, messages);

  // If Supabase ready, subscribe to real messages
  if (AppState.supabaseReady && AppState.currentUser) {
    const convId = params.conversationId || chatId;
    const ch = window.NexusDB.Messages.subscribe(convId, (msg) => {
      if (Router.current()?.name === 'chat-detail') {
        appendMessageBubble(msg, AppState.currentUser.id);
      }
    });
    // Replace previous subscription
    AppState.realtimeChannels = AppState.realtimeChannels.filter(c => {
      if (c._topic?.includes('messages:')) { c.unsubscribe?.(); return false; }
      return true;
    });
    AppState.realtimeChannels.push(ch);
  }
}

/* ============================================================
   RENDER FUNCTIONS
   ============================================================ */

// ---- POST CARD ----
function buildPostCard(post, index = 0) {
  const author   = post.author || { display_name: 'Unknown', username: 'unknown', avatar_seed: 'default' };
  const likes    = post._likes    ?? post.likes_count?.[0]?.count ?? post.likes ?? 0;
  const comments = post._comments ?? post.comments_count?.[0]?.count ?? post.comments ?? 0;
  const reposts  = post.reposts   ?? 0;
  const liked    = AppState.likedPostIds.has(post.id);
  const delay    = index * 55;

  const imageHTML = post.has_image ? `
    <div class="post-image">
      <div class="post-image-placeholder">
        <span class="post-image-count">${post.image_count || ''} images</span>
      </div>
    </div>` : '';

  return `
    <article class="post-card" style="animation-delay:${delay}ms" onclick="openPost('${post.id}')">
      <div class="post-header">
        <div class="post-avatar">
          <img src="${avatarURL(author.avatar_seed)}" alt="${escapeHTML(author.display_name)}" loading="lazy" />
        </div>
        <div class="post-author-info">
          <div class="post-author-name">${escapeHTML(author.display_name)}</div>
          <div class="post-author-meta">@${escapeHTML(author.username)} · ${timeAgo(post.created_at)}</div>
        </div>
        <button class="icon-btn post-more" onclick="event.stopPropagation(); postMenu('${post.id}')">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
        </button>
      </div>
      <p class="post-body">${escapeHTML(post.body)}</p>
      ${imageHTML}
      <div class="post-actions">
        <button class="post-action-btn ${liked ? 'liked' : ''}" data-post-id="${post.id}" onclick="event.stopPropagation(); toggleLike('${post.id}', this)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="${liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
          <span id="likes-${post.id}">${fmtCount(likes)}</span>
        </button>
        <button class="post-action-btn" onclick="event.stopPropagation(); openPost('${post.id}')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          <span>${fmtCount(comments)}</span>
        </button>
        <button class="post-action-btn" onclick="event.stopPropagation(); doRepost('${post.id}', this)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>
          <span id="reposts-${post.id}">${fmtCount(reposts)}</span>
        </button>
        <button class="post-action-btn post-action-bookmark" onclick="event.stopPropagation(); toggleBookmark('${post.id}', this)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
        </button>
      </div>
    </article>`;
}

// ---- FEED TAB SWITCH ----
function switchFeedTab(btn) {
  document.querySelectorAll('.feed-tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
}

// ---- POST INTERACTIONS ----
async function toggleLike(postId, btn) {
  const likedNow = AppState.likedPostIds.has(postId);
  const countEl  = document.getElementById(`likes-${postId}`);
  const svg      = btn.querySelector('svg');
  const span     = btn.querySelector('span');

  // Optimistic UI update
  if (likedNow) {
    AppState.likedPostIds.delete(postId);
    btn.classList.remove('liked');
    svg.setAttribute('fill', 'none');
    if (countEl) countEl.textContent = fmtCount(Math.max(0, parseInt(countEl.textContent.replace(/[KM]/,'')) - 1));
  } else {
    AppState.likedPostIds.add(postId);
    btn.classList.add('liked');
    svg.setAttribute('fill', 'currentColor');
  }

  if (AppState.supabaseReady && AppState.currentUser) {
    try {
      await window.NexusDB.Posts.toggleLike(postId, AppState.currentUser.id);
    } catch (err) {
      // Rollback on failure
      if (likedNow) AppState.likedPostIds.add(postId);
      else AppState.likedPostIds.delete(postId);
      toast('Could not update like. Try again.');
    }
  }
}

function doRepost(postId, btn) {
  const span = btn.querySelector('span');
  toast('Reposted! 🔁');
}

function toggleBookmark(postId, btn) {
  const svg = btn.querySelector('svg');
  const filled = svg.getAttribute('fill') === 'currentColor';
  svg.setAttribute('fill', filled ? 'none' : 'currentColor');
  btn.classList.toggle('liked', !filled);
  toast(filled ? 'Removed from saved' : 'Post saved ✓');
}

function openPost(postId)  { Router.navigateTo('post-detail', { postId }); }
function postMenu(postId)  { toast('Post options'); }

// ---- CHAT LIST ----
function renderChatList(chats) {
  const container = document.getElementById('chat-list');
  if (!container) return;
  container.innerHTML = chats.map(chat => {
    const peer = getMockUser(chat.peerId);
    const name  = peer.display_name || 'Unknown';
    const seed  = peer.avatar_seed   || 'default';
    return `
      <div class="chat-item" onclick="openChat('${chat.id}', '${escapeHTML(name)}', '${chat.peerId || ''}')">
        <div class="chat-avatar">
          <img src="${avatarURL(seed)}" alt="${escapeHTML(name)}" loading="lazy" />
          ${chat.is_online ? '<div class="online-indicator"></div>' : ''}
        </div>
        <div class="chat-info">
          <div class="chat-name">${escapeHTML(name)}</div>
          <div class="chat-preview">${escapeHTML(chat.last_message || chat.lastMsg || '')}</div>
        </div>
        <div class="chat-meta">
          <span class="chat-time">${timeAgo(chat.last_message_at) || ''}</span>
          ${chat.unread > 0 ? `<span class="chat-unread">${chat.unread}</span>` : ''}
        </div>
      </div>`;
  }).join('');
}

function filterChats(query) {
  const q = query.toLowerCase();
  const filtered = q
    ? MockDB.chats.filter(c => getMockUser(c.peerId).display_name?.toLowerCase().includes(q))
    : MockDB.chats;
  renderChatList(filtered);
}

function openChat(chatId, name, peerId) {
  let conversationId = chatId;
  if (AppState.currentUser && peerId) {
    conversationId = window.NexusDB?.Messages.buildConversationId(AppState.currentUser.id, peerId) || chatId;
  }
  Router.navigateTo('chat-detail', { chatId, name, peerId, conversationId });
}

// ---- CHAT DETAIL ----
function renderChatDetail(params, messages) {
  const { name, peerId } = params;
  const peer = getMockUser(peerId || '');

  // Update topbar
  const titleEl = document.getElementById('topbar-title');
  if (titleEl && (peer.display_name || name)) {
    const n = peer.display_name || name;
    titleEl.innerHTML = `
      <img src="${avatarURL(peer.avatar_seed || 'default')}" style="width:32px;height:32px;border-radius:50%;border:2px solid var(--border)" alt="${escapeHTML(n)}" />
      <div><div style="font-size:0.9rem;font-weight:700">${escapeHTML(n)}</div><div style="font-size:0.72rem;color:var(--green)">Online</div></div>`;
  }

  const area = document.getElementById('messages-area');
  if (!area) return;
  area.innerHTML = messages.map(msg => buildMessageBubble(msg)).join('');
  area.scrollTop = area.scrollHeight;
}

function buildMessageBubble(msg) {
  const isMine = msg.mine ?? (msg.sender_id === AppState.currentUser?.id);
  if (msg.attachment_url || msg.attachment) {
    const att = msg.attachment || { name: 'file', size: '' };
    return `
      <div class="message-bubble ${isMine ? 'mine' : 'theirs'}">
        <div class="bubble-attachment">
          <span class="file-icon">🖼️</span>
          <div class="file-info">
            <div class="file-name">${escapeHTML(att.name)}</div>
            <div class="file-size">${att.size || ''}</div>
          </div>
        </div>
        <div class="bubble-time">${timeAgo(msg.created_at) || nowStr()} ${isMine ? '<span class="tick">✓✓</span>' : ''}</div>
      </div>`;
  }
  return `
    <div class="message-bubble ${isMine ? 'mine' : 'theirs'}">
      <div class="bubble-text">${escapeHTML(msg.body || msg.text || '')}</div>
      <div class="bubble-time">${timeAgo(msg.created_at) || nowStr()} ${isMine ? '<span class="tick">✓✓</span>' : ''}</div>
    </div>`;
}

function appendMessageBubble(msg, myId) {
  const area = document.getElementById('messages-area');
  if (!area) return;
  area.insertAdjacentHTML('beforeend', buildMessageBubble({ ...msg, mine: msg.sender_id === myId }));
  area.scrollTop = area.scrollHeight;
}

async function sendMessage() {
  const input = document.getElementById('msg-input');
  const body  = input?.value.trim();
  if (!body) return;
  input.value = '';

  const params = Router.current()?.params || {};
  const { chatId, conversationId } = params;

  // Optimistic bubble
  const tempMsg = { body, mine: true, created_at: new Date().toISOString() };
  appendMessageBubble(tempMsg, AppState.currentUser?.id);

  if (AppState.supabaseReady && AppState.currentUser) {
    try {
      await window.NexusDB.Messages.send(conversationId || chatId, AppState.currentUser.id, body);
    } catch (err) {
      toast('Message failed to send. Check your connection.');
    }
  } else {
    // Mock: simulate reply
    setTimeout(() => {
      const replies = ['Sounds great! 🙌', 'Nice!', 'Tell me more 👀', 'On it!', 'Let\'s go 🔥'];
      const reply = { body: replies[Math.floor(Math.random()*replies.length)], mine: false, created_at: new Date().toISOString() };
      appendMessageBubble(reply, 'nobody');
    }, 1000 + Math.random() * 800);
  }
}

// ---- COMMUNITY LIST ----
function renderCommunityList(communities) {
  const container = document.getElementById('community-list');
  if (!container) return;
  container.innerHTML = communities.map(c => {
    const count = c._count ?? c.member_count?.[0]?.count ?? 0;
    return `
      <div class="community-item" onclick="openCommunity('${c.id}')">
        <div class="comm-icon">${c.emoji || '👥'}</div>
        <div class="comm-info">
          <div class="comm-name">${escapeHTML(c.name)}</div>
          <div class="comm-members">${fmtCount(count)} members</div>
        </div>
        <button class="comm-join-btn ${c.joined ? 'joined' : ''}" onclick="event.stopPropagation(); toggleJoin('${c.id}', this)">
          ${c.joined ? 'Joined' : 'Join'}
        </button>
      </div>`;
  }).join('');
}

async function toggleJoin(commId, btn) {
  const comm = AppState.communities.find(c => c.id === commId) || MockDB.communities.find(c => c.id === commId);
  if (!comm) return;
  comm.joined = !comm.joined;
  btn.textContent = comm.joined ? 'Joined' : 'Join';
  btn.classList.toggle('joined', comm.joined);
  toast(comm.joined ? `Joined ${comm.name}! 🎉` : `Left ${comm.name}`);

  if (AppState.supabaseReady && AppState.currentUser) {
    try { await window.NexusDB.Communities.toggleMembership(commId, AppState.currentUser.id); }
    catch (_) {}
  }
}

function openCommunity(commId) { Router.navigateTo('community-detail', { commId }); }

// ---- NOTIFICATIONS ----
function renderNotifications(notifs) {
  const container = document.getElementById('notif-list');
  if (!container) return;

  const newOnes = notifs.filter(n => !n.read);
  const oldOnes = notifs.filter(n => n.read);

  let html = '';
  if (newOnes.length) {
    html += `<div class="notif-section-label">New</div>`;
    html += newOnes.map(buildNotifItem).join('');
  }
  if (oldOnes.length) {
    html += `<div class="notif-section-label">Earlier</div>`;
    html += oldOnes.map(buildNotifItem).join('');
  }
  if (!html) html = '<p style="padding:24px;color:var(--text-muted);text-align:center">No notifications yet</p>';
  container.innerHTML = html;
}

function buildNotifItem(notif) {
  const actor = notif.actor || getMockUser(notif.actor_id);
  const name  = actor.display_name || 'Someone';
  const seed  = actor.avatar_seed  || 'default';
  return `
    <div class="notif-item ${!notif.read ? 'unread' : ''}" onclick="markNotifRead('${notif.id}', this)">
      <div class="notif-avatar"><img src="${avatarURL(seed)}" alt="${escapeHTML(name)}" /></div>
      <div class="notif-body">
        <div class="notif-text"><strong>${escapeHTML(name)}</strong> ${escapeHTML(notif.body || notif.text || '')}</div>
        <div class="notif-time">${timeAgo(notif.created_at)}</div>
      </div>
    </div>`;
}

function markNotifRead(notifId, el) {
  el.classList.remove('unread');
  if (AppState.supabaseReady) window.NexusDB.Notifications.markRead(notifId).catch(() => {});
}

// ---- PROFILE ----
function renderProfile() {
  const p = AppState.profile || MockDB.users[0];
  const nameEl   = document.querySelector('#view-profile .profile-meta h2');
  const handleEl = document.querySelector('#view-profile .profile-handle');
  const bioEl    = document.querySelector('#view-profile .profile-bio');
  const avatarEl = document.querySelector('#view-profile .profile-avatar');
  if (nameEl)   nameEl.textContent   = p.display_name || '';
  if (handleEl) handleEl.textContent = `@${p.username || ''}`;
  if (bioEl)    bioEl.textContent    = p.bio || '';
  if (avatarEl) { avatarEl.src = avatarURL(p.avatar_seed); avatarEl.alt = p.display_name; }
}

function renderProfileFeed() {
  const container = document.getElementById('profile-feed');
  if (!container) return;
  const myId   = AppState.profile?.id || 'u1';
  const myPosts = buildMockFeedPosts().filter(p => p.author?.id === myId || p.author_id === myId);
  container.innerHTML = myPosts.map((p, i) => buildPostCard(p, i)).join('') ||
    '<p style="padding:24px;color:var(--text-muted);text-align:center">No posts yet</p>';
}

// ---- SEARCH ----
function renderSearchDefaults() {
  const trendingEl = document.getElementById('trending-list');
  if (trendingEl) {
    trendingEl.innerHTML = MockDB.trending.map(t => `
      <div class="trending-item" onclick="searchTag('#${t.tag}')">
        <span class="trending-hash">#</span>
        <div class="trending-info">
          <div class="trending-tag">${t.tag}</div>
          <div class="trending-count">${t.posts}</div>
        </div>
      </div>`).join('');
  }

  const peopleEl = document.getElementById('people-list');
  if (peopleEl) {
    peopleEl.innerHTML = MockDB.users.slice(1, 4).map(u => `
      <div class="person-item">
        <div class="person-avatar"><img src="${avatarURL(u.avatar_seed)}" alt="${u.display_name}" /></div>
        <div class="person-info">
          <div class="person-name">${u.display_name}</div>
          <div class="person-handle">@${u.username}</div>
        </div>
        <button class="follow-btn" onclick="toggleFollow(this)">Follow</button>
      </div>`).join('');
  }
}

function runSearch(query) { if (query) toast(`Searching "${query}"…`); else renderSearchDefaults(); }
function searchTag(tag)   { toast(`Feed for ${tag} coming soon`); }
function toggleFollow(btn) {
  const f = btn.classList.contains('following');
  btn.classList.toggle('following', !f);
  btn.textContent = f ? 'Follow' : 'Following';
}

// ---- WALLET ----
function renderWallet() {
  const container = document.getElementById('transaction-list');
  if (!container) return;
  container.innerHTML = MockDB.transactions.map(txn => {
    const peer  = getMockUser(txn.peer_id || '');
    const avatar = txn.emoji
      ? `<div class="txn-icon txn-icon-emoji">${txn.emoji}</div>`
      : `<div class="txn-icon"><img src="${avatarURL(peer.avatar_seed || 'default')}" alt="${txn.name}" /></div>`;
    return `
      <div class="transaction-item">
        ${avatar}
        <div class="txn-info">
          <div class="txn-name">${escapeHTML(txn.name)}</div>
          <div class="txn-type">${txn.type}</div>
        </div>
        <div class="txn-meta">
          <div class="txn-amount ${txn.positive ? 'positive' : 'negative'}">${txn.amount}</div>
          <div class="txn-date">${txn.date}</div>
        </div>
      </div>`;
  }).join('');
}

let _walletAction = '';
function walletAction(action) {
  if (action === 'History') { toast('Full history coming soon'); return; }
  _walletAction = action;
  document.getElementById('wallet-modal-title').textContent = `${action}`;
  document.getElementById('wallet-modal-hint').textContent  =
    action === 'Send' ? 'Enter amount and recipient' :
    action === 'Receive' ? 'Your wallet address will appear here' : 'Choose an amount to top up';
  document.getElementById('wallet-modal-to').style.display = action === 'Send' ? 'block' : 'none';
  openModal('wallet-modal');
}
function confirmWalletAction() {
  const amount = parseFloat(document.getElementById('wallet-modal-amount')?.value);
  if (!amount || isNaN(amount)) { toast('Enter a valid amount'); return; }
  closeWalletModal();
  toast(`${_walletAction} of $${amount.toFixed(2)} simulated ✓`);
}
function closeWalletModal() { closeModal('wallet-modal'); }

// ---- COMMUNITY DETAIL ----
function renderCommunityDetail(params) {
  // Render discussions from mock posts
  const container = document.getElementById('community-discussions');
  if (!container) return;
  container.innerHTML = buildMockFeedPosts().slice(0, 3).map(post => `
    <div class="discussion-item" onclick="openPost('${post.id}')">
      <div class="disc-avatar">
        <img src="${avatarURL(post.author?.avatar_seed || 'default')}" alt="${escapeHTML(post.author?.display_name || '')}" />
      </div>
      <div class="disc-body">
        <div class="disc-name">${escapeHTML(post.author?.display_name || '')} <span style="color:var(--text-muted);font-weight:400;font-size:0.78rem">${timeAgo(post.created_at)}</span></div>
        <div class="disc-preview">${escapeHTML(truncate(post.body, 60))}</div>
        <div class="disc-meta">
          <span class="disc-stat">❤️ ${fmtCount(post._likes ?? 0)}</span>
          <span class="disc-stat">💬 ${fmtCount(post._comments ?? 0)}</span>
        </div>
      </div>
    </div>`).join('');

  document.querySelectorAll('.cd-tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.cd-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
    };
  });
}

function joinCommunity(btn) {
  const joined = btn.textContent.trim() === 'Join';
  btn.textContent = joined ? 'Joined' : 'Join';
  toast(joined ? 'Joined Design Hub! 🎉' : 'Left Design Hub');
}

// ---- POST DETAIL + COMMENTS ----
function renderPostDetail(post, comments) {
  const container = document.getElementById('post-detail-content');
  const commentsList = document.getElementById('comments-list');

  if (container) container.innerHTML = buildPostCard(post, 0);

  if (commentsList) {
    commentsList.innerHTML = (comments || []).map(c => {
      const author = c.author || getMockUser(c.author_id);
      const name   = author.display_name || 'Unknown';
      return `
        <div class="comment-item">
          <img class="mini-avatar" src="${avatarURL(author.avatar_seed || 'default')}" alt="${escapeHTML(name)}" />
          <div class="comment-body">
            <div class="comment-author">${escapeHTML(name)}</div>
            <div class="comment-text">${escapeHTML(c.body || c.text || '')}</div>
            <div class="comment-actions">
              <span class="comment-action">❤️ ${c.likes ?? 0}</span>
              <span class="comment-action">Reply</span>
              <span class="comment-action" style="color:var(--text-muted)">${timeAgo(c.created_at)}</span>
            </div>
          </div>
        </div>`;
    }).join('') || '<p style="color:var(--text-muted);padding:12px 0;font-size:0.85rem">No comments yet. Be the first!</p>';
  }
}

async function submitComment() {
  const input   = document.getElementById('comment-input');
  const body    = input?.value.trim();
  const postId  = Router.current()?.params?.postId;
  if (!body || !postId) return;
  input.value = '';

  let newComment = { id: `c_${Date.now()}`, body, author: AppState.profile || MockDB.users[0], created_at: new Date().toISOString(), likes: 0 };

  if (AppState.supabaseReady && AppState.currentUser) {
    try {
      const saved = await window.NexusDB.Comments.create(postId, AppState.currentUser.id, body);
      newComment = { ...saved, author: AppState.profile };
    } catch (err) {
      toast('Comment failed to send');
      return;
    }
  }

  // Append to DOM
  const commentsList = document.getElementById('comments-list');
  if (commentsList) {
    const noComments = commentsList.querySelector('p');
    if (noComments) noComments.remove();
    const div = document.createElement('div');
    div.className = 'comment-item';
    div.innerHTML = `
      <img class="mini-avatar" src="${avatarURL(newComment.author?.avatar_seed || 'default')}" alt="me" />
      <div class="comment-body">
        <div class="comment-author">${escapeHTML(newComment.author?.display_name || 'You')}</div>
        <div class="comment-text">${escapeHTML(body)}</div>
        <div class="comment-actions">
          <span class="comment-action">❤️ 0</span>
          <span class="comment-action">Reply</span>
          <span class="comment-action" style="color:var(--text-muted)">just now</span>
        </div>
      </div>`;
    commentsList.appendChild(div);
  }
  toast('Comment posted!');
}

// ---- CREATE POST ----
async function submitPost() {
  const body = document.getElementById('post-textarea')?.value.trim();
  if (!body) { toast('Write something first!'); return; }

  const btn = document.querySelector('#view-create-post .btn-primary');
  if (btn) { btn.textContent = 'Posting…'; btn.disabled = true; }

  if (AppState.supabaseReady && AppState.currentUser) {
    try {
      await window.NexusDB.Posts.create(AppState.currentUser.id, body);
      toast('Post published! 🎉');
    } catch (err) {
      toast('Failed to publish. Try again.');
      if (btn) { btn.textContent = 'Post'; btn.disabled = false; }
      return;
    }
  } else {
    toast('Post created (demo mode) 🎉');
  }

  document.getElementById('post-textarea').value = '';
  if (btn) { btn.textContent = 'Post'; btn.disabled = false; }
  Router.navigateTo('home');
  setTimeout(() => loadAndRenderFeed(), 300);
}

/* ============================================================
   SETTINGS
   ============================================================ */
function toggleTheme() {
  const html  = document.documentElement;
  const dark  = html.dataset.theme === 'dark';
  html.dataset.theme = dark ? 'light' : 'dark';
  const label = document.getElementById('theme-label');
  if (label) label.textContent = dark ? 'Light mode' : 'Dark mode';
  toast(dark ? '☀️ Light mode' : '🌙 Dark mode');
}

/* ============================================================
   NAVIGATION GLOBALS (called from HTML onclick)
   ============================================================ */
function goTo(viewName) {
  if (viewName === 'splash') {
    handleLogout();
    return;
  }
  if (!document.getElementById('screen-app').classList.contains('active')) {
    showScreen('screen-app');
  }
  Router.navigateTo(viewName);
}

/* ============================================================
   KEYBOARD EVENTS
   ============================================================ */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal('story-modal'); closeModal('wallet-modal'); }
  if (e.key === 'Enter' && document.activeElement?.id === 'msg-input') sendMessage();
  if (e.key === 'Enter' && document.activeElement?.id === 'comment-input') submitComment();
});

/* ============================================================
   TAB INIT HELPER
   ============================================================ */
function initTabs(selector) {
  document.querySelectorAll(selector).forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll(selector).forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
    });
  });
}

/* ============================================================
   BOOT — check Supabase, restore session, show correct screen
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
  // Init tab switchers
  initTabs('.ptab');
  initTabs('.chat-tab');
  initTabs('.notif-tab');

  // Check if Supabase is configured
  const cfg = window.NEXUS_CONFIG || {};
  AppState.supabaseReady = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON &&
    cfg.SUPABASE_URL !== 'https://YOUR_PROJECT_ID.supabase.co');

  if (AppState.supabaseReady) {
    console.log('[Nexus] Supabase connected ✓');

    // Listen for auth changes (handles OAuth redirects & token refresh)
    window.NexusDB.Auth.onAuthChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        try {
          const profile = await window.NexusDB.Profiles.getById(session.user.id);
          enterApp(session.user, profile);
        } catch (_) {
          enterApp(session.user, { id: session.user.id, display_name: session.user.email, username: session.user.email.split('@')[0], avatar_seed: 'default' });
        }
      } else if (event === 'SIGNED_OUT') {
        showScreen('screen-splash');
      }
    });

    // Check for existing session
    try {
      const session = await window.NexusDB.Auth.session();
      if (session?.user) {
        const profile = await window.NexusDB.Profiles.getById(session.user.id).catch(() => null);
        enterApp(session.user, profile || { id: session.user.id, display_name: 'You', username: 'you', avatar_seed: 'default' });
        return;
      }
    } catch (_) {}

    // No session — stay on splash
    showScreen('screen-splash');

  } else {
    console.warn('[Nexus] Supabase not configured — running in demo mode. See config.example.js');
    showScreen('screen-splash');
  }
});
