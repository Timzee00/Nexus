# Nexus 🪐
> **Connect. Share. Belong.**  
> A full-featured social community platform — dark-mode, real-time chat, communities, notifications, and a mock wallet.

![Nexus App Preview](https://placehold.co/1200x600/0d0d14/7c3aed?text=Nexus+Social+Platform&font=syne)

---

## What's Inside

| Feature | Status |
|---|---|
| Splash / Onboarding | ✅ |
| Sign Up & Log In (Supabase Auth) | ✅ |
| Home Feed (likes, reposts, bookmarks) | ✅ |
| Stories bar | ✅ |
| Create Post | ✅ |
| Real-time Direct Messaging | ✅ |
| Communities (join/leave) | ✅ |
| Community Detail + Discussions | ✅ |
| Notifications (real-time) | ✅ |
| User Profile | ✅ |
| Search | ✅ |
| Wallet (mock — no real money) | ✅ |
| Settings + Dark/Light theme toggle | ✅ |
| **Demo mode** (works without Supabase) | ✅ |

---

## Tech Stack

```
Frontend:  HTML + CSS + Vanilla JS  (no framework — runs anywhere)
Backend:   Supabase (PostgreSQL + Auth + Realtime + Storage)
Hosting:   Vercel (free tier, deploys in 60 seconds)
```

No Node.js, no build step, no npm. Open `index.html` and it runs.

---

## Step-by-Step Setup

Follow these steps in order. Each step builds on the last.

---

### STEP 1 — Get the code onto your computer (or phone)

**If you're on a PC/Mac:**
```bash
# Download the project (or unzip the files you were given)
# Then open a terminal in the project folder
```

**If you're on Android with Termux:**
```bash
# Make sure git is installed
pkg install git

# Move to your home folder
cd ~

# Create a folder for the project
mkdir nexus && cd nexus

# Copy all 8 files into this folder:
# index.html, styles.css, app.js, supabase.js,
# config.example.js, vercel.json, schema.sql, .gitignore
```

---

### STEP 2 — Create your Supabase project (free)

1. Go to **https://supabase.com** and click **Start for free**
2. Sign in with GitHub (easiest) or create an account
3. Click **New project**
4. Fill in:
   - **Name:** `nexus` (or whatever you want)
   - **Database Password:** write this down somewhere safe
   - **Region:** pick the one closest to Nigeria (e.g. West Europe or East US)
5. Click **Create new project** and wait ~2 minutes for it to start

---

### STEP 3 — Run the database schema

1. In your Supabase dashboard, click **SQL Editor** (left sidebar)
2. Click **New query**
3. Open `schema.sql` from your project folder
4. Copy **everything** in that file
5. Paste it into the SQL editor
6. Click **Run** (green button)
7. You should see "Success. No rows returned." — that means it worked.

---

### STEP 4 — Get your Supabase API keys

1. In your Supabase dashboard, click **Settings** (bottom of left sidebar)
2. Click **API**
3. You'll see two things — copy both:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon public** key — a long string starting with `eyJ...`

---

### STEP 5 — Create your config file (local only, never uploaded)

In your project folder, create a file called `config.js`:

```bash
# In Termux or your terminal:
cp config.example.js config.js
```

Then open `config.js` and replace the placeholder values:

```javascript
window.NEXUS_CONFIG = {
  SUPABASE_URL:  'https://YOUR-PROJECT-ID.supabase.co',   // ← paste yours here
  SUPABASE_ANON: 'eyJ...',                                 // ← paste yours here
};
```

**⚠️ Important:** `config.js` is in `.gitignore` — it will NEVER be committed to GitHub.  
Your keys stay on your machine only. Vercel gets them differently (see Step 9).

---

### STEP 6 — Test it locally

Open `index.html` in your browser. You can do this two ways:

**Option A — Double-click** `index.html` (simplest, works for most things)

**Option B — Serve it properly (recommended, avoids some browser restrictions):**
```bash
# In Termux, install Python if not already installed:
pkg install python

# In your project folder:
python -m http.server 8080

# Then open your browser at: http://localhost:8080
```

You should see the Nexus splash screen. Tap **Get Started**, create an account, and you're in!

---

### STEP 7 — Push to GitHub

**If you don't have a GitHub account:**
1. Go to **https://github.com** and sign up (it's free)

**Create a new repository:**
1. Click the **+** button in the top right → **New repository**
2. Name it `nexus` (or anything you like)
3. Leave it **Public** (required for free Vercel deploys)
4. Do NOT tick "Add README" — you already have one
5. Click **Create repository**

**Push your code (Termux or terminal):**
```bash
# Install git if needed
pkg install git   # Termux only

# Go into your project folder
cd ~/nexus

# Set up git (first time only)
git config --global user.email "your@email.com"
git config --global user.name "Your Name"

# Initialize and push
git init
git add .
git commit -m "🚀 Initial commit — Nexus social platform"

# Connect to GitHub (replace YOUR-USERNAME and YOUR-REPO-NAME)
git remote add origin https://github.com/YOUR-USERNAME/nexus.git
git branch -M main
git push -u origin main
```

GitHub will ask for your username and password.  
**Note:** GitHub no longer accepts your account password for git push.  
You need a **Personal Access Token** instead:
1. Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Click **Generate new token (classic)**
3. Give it a name, select **repo** scope, click **Generate**
4. Copy the token — use this as your password when git asks

---

### STEP 8 — Deploy to Vercel (free)

1. Go to **https://vercel.com** and click **Sign up** → **Continue with GitHub**
2. Click **Add New → Project**
3. Find your `nexus` repository and click **Import**
4. On the configuration page:
   - **Framework Preset:** leave as **Other**
   - Everything else: leave defaults
5. Click **Deploy**

Vercel will deploy in ~30 seconds. You'll get a live URL like:  
`https://nexus-yourname.vercel.app`

**At this point the app is live but running in demo mode** (no Supabase).  
Complete Step 9 to connect Supabase.

---

### STEP 9 — Add Supabase environment variables to Vercel

Because `config.js` is gitignored (never pushed), Vercel needs your keys via environment variables.

1. In your Vercel project dashboard, click **Settings**
2. Click **Environment Variables**
3. Add these two variables:

| Name | Value |
|---|---|
| `SUPABASE_URL` | `https://your-project-id.supabase.co` |
| `SUPABASE_ANON` | `eyJ...` (your anon public key) |

4. Click **Save**

Now create a simple build script so Vercel generates `config.js` at deploy time.

**Create a file called `build.sh` in your project root:**

```bash
#!/bin/sh
# This runs on Vercel before serving files.
# It creates config.js from environment variables.
cat > config.js << EOF
window.NEXUS_CONFIG = {
  SUPABASE_URL:  '${SUPABASE_URL}',
  SUPABASE_ANON: '${SUPABASE_ANON}',
};
EOF
echo "config.js generated by build.sh"
```

Update `vercel.json` — add the build command:
```json
{
  "buildCommand": "sh build.sh"
}
```

**Push the build script:**
```bash
git add build.sh vercel.json
git commit -m "Add Vercel build script for config injection"
git push
```

Vercel will automatically redeploy. Your live URL is now fully connected to Supabase.

---

### STEP 10 — Enable Realtime in Supabase (for live chat)

1. In Supabase dashboard → **Database** → **Replication**
2. Under **Supabase Realtime**, make sure **messages** and **notifications** tables have the toggle ON
3. If you ran the schema.sql in Step 3, this was already done by the `ALTER PUBLICATION` commands

---

### STEP 11 — Share with your friend 🎉

Send them your Vercel URL. They can:
1. Open it on any phone or computer
2. Click **Get Started** → **Sign Up**
3. Create an account
4. Start posting and chatting with you in real time!

---

## Updating the App

When you make changes to the code:

```bash
git add .
git commit -m "describe what you changed"
git push
```

Vercel automatically detects the push and redeploys in ~30 seconds. Zero manual work.

---

## Project File Structure

```
nexus/
├── index.html          Main app (all screens in one file)
├── styles.css          All styling (design system + components)
├── app.js              App logic, Router, renderers, handlers
├── supabase.js         Supabase client + all DB helpers
├── config.example.js   Template for your keys (commit this)
├── config.js           Your actual keys (NEVER commit — gitignored)
├── build.sh            Vercel build script (creates config.js from env vars)
├── schema.sql          Full database schema (run once in Supabase SQL editor)
├── vercel.json         Vercel deployment config
├── .gitignore          Keeps config.js and secrets out of git
└── README.md           This file
```

---

## Extending the App

The codebase is designed to grow. Everything is separated:

| What you want to add | Where to touch |
|---|---|
| New screen / view | Add HTML in `index.html`, add CSS in `styles.css`, add entry in `Router.viewMap` + `Initializers` in `app.js` |
| New database table | Add to `schema.sql`, add helper methods in `supabase.js` |
| New API call | Add a function to `supabase.js`, call it from `app.js` |
| Real payments | Replace the mock wallet functions in `app.js` with Paystack/Flutterwave SDK calls |
| Image uploads | Use `NexusDB.Profiles.uploadAvatar()` or `db.storage.from('post-images').upload()` in `supabase.js` |

---

## Common Issues

**"Cannot read properties of undefined (reading 'createClient')"**  
→ The Supabase CDN script in `index.html` didn't load. Check your internet connection and reload.

**Login says "Email not confirmed"**  
→ Check the email inbox and click the confirmation link Supabase sent.

**App shows demo data after deploying to Vercel**  
→ Make sure `build.sh` ran correctly and `SUPABASE_URL` / `SUPABASE_ANON` are set in Vercel → Settings → Environment Variables.

**git push asks for password and rejects it**  
→ Use a Personal Access Token instead of your GitHub password (see Step 7 above).

**Realtime messages not appearing**  
→ Check Supabase Dashboard → Database → Replication → make sure `messages` table is enabled for realtime.

---

## Credits

Built with:
- [Supabase](https://supabase.com) — Backend, Auth, Realtime
- [Vercel](https://vercel.com) — Hosting
- [DiceBear](https://dicebear.com) — Avatars
- [Syne](https://fonts.google.com/specimen/Syne) + [DM Sans](https://fonts.google.com/specimen/DM+Sans) — Typography

---

*Built by Timzee Tech — production-grade from day one.*
