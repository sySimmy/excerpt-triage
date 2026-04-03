# Learning Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "内化" (learning) phase between deep-read and archive, with a card-grid dashboard and NotebookLM-powered learning tools (summary, quiz, flashcard, audio, Q&A).

**Architecture:** New `learning` status + two new DB tables (`learning_sessions`, `learning_materials`) to track NotebookLM source IDs and cached materials. A unified Python CLI script wraps `notebooklm-py` for all NotebookLM operations. Eight new API routes handle the learning lifecycle. A new dashboard tab with card grid + tabbed side panel provides the UI.

**Tech Stack:** Next.js 15, TypeScript 5.8, SQLite (better-sqlite3), Tailwind CSS 4, React 19, Python 3.12 (`notebooklm-py` via `.venv/`)

**Spec:** `docs/superpowers/specs/2026-04-03-learning-dashboard-design.md`

---

### Task 1: DB Schema — Add learning tables

**Files:**
- Modify: `db/schema.sql`
- Modify: `src/lib/db.ts`
- Modify: `src/lib/frontmatter.ts` (add `"内化": "learning"` to STATUS_MAP)

- [ ] **Step 1: Add tables to schema.sql**

Append after the `prompt_overrides` table definition:

```sql
-- === Learning / Internalization ===

CREATE TABLE IF NOT EXISTS learning_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  excerpt_id INTEGER NOT NULL UNIQUE,
  notebooklm_source_id TEXT NOT NULL,
  conversation_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_learning_sessions_excerpt ON learning_sessions(excerpt_id);

CREATE TABLE IF NOT EXISTS learning_materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  excerpt_id INTEGER NOT NULL,
  tool_type TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(excerpt_id, tool_type)
);

CREATE INDEX IF NOT EXISTS idx_learning_materials_excerpt ON learning_materials(excerpt_id);
```

- [ ] **Step 2: Add `"内化": "learning"` to STATUS_MAP in frontmatter.ts**

In `src/lib/frontmatter.ts`, find the `STATUS_MAP` object and add:

```typescript
"内化": "learning",
```

This ensures the scanner correctly maps frontmatter `status: 内化` back to the `learning` DB status when re-scanning files.

- [ ] **Step 3: Add `ensureLearningTables()` to db.ts**

Add after the `getStats()` function at the end of db.ts. This ensures tables are created at runtime:

```typescript
export function ensureLearningTables() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS learning_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      excerpt_id INTEGER NOT NULL UNIQUE,
      notebooklm_source_id TEXT NOT NULL,
      conversation_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_learning_sessions_excerpt ON learning_sessions(excerpt_id);
    CREATE TABLE IF NOT EXISTS learning_materials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      excerpt_id INTEGER NOT NULL,
      tool_type TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(excerpt_id, tool_type)
    );
    CREATE INDEX IF NOT EXISTS idx_learning_materials_excerpt ON learning_materials(excerpt_id);
  `);
}
```

- [ ] **Step 4: Add learning query functions to db.ts**

Add these functions after the existing deep-read section:

```typescript
// === Learning ===

export function createLearningSession(excerptId: number, sourceId: string) {
  ensureLearningTables();
  const db = getDb();
  db.prepare(
    "INSERT OR IGNORE INTO learning_sessions (excerpt_id, notebooklm_source_id) VALUES (?, ?)"
  ).run(excerptId, sourceId);
}

export function getLearningSession(excerptId: number): { excerpt_id: number; notebooklm_source_id: string; conversation_id: string | null } | undefined {
  ensureLearningTables();
  const db = getDb();
  return db.prepare("SELECT * FROM learning_sessions WHERE excerpt_id = ?").get(excerptId) as { excerpt_id: number; notebooklm_source_id: string; conversation_id: string | null } | undefined;
}

export function updateConversationId(excerptId: number, conversationId: string) {
  ensureLearningTables();
  const db = getDb();
  db.prepare("UPDATE learning_sessions SET conversation_id = ? WHERE excerpt_id = ?").run(conversationId, excerptId);
}

export function deleteLearningSession(excerptId: number) {
  ensureLearningTables();
  const db = getDb();
  db.prepare("DELETE FROM learning_sessions WHERE excerpt_id = ?").run(excerptId);
}

