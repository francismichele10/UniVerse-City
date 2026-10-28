UniVerse-City — Student Blog

A complete Next.js (App Router) + Firebase project: a public blog with
sections, and a Google-auth-gated admin panel for a single admin.
Post images are hosted on Cloudinary (free tier, no card required) —
Firebase Storage is not used, since it now requires a paid Blaze plan.

## Setup

1. **Open this folder in Terminal** — you don't need `create-next-app`,
   this zip already is the project.

2. **Install dependencies:**
   ```
   npm install
   ```

3. **Create a Firebase project** at console.firebase.google.com:
   - Enable **Authentication → Google** sign-in provider
   - Enable **Firestore Database** (Storage is not needed)
   - Click the web icon (</>) to register a web app and copy its config

4. **Create a free Cloudinary account** at cloudinary.com (no card needed):
   - Your **Cloud Name** is shown on your dashboard homepage
   - Go to **Settings → Upload → Upload presets → Add upload preset**
   - Set **Signing Mode** to **Unsigned**, save, and copy its name

5. **Set up your environment file:**
   ```
   cp .env.local.example .env.local
   ```
   Paste your Firebase config values and your Cloudinary cloud name +
   upload preset name into `.env.local`.

6. **Whitelist yourself as the only admin:** in the Firestore console,
   create a collection named `admins`, and add a document whose ID is
   your exact Google account email (e.g. `you@gmail.com`). Any field
   inside it is fine — its existence is what grants access.

7. **Deploy the Firestore security rules and indexes** (requires the Firebase CLI: `npm install -g firebase-tools`):
   ```
   firebase login
   firebase init firestore   # point it at this project, keep default rules/indexes file names
   firebase deploy --only firestore:rules,firestore:indexes
   ```
   The indexes matter here, not just the rules: the public queries in
   `lib/posts.ts` filter on `status` + `publishAt` (and `category` or
   `slug`) together, which Firestore can't run without a matching
   composite index. `firestore.indexes.json` in this repo defines the
   ones it needs — if you skip deploying them, reads will fail with a
   `failed-precondition` error asking you to build the index (the error
   includes a direct console link if you'd rather create it that way).

8. **Run it:**
   ```
   npm run dev
   ```
   Visit `http://localhost:3000` for the public site, and
   `http://localhost:3000/admin/login` to sign in and manage posts.

## What's included
- `firestore.rules` — locks writes to whitelisted admins only
- `lib/types.ts` — Post / MediaItem / SiteSettings data model
- `lib/firebase.ts` — Firebase client init (Firestore + Auth only)
- `lib/cloudinary.ts` — unsigned image upload to Cloudinary
- `lib/posts.ts` — Firestore CRUD + category-filtered queries
- `lib/settings.ts` — read/write the single site-settings document
- `lib/adminAuth.ts` — Google sign-in + admin whitelist check
- `lib/Masthead.tsx` — shared header reading from Settings
- `app/page.tsx`, `app/posts/[slug]/page.tsx`, `app/category/[slug]/page.tsx` — public site
- `app/admin/*` — login, dashboard, post editor (Tiptap), settings page
- `app/api/revalidate/route.ts` — on-demand cache refresh on publish

## Next steps worth doing
- Add a Cloud Function if you want scheduled posts to flip to `published`
  server-side exactly on time (current setup checks `publishAt <= now` at
  read time, which needs no extra infra and works fine for a blog).
- Build a media library screen listing everything uploaded to your
  Cloudinary account (their Admin API supports this) — right now uploads
  happen inline per-post only.


## Interviews (YouTube embeds)

The Interviews feature stores only interview metadata in Firestore. Video files remain hosted by YouTube, so the website does not upload interview videos to Firebase Storage or Cloudinary.

- Public gallery: `/interviews`
- Individual interview/player: `/interviews/[id]`
- Admin management: `/admin/interviews`
- Firestore collection: `interviews`
- Fields: title, description, YouTube URL/video ID, status, publication date, author UID, and timestamps.
- Drafts are visible only to administrators. Published interviews appear publicly when their publication date has arrived.
- The public player uses YouTube's privacy-enhanced `youtube-nocookie.com` embed domain.

After updating the source, deploy the updated Firestore rules and indexes to the same Firebase project before using the Interviews admin page:

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

Then run the site locally with `npm run dev`, sign in at `/admin/login`, and open `/admin/interviews`. A YouTube link and title are required; description is optional. Saving as Draft does not publish the interview.
