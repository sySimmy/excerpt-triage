# Tag Normalization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Normalize duplicate tags into a canonical namespaced taxonomy and propagate the change from Obsidian source files into the app database and UI safely.

**Architecture:** Add a shared normalization registry and pure normalization helpers first, then build a dry-run audit tool, then build a vault migration command that rewrites frontmatter tags in place, and only after that update app vocabulary and archive inference to use the same canonical rules. SQLite remains a derived index and is refreshed from the rewritten vault.

**Tech Stack:** TypeScript 5.8, Node.js scripts, gray-matter frontmatter handling, existing Next.js app routes, existing SQLite scanner, Node test runner with `--experimental-strip-types`.

---

### Task 1: Add Canonical Tag Registry

**Files:**
- Create: `src/lib/tag-normalization.ts`
- Test: `tests/tag-normalization.test.ts`
- Reference: `src/lib/tag-vocab.ts`

**Step 1: Write the failing test**

Add tests for:

- safe alias rewrite: `openclaw -> tool/openclaw`
- case normalization: `tool/OpenClaw -> tool/openclaw`
- dedupe after mapping: `["openclaw", "tool/openclaw"] -> ["tool/openclaw"]`
- ambiguous tags stay unresolved: `business -> manual_review`

**Step 2: Run test to verify it fails**

Run:

```bash
node --experimental-strip-types --test tests/tag-normalization.test.ts
```

Expected:

- test fails because `src/lib/tag-normalization.ts` does not exist yet

**Step 3: Write minimal implementation**

Implement:

- canonical registry type
- alias lookup
- normalization result shape
- stable dedupe preserving first canonical occurrence
- `manual_review` bucket for ambiguous tags

**Step 4: Run test to verify it passes**

Run:

```bash
node --experimental-strip-types --test tests/tag-normalization.test.ts
```

Expected:

- PASS

**Step 5: Commit**

```bash
git add src/lib/tag-normalization.ts tests/tag-normalization.test.ts
git commit -m "Add tag normalization registry and helpers"
```

### Task 2: Build Dry-Run Audit Tool

**Files:**
- Create: `scripts/tag-normalization-report.mjs`
- Create: `scripts/tag-normalization-report-lib.mjs`
- Test: `tests/tag-normalization-report.test.mjs`
- Reference: `src/lib/db.ts`
- Reference: `src/lib/frontmatter.ts`

**Step 1: Write the failing test**

Cover:

- report groups tags into canonical, alias, manual review, and drop
- report counts affected files
- report produces deterministic sorted output

**Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/tag-normalization-report.test.mjs
```

Expected:

- FAIL because report library does not exist yet

**Step 3: Write minimal implementation**

Implement a dry-run report that can read tag observations and output:

- tag frequency table
- alias mapping summary
- manual review list
- per-file proposed tag changes

The first version can read from SQLite rows and return JSON in memory; CLI formatting can be thin.

**Step 4: Run test to verify it passes**

Run:

```bash
node --test tests/tag-normalization-report.test.mjs
```

Expected:

- PASS

**Step 5: Produce the first real report**

Run:

```bash
node scripts/tag-normalization-report.mjs > /tmp/tag-normalization-report.json
```

Expected:

- JSON report with canonical counts, alias suggestions, and manual review tags

**Step 6: Commit**

```bash
git add scripts/tag-normalization-report.mjs scripts/tag-normalization-report-lib.mjs tests/tag-normalization-report.test.mjs
git commit -m "Add dry-run tag normalization report"
```

### Task 3: Finalize First Mapping Table

**Files:**
- Modify: `src/lib/tag-normalization.ts`
- Reference: `/tmp/tag-normalization-report.json`

**Step 1: Review audit output**

Split observed tags into:

- safe aliases
- noise/drop
- manual review

Do not auto-map ambiguous old tier tags yet unless the review is explicit.

**Step 2: Encode the reviewed mapping**

Examples of safe initial candidates:

- `tool/OpenClaw -> tool/openclaw`
- `openclaw -> tool/openclaw`
- `claude-code -> tool/claude-code`
- `claude code -> tool/claude-code`

Expected:

- broad tags like `business`, `life`, `ai`, `AI`, `ai-coding`, `agents` remain manual until reviewed

**Step 3: Re-run tests**

Run:

```bash
node --experimental-strip-types --test tests/tag-normalization.test.ts
node --test tests/tag-normalization-report.test.mjs
```

Expected:

- PASS

**Step 4: Commit**

```bash
git add src/lib/tag-normalization.ts
git commit -m "Finalize initial reviewed tag mappings"
```

### Task 4: Build Obsidian Frontmatter Migration Command

**Files:**
- Create: `scripts/normalize-vault-tags.mjs`
- Create: `scripts/normalize-vault-tags-lib.mjs`
- Test: `tests/normalize-vault-tags.test.mjs`
- Reference: `src/lib/frontmatter.ts`

**Step 1: Write the failing test**

Cover:

- dry-run makes no file writes
- apply mode rewrites `tags`
- duplicate tags collapse after normalization
- manual review tags are left untouched and reported
- manifest includes file path, before tags, after tags

**Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/normalize-vault-tags.test.mjs
```

Expected:

- FAIL because migration library does not exist yet

**Step 3: Write minimal implementation**

Implement:

- vault file walker constrained to excerpt directories
- frontmatter parse and rewrite using existing markdown/frontmatter logic
- dry-run default
- `--apply` for writes
- manifest output to `tmp/tag-normalization-manifest.json`

**Step 4: Run test to verify it passes**

Run:

```bash
node --test tests/normalize-vault-tags.test.mjs
```

Expected:

- PASS

**Step 5: Run dry-run against the real vault**

Run:

```bash
node scripts/normalize-vault-tags.mjs --vault "$VAULT_PATH" --manifest /tmp/tag-normalization-manifest.json
```

Expected:

- no writes
- manifest with proposed changes
- separate list of manual review files

**Step 6: Commit**

```bash
git add scripts/normalize-vault-tags.mjs scripts/normalize-vault-tags-lib.mjs tests/normalize-vault-tags.test.mjs
git commit -m "Add vault tag normalization migration"
```

### Task 5: Add Rollback Support

**Files:**
- Create: `scripts/rollback-vault-tags.mjs`
- Test: `tests/rollback-vault-tags.test.mjs`
- Reference: `/tmp/tag-normalization-manifest.json`

**Step 1: Write the failing test**

Cover:

- rollback restores original frontmatter tags from manifest
- rollback skips unchanged files cleanly

**Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/rollback-vault-tags.test.mjs
```

Expected:

- FAIL because rollback script does not exist yet

**Step 3: Write minimal implementation**

Implement manifest-based restoration of original `tags` arrays only.

**Step 4: Run test to verify it passes**

Run:

```bash
node --test tests/rollback-vault-tags.test.mjs
```

Expected:

- PASS

**Step 5: Commit**

```bash
git add scripts/rollback-vault-tags.mjs tests/rollback-vault-tags.test.mjs
git commit -m "Add rollback for vault tag normalization"
```

### Task 6: Update App Vocabulary And Archive Inference

**Files:**
- Modify: `src/lib/tag-vocab.ts`
- Modify: `src/lib/archiver.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/components/TagEditor.tsx`
- Modify: `src/components/FilterBar.tsx`
- Modify: `src/app/api/suggest-tags/route.ts`
- Modify: `src/lib/tag-optimization.ts`
- Test: `tests/tag-vocab-normalized.test.ts`

**Step 1: Write the failing test**

Cover:

- canonical suggestions expose only approved normalized tags
- archive inference still resolves the correct archive topic from normalized tags
- removed aliases no longer appear in suggestions

**Step 2: Run test to verify it fails**

Run:

```bash
node --experimental-strip-types --test tests/tag-vocab-normalized.test.ts
```

Expected:

- FAIL because vocabulary and archiver still assume old tier names

**Step 3: Write minimal implementation**

Make the app consume the canonical registry:

- tag suggestion vocabulary built from canonical tags
- archive routing rules updated to recognize canonical namespaced tags
- UI suggestion lists no longer surface deprecated aliases

Do not remove legacy fallback logic until after migration verification.

**Step 4: Run test to verify it passes**

Run:

```bash
node --experimental-strip-types --test tests/tag-vocab-normalized.test.ts
```

Expected:

- PASS

**Step 5: Commit**

```bash
git add src/lib/tag-vocab.ts src/lib/archiver.ts src/app/page.tsx src/components/TagEditor.tsx src/components/FilterBar.tsx src/app/api/suggest-tags/route.ts src/lib/tag-optimization.ts tests/tag-vocab-normalized.test.ts
git commit -m "Update app vocab and archive rules for normalized tags"
```

### Task 7: Apply Migration And Resync

**Files:**
- Runtime only: vault files under `$VAULT_PATH/05 Library/...`
- Runtime only: `.nosync/excerpt-triage.db`

**Step 1: Run real vault migration**

Run:

```bash
node scripts/normalize-vault-tags.mjs --vault "$VAULT_PATH" --apply --manifest /tmp/tag-normalization-manifest.json
```

Expected:

- only safe alias rewrites applied
- manifest recorded
- manual review files untouched

**Step 2: Resync app database**

Run:

```bash
curl -X POST http://localhost:3456/api/sync
```

Expected:

- DB tags now reflect the rewritten source files

**Step 3: Spot-check migrated notes**

Check a sample of:

- `tool/openclaw`
- `tool/claude-code`
- a file that previously had `claude code`
- a file that still carries a `manual_review` tag

Expected:

- frontmatter and DB agree

**Step 4: Roll back if needed**

Run only if verification fails:

```bash
node scripts/rollback-vault-tags.mjs --manifest /tmp/tag-normalization-manifest.json
```

**Step 5: Commit**

```bash
git add .
git commit -m "Normalize vault tags and resync excerpt index"
```

### Task 8: Final Verification

**Files:**
- Verify: `src/lib/tag-normalization.ts`
- Verify: `src/lib/tag-vocab.ts`
- Verify: vault manifest and a sample of changed notes

**Step 1: Run automated checks**

Run:

```bash
node --experimental-strip-types --test tests/tag-normalization.test.ts
node --test tests/tag-normalization-report.test.mjs
node --test tests/normalize-vault-tags.test.mjs
node --test tests/rollback-vault-tags.test.mjs
node --experimental-strip-types --test tests/tag-vocab-normalized.test.ts
```

Expected:

- PASS

**Step 2: Run repo typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected:

- either PASS, or only the already-known unrelated errors from `learn-claude-code/`

**Step 3: Manual product verification**

Verify:

- inbox tag filter shows canonical tags only
- tag editor suggestions no longer show deprecated aliases
- archive routing still places notes into the expected archive topics
- stats no longer split the same concept across alias tags

**Step 4: Commit final cleanup**

```bash
git add .
git commit -m "Finish tag normalization rollout"
```

## Notes

- Do not install Vitest unless the user explicitly approves a new dependency.
- Keep all first-pass mappings conservative.
- Prefer leaving a tag in `manual_review` over forcing a wrong merge.

Plan complete and saved to `docs/plans/2026-03-26-tag-normalization.md`. Two execution options:

1. Subagent-Driven (this session) - I dispatch fresh subagent per task, review between tasks, fast iteration
2. Parallel Session (separate) - Open new session with executing-plans, batch execution with checkpoints

Which approach?