export function saveLearningMaterial(excerptId: number, toolType: string, content: string) {
  ensureLearningTables();
  const db = getDb();
  db.prepare(
    "INSERT OR REPLACE INTO learning_materials (excerpt_id, tool_type, content) VALUES (?, ?, ?)"
  ).run(excerptId, toolType, content);
}

export function getLearningMaterial(excerptId: number, toolType: string): { content: string } | undefined {
  ensureLearningTables();
  const db = getDb();
  return db.prepare(
    "SELECT content FROM learning_materials WHERE excerpt_id = ? AND tool_type = ?"
  ).get(excerptId, toolType) as { content: string } | undefined;
}

export function getLearningProgress(excerptId: number): number {
  ensureLearningTables();
  const db = getDb();
  const row = db.prepare(
    "SELECT COUNT(*) as count FROM learning_materials WHERE excerpt_id = ?"
  ).get(excerptId) as { count: number };
  return row.count;
}

export function deleteLearningMaterials(excerptId: number) {
  ensureLearningTables();
  const db = getDb();
  db.prepare("DELETE FROM learning_materials WHERE excerpt_id = ?").run(excerptId);
}

export function getLearningExcerpts(filters: {
  search?: string;
  limit?: number;
  offset?: number;
}): { items: (ExcerptRow & { progress: number })[]; total: number } {
  ensureLearningTables();
  const db = getDb();
  const conditions: string[] = ["e.status = 'learning'", "e.location != 'archived'"];
  const params: Record<string, unknown> = {};

  if (filters.search) {
    conditions.push("(e.title LIKE @search OR e.topic LIKE @search)");
    params.search = `%${filters.search}%`;
  }

  const where = `WHERE ${conditions.join(" AND ")}`;
  const limit = filters.limit ?? 200;
  const offset = filters.offset ?? 0;

  const total = db.prepare(`SELECT COUNT(*) as count FROM excerpts e ${where}`).get(params) as { count: number };
  const items = db.prepare(`
    SELECT e.*, COALESCE(lm.progress, 0) as progress
    FROM excerpts e
    LEFT JOIN (
      SELECT excerpt_id, COUNT(*) as progress FROM learning_materials GROUP BY excerpt_id
    ) lm ON lm.excerpt_id = e.id
    ${where}
    ORDER BY e.updated_at DESC, e.id DESC
    LIMIT @limit OFFSET @offset
  `).all({ ...params, limit, offset }) as (ExcerptRow & { progress: number })[];

  return { items, total: total.count };
}
```

- [ ] **Step 5: Update upsertExcerpt to preserve `learning` status**

In `src/lib/db.ts`, find line ~82:

```typescript
// old:
status = CASE WHEN excerpts.status IN ('deep_read', 'archived') THEN excerpts.status ELSE @status END,
// new:
status = CASE WHEN excerpts.status IN ('deep_read', 'learning', 'archived') THEN excerpts.status ELSE @status END,
```

- [ ] **Step 6: Update getExcerpts to exclude `learning` status**

In `src/lib/db.ts`, in the `getExcerpts` function, find the block that pushes `exclude_deep_read`. Add the same pattern for learning right after:

```typescript
if (filters.exclude_learning) {
  conditions.push("status != 'learning'");
}
```

Also add `exclude_learning?: boolean` to the filters interface.

- [ ] **Step 7: Update getStats to include `learning` count**

Change the `getStats` return type and initial stats object:

```typescript
export function getStats(): { total: number; to_process: number; reading: number; read: number; archived: number; deep_read: number; learning: number } {
  const db = getDb();
  const rows = db.prepare("SELECT status, COUNT(*) as count FROM excerpts GROUP BY status").all() as { status: string; count: number }[];
  const stats = { total: 0, to_process: 0, reading: 0, read: 0, archived: 0, deep_read: 0, learning: 0 };
  for (const row of rows) {
    stats.total += row.count;
    if (row.status in stats) {
      (stats as Record<string, number>)[row.status] = row.count;
    }
  }
  return stats;
}
```

- [ ] **Step 8: Verify type check passes**

Run: `npx tsc --noEmit 2>&1 | grep -v learn-claude-code`
Expected: No errors

- [ ] **Step 9: Commit**

```bash
git add db/schema.sql src/lib/db.ts src/lib/frontmatter.ts
git commit -m "feat(db): add learning_sessions and learning_materials tables, update status handling"
```

---

### Task 2: Python CLI Script — `notebooklm-cli.py`

**Files:**
- Create: `scripts/notebooklm-cli.py`
- Delete: `scripts/push-to-notebooklm.py`

- [ ] **Step 1: Create `scripts/notebooklm-cli.py`**

```python
#!/usr/bin/env python3
"""Unified NotebookLM CLI for the excerpt-triage learning dashboard.

Subcommands:
    add-source      Push text content as a source (stdin)
    guide           Get per-source summary/guide
    generate        Generate quiz or flashcards (source-scoped)
    generate-audio  Generate and download audio overview
    ask             Ask a question (with conversation continuity)
    delete-source   Remove a source from the notebook
"""

