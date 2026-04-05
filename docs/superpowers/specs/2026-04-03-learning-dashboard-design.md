# Learning Dashboard (内化页签) Design Spec

## Overview

Add a "内化" (internalization/learning) phase between deep-read and archive. Users push high-value excerpts to NotebookLM, then use AI-generated learning tools (summary, quiz, flashcard, audio podcast, Q&A) to deeply internalize the content before archiving.

**Workflow:**
```
Inbox → 精读 (deep_read) → 内化 (learning) → 确认元数据 → 归档 (archived)
```

## Requirements

- Dashboard layout: card grid (left) + tool panel (right)
- 5 learning tools: Summary, Quiz, Flashcard, Audio, Q&A
- Quiz: interactive (answer, reveal, score tracking)
- Flashcard: flip-card interaction (front: question, back: answer, navigation)
- Audio: generate via NotebookLM, download to local `.nosync/audio/`
- Q&A: chat-style interface with history
- All generated materials cached in SQLite (avoid repeat API calls)
- Entry: deep-read completion triggers choice dialog — "直接归档" or "进入内化"
- Exit: "已掌握" → returns to deep-read panel to confirm tags/signal → normal archive flow
- Archive cleanup: automatically deletes NotebookLM source + local materials

## NotebookLM Scoping Strategy

All excerpts share a single NotebookLM notebook (`NOTEBOOKLM_NOTEBOOK_ID`). Each excerpt is added as an individual **source** within that notebook.

**Critical:** NotebookLM artifact generation (quiz, flashcard, audio) is **notebook-level** by default, meaning it draws from all sources. To isolate generation to a single excerpt, all generate commands must pass `--source-id` to scope the operation to that specific source via the library's `source_ids` parameter.

**Summary** uses a different approach: `sources.get_guide(source_id)` returns a per-source summary natively (no scoping needed).

**Audio** is notebook-level and cannot be scoped to a single source. When generating audio for an excerpt, the audio may reference other sources in the notebook. This is acceptable since cross-pollination can aid learning.

## Data Model

### New Table: `learning_sessions`

Tracks the NotebookLM source lifecycle per excerpt.

```sql
CREATE TABLE learning_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  excerpt_id INTEGER NOT NULL UNIQUE,
  notebooklm_source_id TEXT NOT NULL,   -- NotebookLM source ID for this excerpt
  conversation_id TEXT,                  -- Q&A conversation ID for follow-ups
  created_at TEXT DEFAULT (datetime('now'))
);
```

### New Table: `learning_materials`

Caches generated learning materials.

```sql
CREATE TABLE learning_materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  excerpt_id INTEGER NOT NULL,
  tool_type TEXT NOT NULL,          -- 'summary' | 'quiz' | 'flashcard' | 'audio' | 'qa'
  content TEXT NOT NULL,            -- JSON (normalized by CLI script)
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(excerpt_id, tool_type)     -- one per tool per excerpt (qa appends to content)
);
```

### Content JSON Schemas

The CLI script normalizes NotebookLM's internal formats to these schemas.

**Summary** (from `sources.get_guide()`):
```json
{ "text": "markdown summary content...", "keywords": ["keyword1", "keyword2"] }
```

