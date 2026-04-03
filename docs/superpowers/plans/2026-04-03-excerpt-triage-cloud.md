# Excerpt Triage Cloud Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the local excerpt-triage app to a cloud architecture (Vercel + Supabase) with mobile PWA support, while keeping Obsidian vault as capture source via a local sync agent.

**Architecture:** New Next.js 15 project (`excerpt-triage-cloud/`) deployed on Vercel, backed by Supabase PostgreSQL. A local sync agent bridges the Obsidian vault with the cloud database. Responsive UI serves both desktop and mobile via Tailwind breakpoints.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript 5.8, Tailwind CSS 4, Supabase (PostgreSQL + JS SDK), SWR, react-markdown, gray-matter, chokidar

**Spec:** `docs/superpowers/specs/2026-04-03-excerpt-triage-cloud-design.md`

**Original project:** `/Users/simmysun/excerpt-triage/` (read-only reference, do not modify)

---

## File Structure

### Cloud App (`excerpt-triage-cloud/`)

```
src/
├── app/
│   ├── layout.tsx                    # Root layout + PWA meta tags
│   ├── page.tsx                      # Main page (responsive dual/single panel)
│   ├── globals.css                   # Dark theme styles (from original)
│   ├── login/
│   │   └── page.tsx                  # Password login form
│   └── api/
│       ├── auth/
│       │   └── route.ts              # POST: verify password, set cookie
│       ├── excerpts/
│       │   ├── route.ts              # GET: list excerpts + stats
│       │   └── [id]/
│       │       └── route.ts          # GET: detail with content; PATCH: update fields
│       ├── archive/
│       │   ├── route.ts              # POST: archive; DELETE: soft-delete
│       │   ├── excerpts/
│       │   │   └── route.ts          # GET: archived list
│       │   ├── tags/
│       │   │   └── route.ts          # GET: archived tag counts
│       │   └── unarchive/
│       │       └── route.ts          # POST: restore to inbox
│       ├── tags/
│       │   └── route.ts              # GET: all tag counts
│       ├── stats/
│       │   ├── route.ts              # GET: dashboard stats
│       │   └── summary/
│       │       └── route.ts          # POST: AI summary
│       ├── sync/
│       │   └── route.ts              # POST: sync status query
│       ├── deep-read/
│       │   ├── route.ts              # POST: mark as deep-read
│       │   └── excerpts/
│       │       └── route.ts          # GET: deep-read list
│       ├── suggest-tags/
│       │   └── route.ts              # POST: AI tag suggestions
│       ├── translate/
│       │   └── route.ts              # POST: translation proxy
│       ├── format/
│       │   └── route.ts              # POST: AI content cleanup
│       ├── tag-feedback/
│       │   ├── route.ts              # GET: list; POST: save feedback
│       │   └── analysis/
│       │       └── route.ts          # GET: feedback analysis
│       └── tag-optimization/
│           ├── status/
│           │   └── route.ts          # GET: optimization status
│           ├── vocab/
│           │   └── route.ts          # GET: effective vocabulary
│           ├── history/
│           │   └── route.ts          # GET: optimization history
│           └── run/
│               └── route.ts          # POST: trigger optimization
├── components/
│   ├── ReadingPanel.tsx              # Reading/editing panel (add responsive)
│   ├── ExcerptList.tsx               # Inbox list (add responsive)
│   ├── ArchiveGroupList.tsx          # Archive groups (add responsive)
│   ├── FilterBar.tsx                 # Inbox filters (add responsive)
│   ├── ArchiveFilterBar.tsx          # Archive filters (add responsive)
│   ├── TagEditor.tsx                 # Tag input (unchanged)
│   ├── SignalRating.tsx              # Star rating (unchanged)
│   ├── ViewTabs.tsx                  # Tab navigation (add responsive)
│   ├── StatsView.tsx                 # Stats dashboard (add responsive)
│   └── TagFeedbackView.tsx           # Feedback view (add responsive)
├── lib/
│   ├── supabase.ts                   # Supabase server client (service key only)
│   ├── db.ts                         # Shared data access layer (Supabase-backed equivalents of original db.ts)
│   ├── auth.ts                       # Password verify + cookie helpers
│   ├── minimax.ts                    # Copy from original (unchanged)
│   ├── tag-vocab.ts                  # Copy from original (unchanged)
│   ├── tag-optimization.ts           # Migrate: SQLite → Supabase queries
│   ├── archiver.ts                   # inferArchiveTopic() logic (ported from original)
│   └── inbox-filters.ts             # Copy from original (unchanged)
├── middleware.ts                      # Auth check on all routes except /login, /api/auth
public/
├── manifest.json                     # PWA manifest
└── icons/                            # PWA icons (192x192, 512x512)
supabase/
└── migrations/
    └── 001_initial.sql               # Full PostgreSQL schema
package.json
next.config.mjs                       # No longer needs better-sqlite3 external
tsconfig.json
.env.example
```

### Sync Agent (`excerpt-triage-cloud/sync-agent/`)