import argparse
import asyncio
import json
import sys


def output(data):
    print(json.dumps(data, ensure_ascii=False))


def error(msg):
    output({"error": msg})
    sys.exit(1)


def get_client():
    try:
        from notebooklm import NotebookLMClient
        return NotebookLMClient
    except ImportError:
        error("notebooklm-py not installed. Run: pip install notebooklm-py")


async def cmd_add_source(args):
    content = sys.stdin.read().strip()
    if not content:
        error("No content provided via stdin")

    ClientClass = get_client()
    try:
        async with await ClientClass.from_storage() as client:
            source = await client.sources.add_text(
                args.notebook_id, args.title, content
            )
            output({"success": True, "source_id": source.id, "title": source.title})
    except FileNotFoundError:
        error("Not logged in. Run: notebooklm login")
    except Exception as e:
        error(str(e))


async def cmd_guide(args):
    ClientClass = get_client()
    try:
        async with await ClientClass.from_storage() as client:
            guide = await client.sources.get_guide(args.notebook_id, args.source_id)
            output({
                "success": True,
                "content": {
                    "text": guide.summary if hasattr(guide, 'summary') else str(guide),
                    "keywords": guide.keywords if hasattr(guide, 'keywords') else []
                }
            })
    except FileNotFoundError:
        error("Not logged in. Run: notebooklm login")
    except Exception as e:
        error(str(e))


async def cmd_generate(args):
    ClientClass = get_client()
    try:
        async with await ClientClass.from_storage() as client:
            source_ids = [args.source_id] if args.source_id else None

            if args.type == "quiz":
                artifact = await client.artifacts.generate_quiz(
                    args.notebook_id, source_ids=source_ids
                )
                # Normalize to our schema
                questions = []
                if hasattr(artifact, 'content') and artifact.content:
                    for q in artifact.content:
                        options = []
                        answer_idx = 0
                        if hasattr(q, 'answerOptions'):
                            for i, opt in enumerate(q.answerOptions):
                                text = opt.text if hasattr(opt, 'text') else str(opt)
                                options.append(text)
                                if hasattr(opt, 'isCorrect') and opt.isCorrect:
                                    answer_idx = i
                        questions.append({
                            "question": q.question if hasattr(q, 'question') else str(q),
                            "options": options,
                            "answer": answer_idx,
                            "explanation": q.explanation if hasattr(q, 'explanation') else ""
                        })
                output({"success": True, "content": {"questions": questions}})

            elif args.type == "flashcards":
                artifact = await client.artifacts.generate_flashcards(
                    args.notebook_id, source_ids=source_ids
                )
                cards = []
                if hasattr(artifact, 'content') and artifact.content:
                    for card in artifact.content:
                        front = card.front if hasattr(card, 'front') else (card.f if hasattr(card, 'f') else str(card))
                        back = card.back if hasattr(card, 'back') else (card.b if hasattr(card, 'b') else str(card))
                        cards.append({"front": front, "back": back})
                output({"success": True, "content": {"cards": cards}})

            else:
                error(f"Unknown generate type: {args.type}")

    except FileNotFoundError:
        error("Not logged in. Run: notebooklm login")
    except Exception as e:
        error(str(e))


