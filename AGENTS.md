# AGENTS.md

## Commands

- Install dependencies: `npm install`
- Dev server: `npm run dev` (runs on port 3456)
- Production build: `npm run build`
- Start production: `npm start` (runs on port 3456)
- Type check: `npx tsc --noEmit`
- No test or lint commands configured yet

## Testing

No test framework is currently configured.

When adding tests:
- Prefer Vitest as the test runner
- Place unit tests adjacent to source files: `foo.ts` → `foo.test.ts`
- Place integration tests in a top-level `tests/` directory
- Mock external services (MiniMax API, filesystem); use in-memory SQLite for DB tests
- Never make real HTTP calls to external APIs in tests

## Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── page.tsx            # Main triage UI (single-page app)
│   ├── layout.tsx          # Root layout
│   ├── globals.css         # Tailwind CSS imports
│   └── api/                # API route handlers
│       ├── archive/        # Archive operations + archive tag/excerpt queries
│       ├── deep-read/      # Deep-read stage excerpts
│       ├── excerpts/       # CRUD for excerpts (list + by ID)
│       ├── stats/          # Statistics and summary endpoints
│       ├── suggest-tags/   # AI tag suggestions (MiniMax)
│       ├── sync/           # Vault ↔ DB sync
│       ├── tag-feedback/   # AI tag feedback tracking + analysis
│       ├── tags/           # Tag management
│       └── translate/      # AI translation (MiniMax)
├── components/             # React components
│   ├── ArchiveFilterBar.tsx
│   ├── ArchiveGroupList.tsx
│   ├── ExcerptList.tsx     # Left sidebar file list
│   ├── FilterBar.tsx       # Filter/sort controls
│   ├── ReadingPanel.tsx    # Main reading pane (markdown render, actions)
│   ├── SignalRating.tsx    # 1-5 signal rating widget
│   ├── StatsView.tsx       # Statistics dashboard
│   ├── TagEditor.tsx       # Tag editing with AI suggestions
│   ├── TagFeedbackView.tsx # AI tag feedback review
│   └── ViewTabs.tsx        # Tab navigation between views
└── lib/                    # Core business logic
    ├── db.ts               # SQLite database (better-sqlite3) — schema, queries
    ├── scanner.ts          # Vault file scanner — reads .md files into DB
    ├── archiver.ts         # Archive workflow — moves files, updates frontmatter
    ├── frontmatter.ts      # YAML frontmatter parsing/serialization
    └── tag-vocab.ts        # Tag vocabulary management
```

Root config files:
- `next.config.mjs` — Next.js config (externalizes better-sqlite3)
- `postcss.config.mjs` — PostCSS with Tailwind CSS plugin
- `tsconfig.json` — TypeScript strict mode, path aliases
- `.env.local` — Environment variables (VAULT_PATH, MINIMAX_API_KEY, MINIMAX_MODEL)

## Code Style

- **Language**: TypeScript 5.8 with strict mode
- **Framework**: Next.js 15 App Router — use `route.ts` for API endpoints, `page.tsx` for pages
- **Styling**: Tailwind CSS 4 classes only; avoid inline styles
- **State management**: SWR for client data fetching; React state for local UI
- **Path aliases**: `@/*` maps to `./src/*`
- **Naming**:
  - Components: PascalCase files (`ReadingPanel.tsx`)
  - Lib modules: kebab-case files (`tag-vocab.ts`)
  - API routes: kebab-case directories (`suggest-tags/route.ts`)
- **Exports**: Named exports preferred; default exports only for Next.js pages/layouts
- **Types**: `interface` for object shapes, `type` for unions/intersections
- **Variables**: `const` over `let`; never `var`

## Git Workflow

- Single `main` branch
- Commit messages: imperative mood, descriptive ("Add deep-read stage between inbox and archive")
- No conventional commits prefix required
- No CI/CD pipeline configured

## Boundaries

### Always do
- Follow existing code patterns and conventions
- Use the path alias `@/*` for imports
- Keep API routes in `src/app/api/` following Next.js conventions
- Use Tailwind CSS classes for styling
- Run `npx tsc --noEmit` before finishing to verify types

### Ask first
- Install new npm dependencies
- Modify the database schema in `src/lib/db.ts`
- Change the vault sync or archive workflows
- Add new API routes or change existing API contracts
- Modify `next.config.mjs` or `tsconfig.json`

### Never do
- Commit `.env.local`, API keys, or secrets
- Expose `MINIMAX_API_KEY` or `VAULT_PATH` to the client
- Force push to main
- Modify vault .md files outside the scanner/archiver workflows
- Commit SQLite database files
