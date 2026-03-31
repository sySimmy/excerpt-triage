# Tag Normalization Design

## Goal

Unify duplicated and overlapping tags into a single canonical taxonomy, with Obsidian frontmatter as the source of truth and SQLite as a derived index. The migration must update the original `.md` files in the vault, then resync the app so the database, UI, archive routing, and AI tag suggestion flow all observe the same tag set.

## Current State

The current corpus contains at least four tag styles:

1. Namespaced tags already used heavily in production:
   - `tool/openclaw`
   - `tool/claude-code`
   - `domain/投资市场`
   - `domain/生活`
   - `use_case/部署`
2. Older tier tags from the app vocabulary:
   - `ai-coding`
   - `agents`
   - `pkm`
   - `business`
   - `life`
3. Free-form aliases and formatting variants:
   - `AI` / `ai`
   - `claude-code` / `claude code`
   - `openclaw` / `tool/OpenClaw`
4. Long-tail one-off tags that may be valid, obsolete, or ambiguous.

Evidence from the current SQLite index:

- `tool/openclaw`: 118
- `tool/claude-code`: 107
- `use_case/部署`: 85
- `domain/投资市场`: 51
- `ai-coding`: 25
- `agents`: 14
- `claude-code`: 8
- `openclaw`: 6
- `claude code`: 5
- `AI`: 7
- `ai`: 13

This is not only a display problem. These tags affect:

- inbox filtering
- archive topic inference
- AI tag suggestion vocabulary
- tag statistics
- the content of the Obsidian source files

## Design Decision

Adopt a namespaced canonical taxonomy and migrate the vault toward it.

Canonical prefixes:

- `tool/...`
- `domain/...`
- `use_case/...`
- optional future prefixes only when justified by enough repeated usage

Key rule:

- SQLite must never become the source of truth for tag cleanup.
- All durable tag normalization happens on Obsidian frontmatter first.
- DB cleanup happens only by resyncing after source files are updated.

## Canonicalization Model

Introduce a single normalization registry with four outcomes per observed tag:

1. `canonical`
   The tag is already accepted as-is.
2. `alias -> canonical`
   Safe automatic rewrite.
3. `drop`
   Noise tag that should be removed during migration.
4. `manual_review`
   Ambiguous tag that must not be auto-rewritten.

Examples:

- `tool/OpenClaw` -> `tool/openclaw`
- `openclaw` -> `tool/openclaw`
- `claude-code` -> `tool/claude-code`
- `claude code` -> `tool/claude-code`
- `AI` -> likely `manual_review`
- `business` -> likely `manual_review`
- `ai-coding` -> likely `manual_review` until mapped to a namespaced domain rule

The migration should only auto-apply safe alias rewrites. Ambiguous tags stay untouched until reviewed.

## Data Flow

### 1. Audit

Run a dry-run audit over current DB tags and, when needed, the vault files.

Outputs:

- list of canonical tags
- alias-to-canonical candidates
- ambiguous tags requiring review
- estimated file count affected per rule
- per-file proposed before/after tag arrays

### 2. Apply To Vault

Run a batch frontmatter migration script against the Obsidian vault.

Requirements:

- dry-run by default
- `--apply` required for writes
- deterministic output
- dedupe tags after mapping
- preserve frontmatter order as much as practical
- write a manifest of changed files
- support rollback from the manifest

### 3. Resync App

After the vault rewrite:

- run existing sync flow
- let scanner rebuild DB tags from the updated files
- do not patch DB tags independently unless repairing a failed run

### 4. Update App Semantics

App vocabulary and archive inference must move to the same canonical model.

This includes:

- tag suggestions
- tag editor suggestions
- filter dropdown contents
- archive topic inference
- stats and optimization flows

## Safety Constraints

The migration must be conservative.

Rules:

- no write without dry-run success
- no auto-rewrite for ambiguous mappings
- no destructive DB-only rewrite
- no modification outside scanner or controlled migration workflow
- every changed file recorded in a manifest
- rollback script available before first real apply

## Rollout Strategy

### Phase 1

Add normalization registry, audit tooling, and tests. No vault writes yet.

### Phase 2

Review audit output and finalize the first mapping table.

### Phase 3

Run the Obsidian migration in dry-run mode, inspect the manifest, then run `--apply`.

### Phase 4

Resync the app and update vocabulary/archiving code to prefer canonical namespaced tags.

### Phase 5

Run spot verification on changed notes, app filters, stats, archive routing, and AI suggestions.

## Non-Goals

- redesigning the entire information architecture of the vault
- solving every long-tail semantic question in the first migration
- adding new AI tagging features
- auto-merging ambiguous domain tags without review

## Open Issues To Resolve During Implementation

These need explicit treatment in the audit review step:

- what canonical replacement should absorb old tier-1 tags like `ai-coding`, `agents`, `pkm`, `business`, `investing`, `life`
- whether `ai` and `AI` are noise, umbrella tags, or should map into a namespaced domain
- whether some long-tail tags should be preserved even if they appear only once

## Recommendation

Implement this as a two-step migration system:

1. build and verify normalization rules with dry-run artifacts
2. rewrite Obsidian source files, then resync the app from source

That keeps the vault authoritative, minimizes silent data loss, and makes rollback possible.