async def cmd_generate_audio(args):
    ClientClass = get_client()
    try:
        async with await ClientClass.from_storage() as client:
            artifact = await client.artifacts.generate_audio(args.notebook_id)
            # Wait for completion
            artifact = await client.artifacts.wait(args.notebook_id, artifact.id)
            # Download
            data = await client.artifacts.download_audio(args.notebook_id, artifact.id)
            with open(args.output, "wb") as f:
                f.write(data)
            duration = artifact.duration if hasattr(artifact, 'duration') else ""
            output({"success": True, "file_path": args.output, "duration": str(duration)})
    except FileNotFoundError:
        error("Not logged in. Run: notebooklm login")
    except Exception as e:
        error(str(e))


async def cmd_ask(args):
    ClientClass = get_client()
    try:
        async with await ClientClass.from_storage() as client:
            kwargs = {}
            if args.conversation_id:
                kwargs["conversation_id"] = args.conversation_id
            response = await client.chat.ask(
                args.notebook_id, args.question, **kwargs
            )
            conv_id = response.conversation_id if hasattr(response, 'conversation_id') else None
            answer = response.answer if hasattr(response, 'answer') else str(response)
            output({"success": True, "answer": answer, "conversation_id": conv_id})
    except FileNotFoundError:
        error("Not logged in. Run: notebooklm login")
    except Exception as e:
        error(str(e))


async def cmd_delete_source(args):
    ClientClass = get_client()
    try:
        async with await ClientClass.from_storage() as client:
            await client.sources.delete(args.notebook_id, args.source_id)
            output({"success": True})
    except FileNotFoundError:
        error("Not logged in. Run: notebooklm login")
    except Exception as e:
        error(str(e))


def main():
    parser = argparse.ArgumentParser(description="NotebookLM CLI for excerpt-triage")
    sub = parser.add_subparsers(dest="command", required=True)

    # add-source
    p = sub.add_parser("add-source")
    p.add_argument("--notebook-id", required=True)
    p.add_argument("--title", required=True)

    # guide
    p = sub.add_parser("guide")
    p.add_argument("--notebook-id", required=True)
    p.add_argument("--source-id", required=True)

    # generate
    p = sub.add_parser("generate")
    p.add_argument("--notebook-id", required=True)
    p.add_argument("--type", required=True, choices=["quiz", "flashcards"])
    p.add_argument("--source-id")

    # generate-audio
    p = sub.add_parser("generate-audio")
    p.add_argument("--notebook-id", required=True)
    p.add_argument("--output", required=True)

    # ask
    p = sub.add_parser("ask")
    p.add_argument("--notebook-id", required=True)
    p.add_argument("--question", required=True)
    p.add_argument("--conversation-id", default=None)

    # delete-source
    p = sub.add_parser("delete-source")
    p.add_argument("--notebook-id", required=True)
    p.add_argument("--source-id", required=True)

    args = parser.parse_args()

    cmds = {
        "add-source": cmd_add_source,
        "guide": cmd_guide,
        "generate": cmd_generate,
        "generate-audio": cmd_generate_audio,
        "ask": cmd_ask,
        "delete-source": cmd_delete_source,
    }
    asyncio.run(cmds[args.command](args))


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Delete old script**

```bash
rm scripts/push-to-notebooklm.py
```

- [ ] **Step 3: Make executable and verify syntax**

```bash
chmod +x scripts/notebooklm-cli.py
.venv/bin/python3 scripts/notebooklm-cli.py --help
```

Expected: Shows help with subcommands.

- [ ] **Step 4: Commit**

```bash
git add scripts/notebooklm-cli.py
git rm scripts/push-to-notebooklm.py
git commit -m "feat: unified notebooklm-cli.py replacing push-to-notebooklm.py"
```

---

### Task 3: API Routes — NotebookLM helper and learning lifecycle

**Files:**
- Create: `src/lib/notebooklm.ts`
- Modify: `src/app/api/notebooklm/route.ts`
- Create: `src/app/api/learning/start/route.ts`
- Create: `src/app/api/learning/excerpts/route.ts`
- Create: `src/app/api/learning/generate/route.ts`
- Create: `src/app/api/learning/material/route.ts`
- Create: `src/app/api/learning/ask/route.ts`
- Create: `src/app/api/learning/audio-download/route.ts`
- Create: `src/app/api/learning/finish/route.ts`
- Create: `src/app/api/learning/archive/route.ts`