```
sync-agent/
├── src/
│   ├── index.ts                      # Entry point: manual/watch mode
│   ├── scanner.ts                    # Vault → Supabase upward sync
│   ├── archiver.ts                   # Supabase → Vault downward sync
│   ├── frontmatter.ts               # YAML frontmatter read/write
│   └── supabase.ts                   # Supabase client (service_role key)
├── package.json
├── tsconfig.json
└── .env.example                      # VAULT_PATH, SUPABASE_URL, SUPABASE_SERVICE_KEY
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `excerpt-triage-cloud/package.json`
- Create: `excerpt-triage-cloud/tsconfig.json`
- Create: `excerpt-triage-cloud/next.config.mjs`
- Create: `excerpt-triage-cloud/.env.example`
- Create: `excerpt-triage-cloud/.gitignore`
- Create: `excerpt-triage-cloud/src/app/layout.tsx`
- Create: `excerpt-triage-cloud/src/app/page.tsx` (placeholder)
- Create: `excerpt-triage-cloud/src/app/globals.css`

- [ ] **Step 1: Create project directory**

```bash
mkdir -p /Users/simmysun/excerpt-triage-cloud
cd /Users/simmysun/excerpt-triage-cloud
```

- [ ] **Step 2: Initialize Next.js project**

```bash
cd /Users/simmysun/excerpt-triage-cloud
npx create-next-app@latest . --typescript --tailwind --app --src-dir --no-eslint --import-alias "@/*"
```

This sets up TypeScript, Tailwind, App Router, src/ directory, and `@/*` path alias.

- [ ] **Step 3: Configure TypeScript strict mode**

Update `tsconfig.json` to match original project's strict settings. Set path alias `@/*` → `./src/*`.

- [ ] **Step 4: Configure next.config.mjs**

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {};
export default nextConfig;
```

No `better-sqlite3` external needed (unlike original).

- [ ] **Step 5: Create .env.example**

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key
MINIMAX_API_KEY=your-minimax-key
MINIMAX_MODEL=MiniMax-M2.7
ACCESS_PASSWORD=your-access-password
```

- [ ] **Step 6: Create .gitignore**

Ensure `.env.local`, `node_modules/`, `.next/` are excluded.

- [ ] **Step 7: Copy globals.css from original**

Copy `/Users/simmysun/excerpt-triage/src/app/globals.css` to `src/app/globals.css`. This contains the dark theme CSS variables and Tailwind directives.

- [ ] **Step 8: Create placeholder layout.tsx and page.tsx**

`layout.tsx`: Root layout with dark theme, PWA meta tags stub.
`page.tsx`: Simple "Excerpt Triage Cloud" placeholder text.

- [ ] **Step 9: Install dependencies**

```bash
cd /Users/simmysun/excerpt-triage-cloud
npm install @supabase/supabase-js swr react-markdown remark-gfm react-select gray-matter
npm install -D @types/react @types/react-dom @types/node
```

- [ ] **Step 10: Verify dev server starts**

```bash
cd /Users/simmysun/excerpt-triage-cloud && npm run dev
```

Expected: Server starts on default port, placeholder page renders.

- [ ] **Step 11: Initialize git and commit**

```bash
cd /Users/simmysun/excerpt-triage-cloud
git init
git add -A
git commit -m "feat: scaffold excerpt-triage-cloud project"
```

---

## Task 2: Supabase Database Schema

**Files:**
- Create: `supabase/migrations/001_initial.sql`

- [ ] **Step 1: Create migration SQL**

Translate the original `db/schema.sql` from SQLite to PostgreSQL. Key changes:
- `INTEGER PRIMARY KEY AUTOINCREMENT` → `BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY`
- `TEXT` timestamps → `TIMESTAMPTZ`
- `TEXT` JSON fields (tags) → `JSONB`
- `INTEGER` booleans → `BOOLEAN`
- Add `content TEXT`, `translation TEXT`, `deleted_at TIMESTAMPTZ`, `synced_at TIMESTAMPTZ` to `excerpts`
- Add `updated_at` trigger function
- Add RLS policies (`USING (true)` + `WITH CHECK (true)` for `anon` role)
- Create indexes on `status`, `source_type`, `signal`, `location`

Reference original schema: `/Users/simmysun/excerpt-triage/db/schema.sql`

Tables to create:
1. `excerpts` — with new fields: `content`, `translation`, `deleted_at`, `synced_at`
2. `activity_log` — same structure, PG types
3. `tag_feedback` — tags fields as `JSONB`
4. `optimization_runs` — same structure, PG types
5. `dynamic_vocab` — same structure, PG types (no `active` column — this table has `action`, `oscillation_count`, `cooldown_until`)
6. `prompt_overrides` — `BOOLEAN` for `active` field, correct columns: `override_type`, `content`, `target_tag`, `priority`, `active`, `source_run_id`

Include in migration SQL:

```sql
-- updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON excerpts
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: enable on all tables, permissive policy for anon role
-- (access control is in the application layer via password cookie)
ALTER TABLE excerpts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON excerpts FOR ALL USING (true) WITH CHECK (true);
-- Repeat for all other tables: activity_log, tag_feedback, optimization_runs, dynamic_vocab, prompt_overrides

-- RPC functions for complex aggregate queries (used by db.ts)
-- Add functions for: backlog_history, tag_feedback_analysis, daily_stats
-- These encapsulate PostgreSQL-specific date math that doesn't map cleanly to the Supabase JS SDK
```

- [ ] **Step 2: Run migration on Supabase**

Apply via Supabase Dashboard SQL Editor or `supabase db push`.

- [ ] **Step 3: Verify tables exist**

Check all 6 tables created with correct columns in Supabase Dashboard.

- [ ] **Step 4: Commit**

```bash
git add supabase/
git commit -m "feat: add PostgreSQL migration schema"
```

---

## Task 3: Supabase Client Library

**Files:**
- Create: `src/lib/supabase.ts`

- [ ] **Step 1: Create Supabase client module**

`src/lib/supabase.ts` — server-only, used by API routes:

```typescript
import { createClient } from "@supabase/supabase-js";

// Server-side client (API routes) — uses service key for full access
// No client-side Supabase needed: all data access goes through API routes
export function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}
```

- [ ] **Step 1b: Create shared data access layer**

`src/lib/db.ts` — Supabase-backed equivalents of the original `db.ts` functions. This centralizes query logic so API routes stay clean. Port these functions as async:

- `getExcerpts(filters)` → Supabase `.select()` with `.eq()`, `.gte()`, `.contains()`, etc.
- `getExcerptById(id)` → `.select('*').eq('id', id).single()`
- `updateExcerpt(id, data)` → `.update(data).eq('id', id)`
- `getStats()` → aggregate status counts
- `logActivity(data)` → `.insert()` into `activity_log`
- `getAllTags()` / `getArchivedTags()` → JSONB aggregate queries
- `getArchivedExcerpts(filters)` → `.select()` with `location = 'archived'`
- `getActivityByDateRange()` / `getDailyNewCounts()` / `getDailyActivityCounts()` / `getBacklogHistory()` → PostgreSQL date functions (`EXTRACT`, `DATE_TRUNC`)
- `saveTagFeedback()` / `getTagFeedbackAll()` / `getTagFeedbackAnalysis()` → feedback queries
- `getDeepReadExcerpts(filters)` → `.select()` with `status = 'deep_read'`

All functions must add `deleted_at IS NULL` filter by default (soft-delete awareness).

All tag queries use JSONB operators: `tags @> '["tag"]'::jsonb` instead of `LIKE`.

All date queries use PostgreSQL syntax: `EXTRACT(EPOCH FROM ...)`, `created_at::date`, `NOW()`.

For complex aggregate queries (backlog history, tag feedback analysis), use `supabase.rpc()` with PostgreSQL functions defined in the migration SQL (Task 2).

- [ ] **Step 2: Update .env.example and .env.local**

Add actual Supabase credentials to `.env.local` (not committed).

- [ ] **Step 3: Verify connection**

Create a temporary test in an API route that queries Supabase. Confirm connection works. Remove after verification.

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase.ts .env.example
git commit -m "feat: add Supabase client library"
```

---

## Task 4: Auth — Password Protection

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/middleware.ts`
- Create: `src/app/login/page.tsx`
- Create: `src/app/api/auth/route.ts`

- [ ] **Step 1: Create auth helper library**

`src/lib/auth.ts`:
- `verifyPassword(input: string): boolean` — compare against `process.env.ACCESS_PASSWORD`
- `AUTH_COOKIE_NAME = "et-auth"` — cookie name constant
- `setAuthCookie(response: NextResponse): NextResponse` — set HTTP-only cookie with a random session token (crypto.randomUUID()), 30-day expiry, SameSite=Lax, Secure in production. Store the token in a module-level Set (in-memory session store; single-instance Vercel is fine for single user)
- `hasAuthCookie(request: NextRequest): boolean` — check cookie exists and token is in the session store

- [ ] **Step 2: Create auth API route**

`src/app/api/auth/route.ts`:
- `POST(request)` — accept `{ password }`, verify, return response with auth cookie or 401

- [ ] **Step 3: Create login page**

`src/app/login/page.tsx`:
- Simple dark-themed form: password input + submit button
- On submit: POST to `/api/auth`, redirect to `/` on success, show error on failure
- Style consistent with the app's dark theme (`#1a1a2e` background)

- [ ] **Step 4: Create middleware**

`src/middleware.ts`:
- Check `hasAuthCookie(request)` on every request
- Exclude: `/login`, `/api/auth`, static files (`/_next/`, favicon, manifest, icons)
- Unauthenticated requests → redirect to `/login`
- Config matcher: `["/((?!_next/static|_next/image|favicon.ico|manifest.json|icons/).*)"]`

- [ ] **Step 5: Test auth flow manually**

1. Start dev server
2. Visit `/` → should redirect to `/login`
3. Enter wrong password → should show error
4. Enter correct password → should redirect to `/`
5. Refresh → should stay on `/` (cookie persists)

- [ ] **Step 6: Commit**

```bash
git add src/lib/auth.ts src/middleware.ts src/app/login/ src/app/api/auth/
git commit -m "feat: add password-based access protection"
```

---

## Task 5: Copy Unchanged Libraries

**Files:**
- Create: `src/lib/minimax.ts` (copy from original)
- Create: `src/lib/tag-vocab.ts` (copy from original)
- Create: `src/lib/inbox-filters.ts` (copy from original)

- [ ] **Step 1: Copy minimax.ts**

Copy `/Users/simmysun/excerpt-triage/src/lib/minimax.ts` → `src/lib/minimax.ts`. No changes needed — it's a pure HTTP client to MiniMax API.

- [ ] **Step 2: Copy tag-vocab.ts**

Copy `/Users/simmysun/excerpt-triage/src/lib/tag-vocab.ts` → `src/lib/tag-vocab.ts`. No changes needed — it's pure data/functions with no DB or filesystem dependencies.

- [ ] **Step 3: Copy inbox-filters.ts**

Copy `/Users/simmysun/excerpt-triage/src/lib/inbox-filters.ts` → `src/lib/inbox-filters.ts`. No changes needed.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/simmysun/excerpt-triage-cloud && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/minimax.ts src/lib/tag-vocab.ts src/lib/inbox-filters.ts
git commit -m "feat: copy unchanged libraries (minimax, tag-vocab, inbox-filters)"
```

---

## Task 6: Migrate tag-optimization.ts

**Files:**
- Create: `src/lib/tag-optimization.ts`
- Reference: `/Users/simmysun/excerpt-triage/src/lib/tag-optimization.ts`

- [ ] **Step 1: Copy and refactor tag-optimization.ts**

Copy the original file. Then refactor all SQLite calls to Supabase:

Key changes:
- Remove `import { getDb } from "./db"` and all `const db = getDb()` calls
- Replace `db.prepare(...).all()` → `supabase.from('table').select('*')`
- Replace `db.prepare(...).run()` → `supabase.from('table').insert()/update()/delete()`
- All functions become `async`
- `getEffectiveVocab()` → query `dynamic_vocab` from Supabase
- `buildSystemPrompt()` → query `prompt_overrides` from Supabase
- `computeOptimizationStats()` → query `tag_feedback` from Supabase
- `applyOptimizationActions()` → write to `dynamic_vocab` + `prompt_overrides` via Supabase
- `getActiveOverrides()` → query `prompt_overrides` where `active = true`
- `getDynamicVocabRows()` → query `dynamic_vocab`
- `getOptimizationHistory()` → query `optimization_runs` ordered by `created_at` desc, limit 10

Each function that previously used `db.prepare().all()` or `.run()` must now use the Supabase JS SDK and be `async`.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/tag-optimization.ts
git commit -m "feat: migrate tag-optimization from SQLite to Supabase"
```

---

## Task 7: API Routes — Core Excerpt Routes

**Files:**
- Create: `src/app/api/excerpts/route.ts`
- Create: `src/app/api/excerpts/[id]/route.ts`
- Reference: `/Users/simmysun/excerpt-triage/src/app/api/excerpts/route.ts`
- Reference: `/Users/simmysun/excerpt-triage/src/app/api/excerpts/[id]/route.ts`

- [ ] **Step 1: Migrate GET /api/excerpts**

Copy original route. Replace:
- `getExcerpts(filters)` → Supabase query with `.select()`, `.eq()`, `.gte()`, `.lte()`, `.order()`, `.range()`
- `getStats()` → Supabase aggregation query
- SQLite `tags LIKE '%"tag"%'` → `tags @> '["tag"]'::jsonb` (use `.contains()` or `.filter()`)
- `julianday()` → `EXTRACT(EPOCH FROM ...)`
- Response shape unchanged: `{ items, total, stats }`
- Exclude `content` field from list query (add `.select('id,title,source_type,...')` without content)

- [ ] **Step 2: Migrate GET /api/excerpts/[id]**

Original reads file content via `fs.readFileSync`. Replace:
- Query `excerpts` table by id, include `content` field
- No frontmatter stripping needed (content is already clean in DB)
- Return excerpt object with content

- [ ] **Step 3: Migrate PATCH /api/excerpts/[id]**

Original writes back to vault frontmatter and appends translation to file. Replace:
- Update only Supabase fields: `tags`, `signal`, `status`, `source_type`, `topic`
- If `translation` in body, store in `excerpts.translation` column
- Remove all `fs.writeFileSync`, `updateFrontmatterFields` calls
- Sync agent handles writing back to vault

- [ ] **Step 4: Test with curl**

```bash
# List excerpts
curl -b "et-auth=..." http://localhost:3000/api/excerpts

# Get single excerpt
curl -b "et-auth=..." http://localhost:3000/api/excerpts/1

# Update tags
curl -b "et-auth=..." -X PATCH http://localhost:3000/api/excerpts/1 \
  -H "Content-Type: application/json" \
  -d '{"tags": ["ai-coding", "claude-code"]}'
```

- [ ] **Step 5: Commit**

```bash
git add src/app/api/excerpts/
git commit -m "feat: migrate excerpt API routes to Supabase"
```

---

## Task 8: API Routes — Archive, Tags, Unarchive

**Files:**
- Create: `src/app/api/archive/route.ts`
- Create: `src/app/api/archive/excerpts/route.ts`
- Create: `src/app/api/archive/tags/route.ts`
- Create: `src/app/api/archive/unarchive/route.ts`
- Create: `src/app/api/tags/route.ts`

- [ ] **Step 1: Migrate POST /api/archive (archive excerpt)**

Original calls `archiveExcerpt()` which moves files. Replace:
- Update excerpt: `location = 'archived'`, `status = 'archived'`, set `topic` (using `inferArchiveTopic` logic from original `archiver.ts`)
- INSERT into `activity_log` (action = 'archive')
- No file operations — sync agent handles file move

Port `inferArchiveTopic()` logic from original `/Users/simmysun/excerpt-triage/src/lib/archiver.ts` (lines 19-60) into `src/lib/archiver.ts` in the cloud project. This maps tier-1 tags to archive topic directories using `TAG_TO_ARCHIVE_TOPIC` from `tag-vocab.ts`. This file only contains the topic inference logic — no filesystem operations (those are in the sync agent).

- [ ] **Step 2: Migrate DELETE /api/archive (soft delete)**

Original calls `deleteExcerptFile()` which deletes file + DB row. Replace:
- Set `deleted_at = NOW()` on the excerpt (soft delete)
- INSERT into `activity_log` (action = 'delete')
- Sync agent handles actual file deletion

- [ ] **Step 3: Migrate POST /api/archive/unarchive**

Original calls `unarchiveExcerpt()` which moves files back. Replace:
- Update excerpt: `location = 'raw'`, `status = 'to_process'`, clear `topic`
- INSERT into `activity_log` (action = 'unarchive')

- [ ] **Step 4: Migrate GET /api/archive/excerpts**

Copy original `getArchivedExcerpts()` logic. Replace SQLite queries with Supabase:
- Filter by `location = 'archived'` and `deleted_at IS NULL`
- Support pagination, sorting, search, tag filtering

- [ ] **Step 5: Migrate GET /api/archive/tags**

Copy original `getArchivedTags()` logic. Query tags from archived excerpts using JSONB.

- [ ] **Step 6: Migrate GET /api/tags**

Copy original `getAllTags()` logic. Aggregate tag counts across all non-deleted excerpts using JSONB.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/archive/ src/app/api/tags/
git commit -m "feat: migrate archive and tag API routes to Supabase"
```

---

## Task 9: API Routes — Stats, Deep-read, Sync

**Files:**
- Create: `src/app/api/stats/route.ts`
- Create: `src/app/api/stats/summary/route.ts`
- Create: `src/app/api/deep-read/route.ts`
- Create: `src/app/api/deep-read/excerpts/route.ts`
- Create: `src/app/api/sync/route.ts`

- [ ] **Step 1: Migrate GET /api/stats**

Copy original. Key SQL changes:
- `julianday(...)` → `EXTRACT(EPOCH FROM ...)`
- `date(created_at)` → `created_at::date`
- `COALESCE(captured_at, date(created_at))` → `COALESCE(captured_at, created_at::date)`
- `datetime('now', 'localtime')` → `NOW()`
- Use Supabase `.rpc()` for complex aggregate queries or inline SQL via `supabase.rpc('function_name')`

Consider: some stats queries are complex (backlog history reconstruction). May need Supabase Database Functions or `supabase.rpc()`.

- [ ] **Step 2: Migrate POST /api/stats/summary**

Copy original. Replace `getActivityByDateRange()` with Supabase query. MiniMax call unchanged.

- [ ] **Step 3: Migrate POST /api/deep-read**

Original calls `updateFrontmatterFields()`. Replace:
- Update excerpt `status = 'deep_read'` in Supabase
- INSERT into `activity_log`
- No file operations

- [ ] **Step 4: Migrate GET /api/deep-read/excerpts**

Copy original `getDeepReadExcerpts()`. Replace SQLite with Supabase query.

- [ ] **Step 5: Create POST /api/sync (status endpoint)**

New implementation (not migration). Instead of scanning vault, return sync status:
- Query most recent `synced_at` from excerpts
- Count excerpts where `synced_at IS NULL` (never synced)
- Return `{ lastSyncAt, pendingCount }`

- [ ] **Step 6: Commit**

```bash
git add src/app/api/stats/ src/app/api/deep-read/ src/app/api/sync/
git commit -m "feat: migrate stats, deep-read, and sync API routes"
```

---

## Task 10: API Routes — Tag Feedback, Tag Optimization, Suggest-tags, Format, Translate

**Files:**
- Create: `src/app/api/tag-feedback/route.ts`
- Create: `src/app/api/tag-feedback/analysis/route.ts`
- Create: `src/app/api/tag-optimization/status/route.ts`
- Create: `src/app/api/tag-optimization/vocab/route.ts`
- Create: `src/app/api/tag-optimization/history/route.ts`
- Create: `src/app/api/tag-optimization/run/route.ts`
- Create: `src/app/api/suggest-tags/route.ts`
- Create: `src/app/api/format/route.ts`
- Create: `src/app/api/translate/route.ts`

- [ ] **Step 1: Migrate tag-feedback routes**

`POST /api/tag-feedback` — replace `saveTagFeedback()` with Supabase insert.
`GET /api/tag-feedback` — replace `getTagFeedbackAll()` with Supabase select.
`GET /api/tag-feedback/analysis` — replace `getTagFeedbackAnalysis()` with Supabase queries. This is the most complex query (joins, aggregations). May need a Supabase Database Function or build in JS.

- [ ] **Step 2: Migrate tag-optimization routes**

All four routes call functions from the migrated `tag-optimization.ts` (Task 6). Wire up:
- `GET /api/tag-optimization/status` → `checkOptimizationTrigger()`
- `GET /api/tag-optimization/vocab` → `getEffectiveVocab()`
- `GET /api/tag-optimization/history` → `getOptimizationHistory()`
- `POST /api/tag-optimization/run` → `computeOptimizationStats()` → `generateProposals()` → MiniMax → `applyOptimizationActions()`

- [ ] **Step 3: Migrate POST /api/suggest-tags**

Copy original. The key change:
- `getEffectiveVocab()` and `buildSystemPrompt()` from `tag-optimization.ts` are now async (Supabase queries)
- Add `await` to both calls
- MiniMax call unchanged

- [ ] **Step 4: Migrate POST /api/format**

Original reads file content via `fs.readFileSync`. Replace:
- Accept `id` in request body
- Query excerpt `content` from Supabase
- Feed to MiniMax for formatting
- Return formatted content (preview, no write-back)

- [ ] **Step 5: Copy POST /api/translate**

Copy `/Users/simmysun/excerpt-triage/src/app/api/translate/route.ts` unchanged. It's a pure MiniMax proxy.

- [ ] **Step 5b: Important omissions**

**Do NOT copy these from the original project:**
- `POST /api/notebooklm` — depends on local Python script, removed per spec
- `src/lib/env.ts` — exports `VAULT_PATH` and `validateVaultPath()` which are local-only. Cloud app does not access the vault filesystem. Remove all `import { VAULT_PATH } from "@/lib/env"` in migrated routes.
- `src/lib/db.ts` (original) — replaced by the new `src/lib/db.ts` (Supabase-backed, created in Task 3)

- [ ] **Step 6: Commit**

```bash
git add src/app/api/tag-feedback/ src/app/api/tag-optimization/ src/app/api/suggest-tags/ src/app/api/format/ src/app/api/translate/
git commit -m "feat: migrate remaining API routes (feedback, optimization, suggest, format, translate)"
```

---

## Task 11: UI Components — Copy and Adapt for Responsive

**Files:**
- Create: all files in `src/components/`
- Modify: `src/app/page.tsx`
- Reference: `/Users/simmysun/excerpt-triage/src/components/`
- Reference: `/Users/simmysun/excerpt-triage/src/app/page.tsx`

- [ ] **Step 1: Copy all components from original**

Copy these files from the original project:
- `ReadingPanel.tsx`
- `ExcerptList.tsx`
- `ArchiveGroupList.tsx`
- `FilterBar.tsx`
- `ArchiveFilterBar.tsx`
- `TagEditor.tsx`
- `SignalRating.tsx`
- `ViewTabs.tsx`
- `StatsView.tsx`
- `TagFeedbackView.tsx`

- [ ] **Step 2: Copy and adapt page.tsx**

Copy `/Users/simmysun/excerpt-triage/src/app/page.tsx`.
Changes:
- Remove any references to `VAULT_PATH` or filesystem
- API URLs stay the same (same route structure)
- Add mobile state: `selectedExcerptMobile` to toggle between list and reading view on small screens

- [ ] **Step 3: Add responsive layout to page.tsx**

The main page currently uses a fixed dual-panel layout. Add Tailwind responsive classes:

```tsx
{/* Desktop: side-by-side */}
<div className="hidden md:flex ...">
  <ExcerptList ... />
  <ReadingPanel ... />