**Quiz** (normalized from NotebookLM's `answerOptions` format):
```json
{
  "questions": [
    {
      "question": "What pattern does the agent loop use?",
      "options": ["Chain of Thought", "ReAct", "Tree of Thought", "MCTS"],
      "answer": 1,
      "explanation": "ReAct combines reasoning traces with actions..."
    }
  ]
}
```

**Flashcard** (normalized from NotebookLM's `{f, b}` format):
```json
{
  "cards": [
    { "front": "What is the ReAct pattern?", "back": "A framework combining reasoning and action..." }
  ]
}
```

**Audio:**
```json
{ "file_path": ".nosync/audio/42.mp4", "duration": "5:32" }
```

Note: NotebookLM generates audio in MP4 format (audio/mp4), not MP3.

**Q&A:**
```json
{
  "conversation_id": "uuid-from-notebooklm",
  "messages": [
    { "question": "核心假设是什么?", "answer": "The core assumption is...", "timestamp": "2026-04-03T12:00:00" }
  ]
}
```

The `conversation_id` is returned by NotebookLM on the first ask and must be passed to subsequent asks for conversation continuity.

### Status Flow

New status value `learning` added to the excerpt lifecycle:

```
to_process → deep_read → learning → deep_read (confirm) → archived
                       ↘ archived (direct)
```

- `getExcerpts()`: add `exclude_learning` flag (set `true` alongside existing `exclude_deep_read`)
- `upsertExcerpt()`: add `'learning'` to preserved statuses: `IN ('deep_read', 'learning', 'archived')`
- `getStats()`: returns new `learning` count
- ViewTabs shows badge on learning tab

### Status-to-Frontmatter Mapping

| DB Status | Frontmatter Status |
|-----------|-------------------|
| `to_process` | (none or empty) |
| `deep_read` | `精读` |
| `learning` | `内化` |
| `archived` | `已归档` |

### Progress Definition

A tool is "completed" when a `learning_materials` row exists for that `(excerpt_id, tool_type)`. Progress = completed tools count / 5.

## API Routes

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/learning/start` | POST | `{id}` — Push excerpt to NotebookLM, set status to `learning`, create session |
| `/api/learning/excerpts` | GET | List all `learning` status excerpts with progress info |
| `/api/learning/generate` | POST | `{excerpt_id, tool_type}` — Generate material via NotebookLM CLI, cache in DB |
| `/api/learning/material` | GET | `?excerpt_id=X&tool_type=Y` — Fetch cached material |
| `/api/learning/ask` | POST | `{excerpt_id, question}` — Real-time Q&A, append to cached messages |
| `/api/learning/audio-download` | GET | `?excerpt_id=X` — Serve downloaded audio file |
| `/api/learning/finish` | POST | `{id}` — Set status back to `deep_read` for metadata confirmation |
| `/api/learning/archive` | POST | `{id, tags, signal, source_type}` — Archive + cleanup |

### API Flow Examples

**Start learning (idempotent):**
```
POST /api/learning/start { id: 42 }
  → Check if excerpt already has status 'learning'
    → If yes: return existing session (idempotent)
  → Read excerpt content from file (strip frontmatter)
  → Call Python: notebooklm-cli.py add-source --notebook-id=X --title="..."
  → INSERT INTO learning_sessions (excerpt_id, notebooklm_source_id)
  → Update excerpt status to 'learning'
  → Update frontmatter status to '内化'
  → Log activity (action: 'learning_start')
  → Return { success: true, source_id: "abc123" }
```

**Generate quiz (source-scoped):**
```
POST /api/learning/generate { excerpt_id: 42, tool_type: "quiz" }
  → Check learning_materials cache → miss
  → Lookup source_id from learning_sessions
  → Call Python: notebooklm-cli.py generate --notebook-id=X --type=quiz --source-id=abc123
  → CLI normalizes output to our JSON schema
  → INSERT INTO learning_materials
  → Return { success: true, content: {questions: [...]} }
```

**Generate summary (per-source guide):**
```
POST /api/learning/generate { excerpt_id: 42, tool_type: "summary" }
  → Check learning_materials cache → miss
  → Lookup source_id from learning_sessions
  → Call Python: notebooklm-cli.py guide --notebook-id=X --source-id=abc123
  → Return { success: true, content: {text: "...", keywords: [...]} }
```

**Q&A with conversation continuity:**
```
POST /api/learning/ask { excerpt_id: 42, question: "核心假设是什么？" }
  → Lookup conversation_id from learning_sessions (may be null on first ask)
  → Call Python: notebooklm-cli.py ask --notebook-id=X --question="..." [--conversation-id=Y]
  → If first ask: UPDATE learning_sessions SET conversation_id = returned_id
  → Append {question, answer, timestamp} to learning_materials (tool_type='qa')
  → Return { answer: "..." }
```

**Archive with cleanup:**
```
POST /api/learning/archive { id: 42, tags: [...], signal: 4, source_type: "article" }
  → Query learning_sessions for source_id
  → Call Python: notebooklm-cli.py delete-source --notebook-id=X --source-id=abc123
  → Call existing archiveExcerpt() from @/lib/archiver (reuse, don't duplicate)
  → DELETE FROM learning_materials WHERE excerpt_id = 42
  → DELETE FROM learning_sessions WHERE excerpt_id = 42
  → Delete .nosync/audio/42.mp4 if exists
  → Return { success: true }
```

## Python Script: `scripts/notebooklm-cli.py`

Replaces existing `push-to-notebooklm.py`. Unified CLI with subcommands.

All commands output JSON to stdout. Errors: `{"error": "message"}` + exit code 1. Uses project venv at `.venv/bin/python3` with `notebooklm-py` library.

The CLI is responsible for **normalizing** NotebookLM's internal data formats to the JSON schemas defined above.

```bash
# Add source (stdin for content)
echo "content" | python notebooklm-cli.py add-source --notebook-id=X --title="Title"
# → {"success": true, "source_id": "abc123"}

# Generate learning material (source-scoped)
python notebooklm-cli.py generate --notebook-id=X --type=quiz --source-id=abc123
python notebooklm-cli.py generate --notebook-id=X --type=flashcards --source-id=abc123
# → {"success": true, "content": {...normalized JSON...}}

# Get source guide (summary)
python notebooklm-cli.py guide --notebook-id=X --source-id=abc123
# → {"success": true, "content": {"text": "...", "keywords": [...]}}

# Generate and download audio (notebook-level, cannot scope to source)
python notebooklm-cli.py generate-audio --notebook-id=X --output=.nosync/audio/42.mp4
# → {"success": true, "file_path": "...", "duration": "5:32"}

# Ask question (with optional conversation continuity)
python notebooklm-cli.py ask --notebook-id=X --question="..."
python notebooklm-cli.py ask --notebook-id=X --question="..." --conversation-id=Y
# → {"success": true, "answer": "...", "conversation_id": "uuid"}

# Delete source
python notebooklm-cli.py delete-source --notebook-id=X --source-id=abc123
# → {"success": true}
```

### Timeout Configuration

| Command | Timeout | Reason |
|---------|---------|--------|
| add-source | 30s | Fast text upload |
| generate (quiz/flashcard) | 60s | AI generation |
| guide (summary) | 30s | Pre-computed by NotebookLM |
| generate-audio | 300s | Audio synthesis can take several minutes |
| ask | 30s | Single Q&A turn |
| delete-source | 15s | Simple deletion |

## Error Handling

### CLI Failure Categories

| Error | User-Facing Message | Action |
|-------|---------------------|--------|
| Auth expired (`FileNotFoundError` / cookie invalid) | "NotebookLM 登录已过期，请在终端运行 notebooklm login" | Toast notification |
| Rate limited | "请求过于频繁，请稍后重试" | Toast, no retry |
| Timeout | "生成超时，请重试" | Toast, user can retry |
| Network error | "网络连接失败" | Toast |
| Unknown error | "操作失败: {error message}" | Toast with details |

### Idempotency

- `/api/learning/start`: If excerpt already has status `learning`, return existing session data
- `/api/learning/generate`: If material already cached, return cached version (no re-generation)
- Re-generation: not supported in v1 (user would need to delete material manually if they want fresh content)

## Frontend Components

### New Components

| Component | Description |
|-----------|-------------|
| `LearningDashboard.tsx` | Main layout: card grid + side panel |
| `LearningCard.tsx` | Article card: title, tags, progress bar, last activity |
| `LearningPanel.tsx` | Right panel: tab bar + tool content area + bottom actions |
| `QuizView.tsx` | Interactive quiz: show question → select answer → reveal correct/incorrect → score |
| `FlashcardView.tsx` | Flip card: front (question) → click to flip (answer) → arrows to navigate → counter |
| `SummaryView.tsx` | Markdown-rendered summary (reuse ReactMarkdown) |
| `QAView.tsx` | Chat interface: scrollable history + input box + send button |

### LearningDashboard Layout

```
┌─────────────────────────────────────────────────────┐
│ ViewTabs: [Inbox] [精读] [内化 (3)] [归档] [统计]    │
├──────────────────┬──────────────────────────────────┤
│ Card Grid        │ Learning Panel                   │
│                  │                                  │
│ ┌──────┐┌──────┐│ Title: AI Agent Architecture     │
│ │Card 1││Card 2││ Source: RSS · 2026-03-28          │
│ │60%   ││20%   ││──────────────────────────────────│
│ └──────┘└──────┘│ [Summary][Quiz][Flash][Audio][QA] │
│ ┌──────┐┌──────┐│                                  │
│ │Card 3││Card 4││ (active tool content area)        │
│ │0%    ││80%   ││                                  │
│ └──────┘└──────┘│                                  │
│                  │──────────────────────────────────│
│                  │ 3/5 completed  [已掌握→确认归档]  │
└──────────────────┴──────────────────────────────────┘
```

### Card Grid Details

- Responsive grid: 2 columns default, adapts to width
- Card shows: title, first 3 tags as pills, progress bar (0-5 tools), last activity relative time
- Progress color: blue (0%) → amber (1-3) → green (4-5)
- Selected card has accent border
- Empty state: "精读中遇到值得深入学习的内容时，选择'进入内化'即可在这里管理"

### Tab Bar Details

- 5 tabs: Summary, Quiz, Flashcard, Audio, Q&A
- Tab states: gray (not generated), green dot (generated), active (underlined)
- Ungenerated tab content shows centered "Generate" button
- Loading state: spinner + "生成中..."（Audio additionally shows "可能需要几分钟"）

### Quiz Interaction

1. Show question text + numbered options
2. User clicks an option → highlight selection
3. Reveal: correct option turns green, wrong selection turns red + show explanation
4. "Next" button advances to next question
5. After last question: score summary "6/8 correct (75%)" + "Retry" button
6. Retry resets all answers

### Flashcard Interaction

1. Card shows front (question) centered, large text
2. Click card → flip animation → shows back (answer)
3. Left/right arrow buttons (or keyboard ←→) navigate between cards
4. Bottom: "3 / 12" counter
5. Click flipped card → flips back to front of same card

### Q&A Interaction

1. Scrollable area shows history: alternating question (right-aligned) and answer (left-aligned) bubbles
2. Bottom: text input + send button
3. Send: POST to `/api/learning/ask` → append to history → scroll to bottom
4. Loading: typing indicator while waiting for response
5. Empty state: "Ask any question about this article"

### Deep-Read Panel Modification

Current "归档" button in deep-read mode changes behavior:
- Click "归档" → modal/popover appears with two options:
  - "直接归档" → existing archive flow
  - "进入内化" → POST `/api/learning/start` → remove from deep-read list → toast "已加入内化队列"

### Learning → Archive Flow

1. User clicks "已掌握 → 确认归档" in learning panel
2. POST `/api/learning/finish` → status changes to `deep_read`
3. UI callback: `handleLearningFinish(id)` calls `setActiveView("deep-read")` + `loadDeepRead()` + `setDeepReadSelectedId(id)`
4. User reviews/adjusts tags, signal, source_type in ReadingPanel
5. User clicks "归档" → this excerpt has a learning_session, so the archive flow calls `/api/learning/archive` instead of `/api/archive` to handle cleanup

## File Storage

- Audio files: `.nosync/audio/{excerpt_id}.mp4`
- `.nosync/` is already gitignored and excluded from iCloud sync
- Audio directory created on first download if it doesn't exist
- Audio files are cleaned up on archive

## Environment

- Existing: `NOTEBOOKLM_NOTEBOOK_ID` in `.env.local` (already configured)
- Python venv: `.venv/bin/python3` (already set up with `notebooklm-py`)
- No new npm dependencies needed

## Files to Create/Modify

### New Files
- `scripts/notebooklm-cli.py` — unified NotebookLM CLI script (replaces `push-to-notebooklm.py`)
- `src/app/api/learning/start/route.ts`
- `src/app/api/learning/excerpts/route.ts`
- `src/app/api/learning/generate/route.ts`
- `src/app/api/learning/material/route.ts`
- `src/app/api/learning/ask/route.ts`
- `src/app/api/learning/audio-download/route.ts`
- `src/app/api/learning/finish/route.ts`
- `src/app/api/learning/archive/route.ts`
- `src/components/LearningDashboard.tsx`
- `src/components/LearningCard.tsx`
- `src/components/LearningPanel.tsx`
- `src/components/QuizView.tsx`
- `src/components/FlashcardView.tsx`
- `src/components/SummaryView.tsx`
- `src/components/QAView.tsx`

### Modified Files
- `db/schema.sql` — add `learning_sessions` and `learning_materials` tables
- `src/lib/db.ts` — add learning queries, update getExcerpts to exclude learning, update upsertExcerpt to preserve learning status, update getStats
- `src/components/ViewTabs.tsx` — add learning tab
- `src/components/ReadingPanel.tsx` — deep-read archive button → choice dialog
- `src/app/page.tsx` — add learning state, load function, tab rendering, handleLearningFinish callback

### Deleted Files
- `scripts/push-to-notebooklm.py` — replaced by `notebooklm-cli.py`