All API routes follow the project convention: validate → execute → log side effects. Uses `execFile` (not `exec`) to avoid shell injection.

- [ ] **Step 1: Create `src/lib/notebooklm.ts` — helper for calling the Python CLI**

```typescript
import { execFile } from "child_process";
import path from "path";

const PYTHON_PATH = path.join(process.cwd(), ".venv", "bin", "python3");
const SCRIPT_PATH = path.join(process.cwd(), "scripts", "notebooklm-cli.py");

interface CLIResult {
  success: boolean;
  [key: string]: unknown;
}

export function callNotebookLM(
  subcommand: string,
  args: Record<string, string>,
  options?: { stdin?: string; timeout?: number }
): Promise<CLIResult> {
  const notebookId = process.env.NOTEBOOKLM_NOTEBOOK_ID;
  if (!notebookId) {
    return Promise.resolve({ success: false, error: "NOTEBOOKLM_NOTEBOOK_ID not configured" });
  }

  const cliArgs = [SCRIPT_PATH, subcommand, `--notebook-id=${notebookId}`];
  for (const [key, value] of Object.entries(args)) {
    cliArgs.push(`--${key}=${value}`);
  }

  return new Promise((resolve) => {
    const child = execFile(
      PYTHON_PATH,
      cliArgs,
      { timeout: options?.timeout ?? 30000 },
      (error, stdout, stderr) => {
        if (error) {
          const msg = stderr?.trim() || error.message;
          resolve({ success: false, error: msg });
          return;
        }
        try {
          resolve(JSON.parse(stdout.trim()));
        } catch {
          resolve({ success: false, error: stdout.trim() || "Unknown error" });
        }
      }
    );
    if (options?.stdin) {
      child.stdin?.write(options.stdin);
      child.stdin?.end();
    }
  });
}
```

- [ ] **Step 2: Update `/api/notebooklm/route.ts` to use new helper**

Replace entire file with:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getExcerptById, logActivity } from "@/lib/db";
import { callNotebookLM } from "@/lib/notebooklm";
import fs from "fs";

export async function POST(request: NextRequest) {
  const { id } = await request.json();

  const excerpt = getExcerptById(id);
  if (!excerpt) {
    return NextResponse.json({ error: "Excerpt not found" }, { status: 404 });
  }

  let content = "";
  try {
    if (fs.existsSync(excerpt.file_path)) {
      const raw = fs.readFileSync(excerpt.file_path, "utf-8");
      const fmMatch = raw.match(/^---\n[\s\S]*?\n---\n/);
      content = fmMatch ? raw.slice(fmMatch[0].length) : raw;
    }
  } catch {
    return NextResponse.json({ error: "Failed to read excerpt file" }, { status: 500 });
  }

  if (!content.trim()) {
    return NextResponse.json({ error: "Excerpt has no content" }, { status: 400 });
  }

  const title = excerpt.title ?? "Untitled";
  const result = await callNotebookLM("add-source", { title }, { stdin: content });

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  logActivity({
    excerpt_id: id,
    action: "notebooklm",
    title: excerpt.title,
    source_type: excerpt.source_type,
    source_name: excerpt.source_name,
    tags: excerpt.tags,
    signal: excerpt.signal,
  });

  return NextResponse.json({ success: true, source_id: result.source_id });
}
```

- [ ] **Step 3: Create `/api/learning/start/route.ts`**

See spec section "Start learning (idempotent)" for the flow. Key: check idempotency, push to NotebookLM, create session, update status + frontmatter, log activity.

- [ ] **Step 4: Create `/api/learning/excerpts/route.ts`**

Simple GET handler calling `getLearningExcerpts()`.

- [ ] **Step 5: Create `/api/learning/generate/route.ts`**

Handles summary (via `guide` subcommand), quiz, and flashcard generation. Checks cache first. Uses source-scoped generation via `--source-id`.

- [ ] **Step 6: Create `/api/learning/material/route.ts`**

Simple GET handler returning cached material by excerpt_id + tool_type.

- [ ] **Step 7: Create `/api/learning/ask/route.ts`**

Q&A with conversation continuity. Reads conversation_id from learning_sessions, passes to CLI, updates on first response, appends to Q&A history.

- [ ] **Step 8: Create `/api/learning/audio-download/route.ts`**

Two handlers:
- **POST**: Triggers audio generation. Creates `.nosync/audio/` directory. Calls `generate-audio` with 300s timeout. Caches result in learning_materials.
- **GET** `?excerpt_id=X`: Serves the downloaded audio file for playback. Returns 404 if not yet generated. Streams the `.mp4` file with `Content-Type: audio/mp4`.

- [ ] **Step 9: Create `/api/learning/finish/route.ts`**

Sets status back to `deep_read`, updates frontmatter to `精读`.

- [ ] **Step 10: Create `/api/learning/archive/route.ts`**

Deletes NotebookLM source (best-effort), calls existing `archiveExcerpt()` from `@/lib/archiver`, cleans up learning_materials + learning_sessions + audio file.

- [ ] **Step 11: Verify type check**

Run: `npx tsc --noEmit 2>&1 | grep -v learn-claude-code`
Expected: No errors

- [ ] **Step 12: Commit**

```bash
git add src/lib/notebooklm.ts src/app/api/learning/ src/app/api/notebooklm/route.ts
git commit -m "feat(api): add learning lifecycle routes and notebooklm helper"
```

---

### Task 4: ViewTabs — Add learning tab

**Files:**
- Modify: `src/components/ViewTabs.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add `"learning"` to ViewKey type in ViewTabs.tsx**