</div>

{/* Mobile: single panel with state toggle */}
<div className="md:hidden">
  {showReading ? <ReadingPanel ... onBack={() => setShowReading(false)} /> : <ExcerptList ... onSelect={(id) => { selectExcerpt(id); setShowReading(true); }} />}
</div>
```

- [ ] **Step 4: Add responsive to ReadingPanel.tsx**

- Add `onBack?: () => void` prop for mobile back navigation
- Mobile top bar: `← 返回` + `1/23` + `下一篇 →` (visible only `md:hidden`)
- Mobile bottom action bar: fixed position, icon-based (archive, skip, deep-read, translate, delete)
- Desktop: keep existing button layout

- [ ] **Step 5: Add responsive to ExcerptList.tsx**

- Mobile: full-width card list, larger touch targets
- Add `onSelect` callback prop for mobile navigation

- [ ] **Step 6: Add responsive to FilterBar.tsx**

- Mobile: horizontal scrolling pill bar
- Desktop: keep existing layout

- [ ] **Step 7: Add responsive to ViewTabs.tsx**

- Mobile: compact tab bar at top, icon + short label
- Desktop: keep existing layout

- [ ] **Step 8: Verify desktop layout unchanged**

Open on desktop browser (≥768px). All views should look identical to original.

- [ ] **Step 9: Verify mobile layout**

Open in Chrome DevTools mobile emulator (iPhone SE / 375px). Check:
- Tab navigation works
- List view shows cards
- Tap card → reading view
- Back button → list view
- Bottom action bar functional
- Filter bar scrolls horizontally

- [ ] **Step 10: Commit**

```bash
git add src/components/ src/app/page.tsx
git commit -m "feat: migrate UI components with responsive mobile layout"
```

---

## Task 12: PWA Configuration

**Files:**
- Create: `public/manifest.json`
- Create: `public/icons/icon-192.png`
- Create: `public/icons/icon-512.png`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Create manifest.json**

```json
{
  "name": "摘录分拣台",
  "short_name": "分拣台",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#1a1a2e",
  "theme_color": "#1a1a2e",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 2: Create PWA icons**

Generate simple icons (can be a solid color with text or a simple design). Place in `public/icons/`.

- [ ] **Step 3: Update layout.tsx with PWA meta tags**

Add to `<head>`:
```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#1a1a2e" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<link rel="apple-touch-icon" href="/icons/icon-192.png" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
```

- [ ] **Step 4: Add Service Worker for PWA install and static caching**

Use `serwist` (modern `next-pwa` successor) or a minimal hand-written SW.

Option A (serwist):
```bash
npm install @serwist/next serwist
```
Configure in `next.config.mjs` to generate SW with:
- Precache app shell (HTML, CSS, JS bundles)
- Network-first for API requests
- No offline data caching (spec: offline mode is a non-goal)

Option B (manual `public/sw.js`):
- Cache app shell files on install (`/`, `/login`)
- API requests: network only, no cache
- App shell: network first, fallback to cache
- Register SW from `layout.tsx` using a `<Script>` tag or useEffect

- [ ] **Step 5: Test PWA installability**

Build and serve: `npm run build && npm start`. Open in Chrome, check Application tab → Manifest is valid, Service Worker registered, "Add to Home Screen" is available.

- [ ] **Step 6: Commit**

```bash
git add public/manifest.json public/icons/ public/sw.js src/app/layout.tsx
git commit -m "feat: add PWA manifest, service worker, and icons"
```

---

## Task 13: Sync Agent — Scaffold

**Files:**
- Create: `sync-agent/package.json`
- Create: `sync-agent/tsconfig.json`
- Create: `sync-agent/.env.example`
- Create: `sync-agent/src/supabase.ts`
- Create: `sync-agent/src/frontmatter.ts`

- [ ] **Step 1: Initialize sync-agent directory**

```bash
mkdir -p /Users/simmysun/excerpt-triage-cloud/sync-agent/src
cd /Users/simmysun/excerpt-triage-cloud/sync-agent
```

- [ ] **Step 2: Create package.json**

```json
{
  "name": "excerpt-triage-sync-agent",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "sync": "tsx src/index.ts",
    "watch": "tsx src/index.ts --watch"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2",
    "chokidar": "^4",
    "gray-matter": "^4.0.3",
    "dotenv": "^16"
  },
  "devDependencies": {
    "tsx": "^4",
    "typescript": "^5.8",
    "@types/node": "^22"
  }
}
```

- [ ] **Step 3: Create tsconfig.json**

Standard Node.js TypeScript config with ESNext module, strict mode.

- [ ] **Step 4: Create .env.example**

```env
VAULT_PATH=~/Library/Mobile Documents/iCloud~md~obsidian/Documents/everything
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key
```

- [ ] **Step 5: Create supabase.ts**

```typescript
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);
```

- [ ] **Step 6: Create frontmatter.ts**

Copy and adapt from `/Users/simmysun/excerpt-triage/src/lib/frontmatter.ts`:
- Keep `parseFrontmatter()`, `writeFrontmatter()`, `updateFrontmatterFields()`, `normalizeFrontmatter()`
- Remove any DB-dependent imports
- Adjust path resolution for standalone usage

- [ ] **Step 7: Install dependencies**

```bash
cd /Users/simmysun/excerpt-triage-cloud/sync-agent
npm install
```

- [ ] **Step 8: Commit**

```bash
cd /Users/simmysun/excerpt-triage-cloud
git add sync-agent/
git commit -m "feat: scaffold sync agent"
```

---

## Task 14: Sync Agent — Upward Sync (Vault → Supabase)

**Files:**
- Create: `sync-agent/src/scanner.ts`
- Modify: `sync-agent/src/index.ts`

- [ ] **Step 1: Create scanner.ts**

Adapt from `/Users/simmysun/excerpt-triage/src/lib/scanner.ts`. Key changes:
- Replace `upsertExcerpt()` (SQLite) → Supabase upsert
- Read file content (post-frontmatter) and store in `content` field
- Use vault-relative paths for `file_path` (e.g., `0507 Raw-Excerpts/xxx.md`)
- Upsert defense logic: only update `content` and metadata fields (title, source_type, author, etc.), NOT tags/signal/status/location/translation

```typescript
export async function scanDirectory(vaultPath: string, subdir: string, location: "raw" | "archived"): Promise<number> {
  // Walk directory, parse .md files, upsert to Supabase
  // For each file:
  //   1. parseFrontmatter(filePath) → { data, content }
  //   2. normalizeFrontmatter(data, filePath)
  //   3. supabase.from('excerpts').upsert({
  //        file_path: relative path,
  //        title, source_type, author, url, published_at, captured_at,
  //        content: content (stripped of frontmatter),
  //        location,
  //        synced_at: new Date().toISOString()
  //      }, { onConflict: 'file_path', ignoreDuplicates: false })
  //      BUT use column-level updates to not overwrite tags/signal/status
}
```

- [ ] **Step 2: Create index.ts entry point (manual mode)**

```typescript
import "dotenv/config";
import { scanDirectory } from "./scanner.js";

const vaultPath = process.env.VAULT_PATH!;
// Expand ~ if needed
const expandedPath = vaultPath.replace(/^~/, process.env.HOME!);

async function main() {
  console.log("Starting upward sync...");
  const rawCount = await scanDirectory(expandedPath, "05 Library/0507 Raw-Excerpts", "raw");
  const archiveCount = await scanDirectory(expandedPath, "05 Library/0506 已读归档", "archived");
  console.log(`Synced: ${rawCount} raw, ${archiveCount} archived`);
}

main().catch(console.error);
```

- [ ] **Step 3: Test manual sync**

```bash
cd /Users/simmysun/excerpt-triage-cloud/sync-agent
cp .env.example .env.local
# Fill in actual values
npm run sync
```

Verify: Supabase Dashboard shows excerpts with content.

- [ ] **Step 4: Commit**

```bash
cd /Users/simmysun/excerpt-triage-cloud
git add sync-agent/src/scanner.ts sync-agent/src/index.ts
git commit -m "feat: implement upward sync (vault → Supabase)"
```

---

## Task 15: Sync Agent — Downward Sync (Supabase → Vault)

**Files:**
- Create: `sync-agent/src/archiver.ts`
- Modify: `sync-agent/src/index.ts`

- [ ] **Step 1: Create archiver.ts**

Adapt from `/Users/simmysun/excerpt-triage/src/lib/archiver.ts`. Handle three cases:

**Case 1: Archived (location = 'archived', file still in 0507)**
- Move file from `0507 Raw-Excerpts/` to `0506 已读归档/{topic}/`
- Update frontmatter: status → "已归档", add topic, add finished date
- Write back tags/signal from Supabase to frontmatter

**Case 2: Deleted (deleted_at IS NOT NULL)**
- Delete the vault file (`fs.unlinkSync`)
- Then physically delete the DB row: `supabase.from('excerpts').delete().eq('id', id)`

**Case 3: Unarchived (location = 'raw', file in 0506)**
- Move file from `0506` back to `0507 Raw-Excerpts/`
- Update frontmatter: status → "待读"

**Case 4: Tags/signal/translation changed (updated_at > synced_at)**
- Write updated tags/signal/status/translation to file frontmatter
- If translation exists, append `\n---\n## 译文\n{translation}` to file content

```typescript
export async function downwardSync(vaultPath: string): Promise<void> {
  // 1. Query excerpts where updated_at > synced_at (or synced_at IS NULL for new cloud edits)
  // 2. For each, determine action based on state
  // 3. Execute file operations
  // 4. Update synced_at
}
```

- [ ] **Step 2: Integrate into index.ts**

After upward sync, run downward sync:

```typescript
import { downwardSync } from "./archiver.js";

async function main() {
  // ... upward sync ...
  console.log("Starting downward sync...");
  await downwardSync(expandedPath);
  console.log("Downward sync complete");
}
```

- [ ] **Step 3: Test downward sync**

1. Manually archive an excerpt in Supabase (set location='archived')
2. Run sync agent
3. Verify file moved from 0507 to 0506 with updated frontmatter

- [ ] **Step 4: Commit**

```bash
cd /Users/simmysun/excerpt-triage-cloud
git add sync-agent/src/archiver.ts sync-agent/src/index.ts
git commit -m "feat: implement downward sync (Supabase → vault)"
```

---

## Task 16: Sync Agent — Watch Mode

**Files:**
- Modify: `sync-agent/src/index.ts`

- [ ] **Step 1: Add watch mode to index.ts**

```typescript
import chokidar from "chokidar";

if (process.argv.includes("--watch")) {
  // Upward: watch vault for file changes
  const watcher = chokidar.watch([
    path.join(expandedPath, "05 Library/0507 Raw-Excerpts"),
    path.join(expandedPath, "05 Library/0506 已读归档"),
  ], { ignoreInitial: true, awaitWriteFinish: true });

  watcher.on("add", (filePath) => handleFileChange(filePath));
  watcher.on("change", (filePath) => handleFileChange(filePath));

  // Downward: poll Supabase every 30 seconds
  setInterval(() => downwardSync(expandedPath), 30_000);

  // Initial full sync
  await main();
  console.log("Watch mode active. Press Ctrl+C to stop.");
} else {
  await main();
}
```

- [ ] **Step 2: Implement handleFileChange**

```typescript
async function handleFileChange(filePath: string) {
  if (!filePath.endsWith(".md") || filePath.includes("_index.md")) return;
  // Parse and upsert single file to Supabase
}
```

- [ ] **Step 3: Test watch mode**

```bash
npm run watch
```

1. Create a new .md file in vault's 0507 → should appear in Supabase within seconds
2. Archive an excerpt via the web UI → should move file within 30 seconds

- [ ] **Step 4: Commit**

```bash
cd /Users/simmysun/excerpt-triage-cloud
git add sync-agent/src/index.ts
git commit -m "feat: add watch mode to sync agent"
```

- [ ] **Step 5 (optional): Create launchd plist for auto-start**

Create `~/Library/LaunchAgents/com.excerpt-triage.sync-agent.plist` to auto-start watch mode on login. Deferred — can be added later once the sync agent is stable.

---

## Task 17: Deployment to Vercel

**Files:**
- No new files; deployment configuration

- [ ] **Step 1: Create GitHub repository**

```bash
cd /Users/simmysun/excerpt-triage-cloud
gh repo create excerpt-triage-cloud --private --source=. --push
```

- [ ] **Step 2: Connect to Vercel**

Via Vercel Dashboard or CLI:
```bash
npx vercel
```

Link to the GitHub repository.

- [ ] **Step 3: Configure environment variables on Vercel**

Set all variables from `.env.example`:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_KEY`
- `MINIMAX_API_KEY`
- `MINIMAX_MODEL`
- `ACCESS_PASSWORD`

- [ ] **Step 4: Deploy**

```bash
git push origin main
```

Or trigger deploy from Vercel Dashboard.

- [ ] **Step 5: Verify production deployment**

1. Visit Vercel URL → redirected to /login
2. Enter password → main page loads
3. Test on mobile browser → responsive layout works
4. Add to home screen → PWA installs

- [ ] **Step 6: Run initial full sync**

```bash
cd /Users/simmysun/excerpt-triage-cloud/sync-agent
npm run sync
```

Verify: all vault excerpts appear in the web app.

- [ ] **Step 7: Start watch mode**

```bash
npm run watch
```

Verify: changes in vault and web app sync bidirectionally.

- [ ] **Step 8: Commit any deployment fixes**

```bash
git add -A
git commit -m "fix: deployment configuration adjustments"
git push
```
