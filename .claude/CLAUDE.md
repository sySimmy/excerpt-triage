# Project Instructions

@README.md
@package.json

## Tech Stack

- Framework: Next.js 15 (App Router) with TypeScript 5.8 (strict)
- Styling: Tailwind CSS 4
- Database: SQLite via better-sqlite3
- UI: React 19, react-markdown, react-select, SWR
- Package manager: npm
- Dev server port: 3456

## Commands

- Install: `npm install`
- Dev server: `npm run dev` (port 3456)
- Build: `npm run build`
- Type check: `npx tsc --noEmit`

## Code Style

- TypeScript strict mode enforced via tsconfig.json
- Path alias: `@/*` → `./src/*`
- Component files: PascalCase (e.g., `ReadingPanel.tsx`)
- Lib/util files: kebab-case (e.g., `tag-vocab.ts`)
- API routes: Next.js App Router convention (`route.ts` in nested dirs)
- Use `const` over `let`; never use `var`

## Project Structure

- `src/app/` — Pages and layouts (App Router)
- `src/app/api/` — API route handlers (archive, excerpts, stats, sync, tags, translate, etc.)
- `src/components/` — React components (ExcerptList, ReadingPanel, TagEditor, StatsView, etc.)
- `src/lib/` — Core logic (db, scanner, archiver, frontmatter, tag-vocab, env)

## Architecture

- Obsidian vault integration: reads/writes .md files with YAML frontmatter
- Workflow: Raw-Excerpts → triage (tag, rate, translate) → Archive
- AI features: MiniMax API for tag suggestions, translation, and content formatting
- Data: SQLite DB caches file metadata; vault .md files are source of truth
- API route pattern: validate → execute primary operation → check success → write side effects (logging, feedback). Never log before the operation succeeds

## Environment

- `.env.local` contains `VAULT_PATH` (supports `~`), `MINIMAX_API_KEY`, `MINIMAX_MODEL`
- SQLite DB lives in `.nosync/` (excluded from iCloud sync), each machine maintains its own
- Multi-machine: vault syncs via iCloud, project code via GitHub, DB rebuilt locally by scanner

## Security

- Never commit `.env.local` or API keys
- Do not modify vault files outside the defined archive/sync workflows
- Do not install new dependencies without asking