```typescript
export type ViewKey = "inbox" | "deep-read" | "learning" | "archive" | "stats" | "tag-feedback";
```

- [ ] **Step 2: Add tab entry in TABS array (after deep-read)**

```typescript
{ key: "learning", label: "内化" },
```

- [ ] **Step 3: Add learningCount prop and badge**

Add `learningCount?: number` to `ViewTabsProps`. Add badge rendering matching the deep-read badge pattern but with teal color (`bg-teal-500/20 text-teal-400`).

- [ ] **Step 4: Update VALID_VIEWS in page.tsx**

```typescript
const VALID_VIEWS: ViewKey[] = ["inbox", "deep-read", "learning", "archive", "stats", "tag-feedback"];
```

- [ ] **Step 5: Add `learning` to Stats interface in page.tsx**

- [ ] **Step 6: Pass `learningCount={stats?.learning}` to ViewTabs**

- [ ] **Step 7: Verify type check and commit**

```bash
git add src/components/ViewTabs.tsx src/app/page.tsx
git commit -m "feat(ui): add learning tab to ViewTabs with badge count"
```

---

### Task 5: Frontend — LearningDashboard, LearningCard, LearningPanel

**Files:**
- Create: `src/components/LearningDashboard.tsx`
- Create: `src/components/LearningCard.tsx`
- Create: `src/components/LearningPanel.tsx`

- [ ] **Step 1: Create `LearningCard.tsx`**

Card component showing: title, first 3 tags, progress bar (0-5 tools), progress color coding (blue 0% → amber 1-3 → green 4-5), selected state.

- [ ] **Step 2: Create `LearningPanel.tsx`**

Right panel with: header (title + source info), 5-tab bar with green dots for generated tabs, content area that renders the appropriate tool view component, bottom bar with progress count + "已掌握 → 确认归档" button. Loads all cached materials on excerpt change. Handles generate button for ungenerated tools.

- [ ] **Step 3: Create `LearningDashboard.tsx`**

Main layout: left card grid (`w-80`, single column) + right panel. Fetches learning excerpts from `/api/learning/excerpts`. Manages selected state. Passes `onFinish` callback to panel.

- [ ] **Step 4: Verify type check and commit**

```bash
git add src/components/LearningDashboard.tsx src/components/LearningCard.tsx src/components/LearningPanel.tsx
git commit -m "feat(ui): add LearningDashboard, LearningCard, LearningPanel components"
```

---

### Task 6: Frontend — Learning tool views (Summary, Quiz, Flashcard, QA)

**Files:**
- Create: `src/components/SummaryView.tsx`
- Create: `src/components/QuizView.tsx`
- Create: `src/components/FlashcardView.tsx`
- Create: `src/components/QAView.tsx`

- [ ] **Step 1: Create `SummaryView.tsx`**

Keywords as teal pills + markdown-rendered summary text (reuse ReactMarkdown + remarkGfm).

- [ ] **Step 2: Create `QuizView.tsx`**

Interactive quiz: question text + option buttons → click to select → reveal (green correct, red wrong + explanation) → Next button → final score + Retry.

- [ ] **Step 3: Create `FlashcardView.tsx`**

Flip card: front (question) centered → click to flip → back (answer) → ← → navigation buttons → counter.

- [ ] **Step 4: Create `QAView.tsx`**

Chat interface: scrollable message history (question right-aligned, answer left-aligned) + input + send button. Fetches from `/api/learning/ask`. Loading state with "Thinking..." indicator.

- [ ] **Step 5: Verify type check and commit**

```bash
git add src/components/SummaryView.tsx src/components/QuizView.tsx src/components/FlashcardView.tsx src/components/QAView.tsx
git commit -m "feat(ui): add SummaryView, QuizView, FlashcardView, QAView components"
```

---

### Task 7: Integration — Wire learning tab into page.tsx and modify ReadingPanel

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/ReadingPanel.tsx`

- [ ] **Step 1: Add LearningDashboard import and render in page.tsx**

Import `LearningDashboard`. Add `handleLearningFinish(id)` callback that: POSTs to `/api/learning/finish`, switches to deep-read tab, loads deep-read list, auto-selects the excerpt. Add rendering block for `activeView === "learning"`.

- [ ] **Step 2: Modify ReadingPanel — archive choice dialog in deep-read mode**

Add `onStartLearning` prop. In deep-read mode, replace the archive button with a dropdown that offers "直接归档" and "进入内化". The "进入内化" option calls `/api/learning/start` then fires `onStartLearning` callback.

- [ ] **Step 3: Pass `onStartLearning` callback from page.tsx**

In deep-read ReadingPanel, pass callback that removes item from deep-read list and updates stats (`deep_read -1`, `learning +1`).

- [ ] **Step 4: Handle learning→archive detection**

When an excerpt returns from learning to deep-read (for metadata confirmation), detect that it has a learning session. On archive, use `/api/learning/archive` instead of `/api/archive` to ensure cleanup. Check by fetching `/api/learning/material?excerpt_id=X&tool_type=summary` on excerpt load — if it exists, set `hasLearningSession = true` and route archive through the learning archive endpoint.

**Important:** The existing `handleArchive` calls `saveTagFeedback(tags)` before archiving. Ensure this is still called before the learning archive POST, just like the normal archive flow.

- [ ] **Step 5: Verify type check and dev server**

```bash
npx tsc --noEmit 2>&1 | grep -v learn-claude-code
npm run dev
```

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx src/components/ReadingPanel.tsx
git commit -m "feat: integrate learning dashboard with archive choice dialog"
```

---

### Task 8: Final Wiring — Exclude learning from inbox, update hints

**Files:**
- Modify: `src/app/api/excerpts/route.ts`
- Modify: `src/components/ReadingPanel.tsx`

- [ ] **Step 1: Add `exclude_learning: true` to excerpts API filters**

In `src/app/api/excerpts/route.ts`, add alongside `exclude_deep_read: true`.

- [ ] **Step 2: Update deep-read keyboard hints**

Change to: `"S 跳过 · Enter 归档/内化 · D 删除 · 1-5 评分 · T AI标签 · F 翻译 · G 排版"`. Remove the standalone `N` keyboard shortcut for NotebookLM push.

- [ ] **Step 3: Type check and commit**

```bash
npx tsc --noEmit 2>&1 | grep -v learn-claude-code
git add src/app/api/excerpts/route.ts src/components/ReadingPanel.tsx
git commit -m "feat: exclude learning from inbox, update keyboard hints"
```

---

### Task 9: Smoke Test

- [ ] **Step 1: Verify all tabs load without errors**

Start dev server, click through all tabs, check browser console for errors.

- [ ] **Step 2: Test end-to-end flow (requires NotebookLM auth)**

1. 精读 tab → select article → click "归档" → see choice dialog
2. Click "进入内化" → article moves to 内化 tab
3. 内化 tab → click card → panel opens → click Generate on Summary
4. Click "已掌握 → 确认归档" → switches to 精读 tab
5. Confirm metadata → archive → verify NotebookLM source cleaned up

- [ ] **Step 3: Commit any fixes**
