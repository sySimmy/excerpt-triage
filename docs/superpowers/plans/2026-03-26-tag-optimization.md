# AI Tag Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-optimization pipeline that automatically improves AI tag recommendation accuracy based on accumulated user feedback.

**Architecture:** Every 20 archives, a batch optimization pipeline analyzes full feedback history, generates rule-based proposals, sends them to MiniMax for refinement, and writes dynamic prompt fragments + vocabulary changes to SQLite. The suggest-tags endpoint reads these at runtime to assemble an improved prompt. Frontend displays optimization status, trigger button, and run history.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, SQLite via better-sqlite3, MiniMax API, React 19, SWR, Tailwind CSS 4

**Spec:** `docs/superpowers/specs/2026-03-26-tag-optimization-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `db/schema.sql` | Modify | Add 3 new tables: optimization_runs, dynamic_vocab, prompt_overrides |
| `src/lib/tag-vocab.ts` | Modify | Add `inferTier()`, `computeEffectiveVocab()` |
| `src/lib/tag-optimization.ts` | Create | Core optimization logic: stats, proposals, actions, limits, prompt building |
| `src/app/api/tag-optimization/status/route.ts` | Create | GET: check if optimization threshold reached |
| `src/app/api/tag-optimization/run/route.ts` | Create | POST: execute optimization pipeline |
| `src/app/api/tag-optimization/history/route.ts` | Create | GET: return optimization run history |
| `src/app/api/tag-optimization/vocab/route.ts` | Create | GET: return effective vocabulary |
| `src/app/api/suggest-tags/route.ts` | Modify | Replace hardcoded prompt with `buildSystemPrompt()` |
| `src/components/TagFeedbackView.tsx` | Modify | Add optimization trigger, history, dynamic vocab markers |

---

### Task 1: Database Schema

**Files:**
- Modify: `db/schema.sql`

- [ ] **Step 1: Add three new tables to schema.sql**

Append after the `tag_feedback` indexes (line 57):

```sql
-- === Tag Optimization ===

CREATE TABLE IF NOT EXISTS optimization_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feedback_window_start INTEGER NOT NULL,
  feedback_window_end INTEGER NOT NULL,
  feedback_count INTEGER NOT NULL,
  total_feedback_count INTEGER NOT NULL,
  stats_snapshot TEXT NOT NULL,
  ai_response TEXT,
  actions_taken TEXT NOT NULL DEFAULT '[]',
  precision_before REAL,
  recall_before REAL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dynamic_vocab (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tag TEXT NOT NULL UNIQUE,
  tier TEXT NOT NULL CHECK(tier IN ('tier2_tools','tier3_topics')),
  action TEXT NOT NULL CHECK(action IN ('add','remove')),
  reason TEXT,
  cooldown_until TEXT,
  oscillation_count INTEGER DEFAULT 0,
  source_run_id INTEGER REFERENCES optimization_runs(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS prompt_overrides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  override_type TEXT NOT NULL CHECK(override_type IN (
    'few_shot','negative_example','rule_adjustment','tag_note'
  )),
  content TEXT NOT NULL,
  target_tag TEXT,
  priority INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  source_run_id INTEGER REFERENCES optimization_runs(id),
  created_at TEXT DEFAULT (datetime('now'))
);
```

- [ ] **Step 2: Verify schema loads**

Run: `npm run dev`

Open `http://localhost:3456` — page should load without DB errors. Check terminal for no schema-related errors.

- [ ] **Step 3: Commit**

```bash
git add db/schema.sql
git commit -m "feat(db): add optimization_runs, dynamic_vocab, prompt_overrides tables"
```

---

### Task 2: Tag Vocabulary Extensions

**Files:**
- Modify: `src/lib/tag-vocab.ts`

- [ ] **Step 1: Add `inferTier()` function**

Add after the existing `isVocabTag()` function (line 66):

```typescript
export function inferTier(tag: string): "tier2_tools" | "tier3_topics" {
  const group = getTagGroup(tag);
  if (group === "tool") return "tier2_tools";
  return "tier3_topics";
}
```

- [ ] **Step 2: Add `computeEffectiveVocab()` function**

This is a pure function — takes dynamic changes as input, returns merged vocab. Add after `inferTier()`:

```typescript
export interface EffectiveVocab {
  tier1: string[];
  tier2: string[];
  tier3: string[];
}

export function computeEffectiveVocab(
  dynamicChanges: { tag: string; tier: string; action: string }[]
): EffectiveVocab {
  const tier2 = new Set<string>(TIER2_TOOLS);
  const tier3 = new Set<string>(TIER3_TOPICS);

  for (const { tag, tier, action } of dynamicChanges) {
    const targetSet = tier === "tier2_tools" ? tier2 : tier3;
    if (action === "add") {
      targetSet.add(tag);
      // Dedup: remove from the other tier if present
      const otherSet = tier === "tier2_tools" ? tier3 : tier2;
      otherSet.delete(tag);
    } else if (action === "remove") {
      targetSet.delete(tag);
    }
  }

  return {
    tier1: Object.keys(TIER1_DOMAIN),
    tier2: [...tier2],
    tier3: [...tier3],
  };
}
```

- [ ] **Step 3: Verify types**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/tag-vocab.ts
git commit -m "feat(tag-vocab): add inferTier and computeEffectiveVocab"
```

---

### Task 3: Core Optimization — Types and Trigger Check

**Files:**
- Create: `src/lib/tag-optimization.ts`

- [ ] **Step 1: Create file with types and trigger check**

```typescript
import { getDb } from "@/lib/db";
import {
  TIER1_DOMAIN,
  TIER2_TOOLS,
  TIER3_TOPICS,
  getTagGroup,
  inferTier,
  computeEffectiveVocab,
  type EffectiveVocab,
} from "@/lib/tag-vocab";

// === Types ===

export interface OptimizationStats {
  window: { startId: number; endId: number; incrementalCount: number };
  totalCount: number;
  avgPrecision: number;
  avgRecall: number;
  candidateAdoptionRate: number;
  tagStats: Record<
    string,
    {
      suggested: number;
      kept: number;
      removed: number;
      missedThenAdded: number;
      accuracy: number;
    }
  >;
  candidateStats: Record<
    string,
    {
      timesGenerated: number;
      timesAccepted: number;
      timesDismissed: number;
      distinctExcerptsAccepted: number;
      adoptionRate: number;
    }
  >;
}

export interface OptimizationProposal {
  type:
    | "promote_candidate"
    | "demote_tag"
    | "add_few_shot"
    | "add_negative"
    | "add_tag_note"
    | "adjust_rule";
  tag?: string;
  reason: string;
  stats: Record<string, number>;
}

export interface AIAction {
  proposal_index: number;
  approved: boolean;
  type?: string;
  content?: string;
  target_tag?: string;
  reason?: string;
}

// === Trigger Check ===

export function checkOptimizationTrigger(): {
  shouldRun: boolean;
  feedbackCount: number;
} {
  const db = getDb();
  const lastRun = db
    .prepare(
      "SELECT feedback_window_end FROM optimization_runs ORDER BY id DESC LIMIT 1"
    )
    .get() as { feedback_window_end: number } | undefined;

  const lastEndId = lastRun?.feedback_window_end ?? 0;
  const result = db
    .prepare("SELECT COUNT(*) as cnt FROM tag_feedback WHERE id > ?")
    .get(lastEndId) as { cnt: number };

  return { shouldRun: result.cnt >= 20, feedbackCount: result.cnt };
}
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/lib/tag-optimization.ts
git commit -m "feat(optimization): add types and trigger check"
```

---

### Task 4: Core Optimization — Stats Computation

**Files:**
- Modify: `src/lib/tag-optimization.ts`

- [ ] **Step 1: Add `computeOptimizationStats()`**

Add after the trigger check function:

```typescript
export function computeOptimizationStats(): OptimizationStats {
  const db = getDb();

  // Determine incremental window
  const lastRun = db
    .prepare(
      "SELECT feedback_window_end FROM optimization_runs ORDER BY id DESC LIMIT 1"
    )
    .get() as { feedback_window_end: number } | undefined;
  const lastEndId = lastRun?.feedback_window_end ?? 0;

  const windowBounds = db
    .prepare(
      "SELECT MIN(id) as startId, MAX(id) as endId, COUNT(*) as cnt FROM tag_feedback WHERE id > ?"
    )
    .get(lastEndId) as { startId: number; endId: number; cnt: number };

  // Full history analysis (only AI-used sessions)
  const rows = db
    .prepare(
      "SELECT * FROM tag_feedback WHERE ai_suggested != '[]' ORDER BY id"
    )
    .all() as Array<{
    id: number;
    excerpt_id: number;
    tags_before_ai: string;
    ai_suggested: string;
    ai_candidates: string;
    accepted_candidates: string;
    dismissed_candidates: string;
    user_added: string;
    user_removed: string;
    final_tags: string;
  }>;

  const tagStats: OptimizationStats["tagStats"] = {};
  const candidateMap = new Map<
    string,
    {
      generated: number;
      accepted: number;
      dismissed: number;
      excerptIds: Set<number>;
    }
  >();

  let totalPrecision = 0;
  let totalRecall = 0;

  for (const row of rows) {
    const aiSuggested = JSON.parse(row.ai_suggested) as string[];
    const finalTags = JSON.parse(row.final_tags) as string[];
    const userAdded = JSON.parse(row.user_added) as string[];
    const tagsBeforeAI = JSON.parse(row.tags_before_ai) as string[];
    const aiCandidates = JSON.parse(row.ai_candidates) as string[];
    const acceptedCands = JSON.parse(row.accepted_candidates) as string[];
    const dismissedCands = JSON.parse(row.dismissed_candidates) as string[];

    // Per-tag stats
    const aiKept = aiSuggested.filter((t) => finalTags.includes(t));
    for (const tag of aiSuggested) {
      if (!tagStats[tag])
        tagStats[tag] = {
          suggested: 0,
          kept: 0,
          removed: 0,
          missedThenAdded: 0,
          accuracy: 0,
        };
      tagStats[tag].suggested++;
      if (aiKept.includes(tag)) tagStats[tag].kept++;
      else tagStats[tag].removed++;
    }
    for (const tag of userAdded) {
      if (!tagStats[tag])
        tagStats[tag] = {
          suggested: 0,
          kept: 0,
          removed: 0,
          missedThenAdded: 0,
          accuracy: 0,
        };
      tagStats[tag].missedThenAdded++;
    }

    // Per-candidate stats
    for (const c of aiCandidates) {
      if (!candidateMap.has(c))
        candidateMap.set(c, {
          generated: 0,
          accepted: 0,
          dismissed: 0,
          excerptIds: new Set(),
        });
      candidateMap.get(c)!.generated++;
    }
    for (const c of acceptedCands) {
      if (!candidateMap.has(c))
        candidateMap.set(c, {
          generated: 0,
          accepted: 0,
          dismissed: 0,
          excerptIds: new Set(),
        });
      candidateMap.get(c)!.accepted++;
      candidateMap.get(c)!.excerptIds.add(row.excerpt_id);
    }
    for (const c of dismissedCands) {
      if (!candidateMap.has(c))
        candidateMap.set(c, {
          generated: 0,
          accepted: 0,
          dismissed: 0,
          excerptIds: new Set(),
        });
      candidateMap.get(c)!.dismissed++;
    }

    // Precision & recall
    const precision =
      aiSuggested.length > 0 ? aiKept.length / aiSuggested.length : 1;
    const newFinalTags = finalTags.filter((t) => !tagsBeforeAI.includes(t));
    const recall =
      newFinalTags.length > 0 ? aiKept.length / newFinalTags.length : 1;
    totalPrecision += precision;
    totalRecall += recall;
  }

  // Compute accuracy for each tag
  for (const stat of Object.values(tagStats)) {
    stat.accuracy = stat.suggested > 0 ? stat.kept / stat.suggested : 0;
  }

  // Convert candidate map
  const candidateStats: OptimizationStats["candidateStats"] = {};
  let totalCandAccepted = 0;
  let totalCandGenerated = 0;
  for (const [tag, data] of candidateMap) {
    candidateStats[tag] = {
      timesGenerated: data.generated,
      timesAccepted: data.accepted,
      timesDismissed: data.dismissed,
      distinctExcerptsAccepted: data.excerptIds.size,
      adoptionRate: data.generated > 0 ? data.accepted / data.generated : 0,
    };
    totalCandAccepted += data.accepted;
    totalCandGenerated += data.generated;
  }

  return {
    window: {
      startId: windowBounds.startId ?? 0,
      endId: windowBounds.endId ?? 0,
      incrementalCount: windowBounds.cnt,
    },
    totalCount: rows.length,
    avgPrecision: rows.length > 0 ? totalPrecision / rows.length : 0,
    avgRecall: rows.length > 0 ? totalRecall / rows.length : 0,
    candidateAdoptionRate:
      totalCandGenerated > 0 ? totalCandAccepted / totalCandGenerated : 0,
    tagStats,
    candidateStats,
  };
}
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/lib/tag-optimization.ts
git commit -m "feat(optimization): add stats computation from full feedback history"
```

---

### Task 5: Core Optimization — Proposal Generation

**Files:**
- Modify: `src/lib/tag-optimization.ts`

- [ ] **Step 1: Add `generateProposals()`**

Add after `computeOptimizationStats()`:

```typescript
export function generateProposals(
  stats: OptimizationStats
): OptimizationProposal[] {
  const db = getDb();
  const proposals: OptimizationProposal[] = [];

  // 1. Promote high-adoption candidates to tier3
  for (const [tag, cs] of Object.entries(stats.candidateStats)) {
    if (cs.distinctExcerptsAccepted >= 3 && cs.adoptionRate >= 0.6) {
      proposals.push({
        type: "promote_candidate",
        tag,
        reason: `在 ${cs.distinctExcerptsAccepted} 个不同摘录中被采纳，采纳率 ${(cs.adoptionRate * 100).toFixed(0)}%`,
        stats: {
          generated: cs.timesGenerated,
          accepted: cs.timesAccepted,
          distinctExcerpts: cs.distinctExcerptsAccepted,
        },
      });
    }
  }

  // 2. Demote low-accuracy vocab tags
  for (const [tag, ts] of Object.entries(stats.tagStats)) {
    if (tag in TIER1_DOMAIN) continue; // Never demote tier1
    if (ts.suggested >= 5 && ts.accuracy < 0.3) {
      // Check not already demoted
      const existing = db
        .prepare("SELECT action FROM dynamic_vocab WHERE tag = ?")
        .get(tag) as { action: string } | undefined;
      if (existing?.action === "remove") continue;

      proposals.push({
        type: "demote_tag",
        tag,
        reason: `准确率 ${(ts.accuracy * 100).toFixed(0)}%（推荐 ${ts.suggested} 次，仅保留 ${ts.kept} 次）`,
        stats: {
          suggested: ts.suggested,
          kept: ts.kept,
          removed: ts.removed,
          accuracy: ts.accuracy,
        },
      });
    }
  }

  // 3. Add negative examples for medium-accuracy tags
  for (const [tag, ts] of Object.entries(stats.tagStats)) {
    if (
      ts.suggested >= 5 &&
      ts.accuracy >= 0.3 &&
      ts.accuracy < 0.5
    ) {
      // Check no existing negative for this tag
      const existing = db
        .prepare(
          "SELECT id FROM prompt_overrides WHERE override_type = 'negative_example' AND target_tag = ? AND active = 1"
        )
        .get(tag);
      if (existing) continue;

      proposals.push({
        type: "add_negative",
        tag,
        reason: `准确率 ${(ts.accuracy * 100).toFixed(0)}%，需要明确何时不该推荐`,
        stats: {
          suggested: ts.suggested,
          kept: ts.kept,
          removed: ts.removed,
        },
      });
    }
  }

  // 4. Add few-shot for frequently missed tags
  for (const [tag, ts] of Object.entries(stats.tagStats)) {
    if (ts.suggested === 0 && ts.missedThenAdded >= 3) {
      // Check no existing few_shot for this tag
      const existing = db
        .prepare(
          "SELECT id FROM prompt_overrides WHERE override_type = 'few_shot' AND target_tag = ? AND active = 1"
        )
        .get(tag);
      if (existing) continue;

      proposals.push({
        type: "add_few_shot",
        tag,
        reason: `AI 从未推荐但用户手动添加 ${ts.missedThenAdded} 次`,
        stats: { missedThenAdded: ts.missedThenAdded },
      });
    }
  }

  // 5. Adjust rules for overall metrics
  if (stats.avgPrecision < 0.5 && stats.totalCount >= 10) {
    proposals.push({
      type: "adjust_rule",
      reason: `整体精确率 ${(stats.avgPrecision * 100).toFixed(0)}%，偏低，应倾向少推荐`,
      stats: { precision: stats.avgPrecision },
    });
  }
  if (stats.avgRecall < 0.4 && stats.totalCount >= 10) {
    proposals.push({
      type: "adjust_rule",
      reason: `整体召回率 ${(stats.avgRecall * 100).toFixed(0)}%，偏低，应倾向多推荐`,
      stats: { recall: stats.avgRecall },
    });
  }

  // 6. Restore demoted tags that users keep adding manually
  const demotedTags = db
    .prepare("SELECT tag, created_at, cooldown_until, oscillation_count FROM dynamic_vocab WHERE action = 'remove'")
    .all() as Array<{
    tag: string;
    created_at: string;
    cooldown_until: string | null;
    oscillation_count: number;
  }>;

  for (const dv of demotedTags) {
    // Skip if oscillation_count >= 3
    if (dv.oscillation_count >= 3) continue;
    // Skip if still in cooldown
    if (dv.cooldown_until && new Date(dv.cooldown_until) > new Date()) continue;

    // Count user_added for this tag AFTER demotion
    const rows = db
      .prepare(
        "SELECT user_added FROM tag_feedback WHERE created_at > ?"
      )
      .all(dv.created_at) as Array<{ user_added: string }>;

    let postDemotionAdds = 0;
    for (const row of rows) {
      const added = JSON.parse(row.user_added) as string[];
      if (added.includes(dv.tag)) postDemotionAdds++;
    }

    if (postDemotionAdds >= 3) {
      proposals.push({
        type: "promote_candidate",
        tag: dv.tag,
        reason: `被降权后用户仍手动添加 ${postDemotionAdds} 次，考虑恢复`,
        stats: { postDemotionAdds },
      });
    }
  }

  return proposals;
}
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/lib/tag-optimization.ts
git commit -m "feat(optimization): add proposal generation with all 6 rule types"
```

---

### Task 6: Core Optimization — Apply Actions and Limits

**Files:**
- Modify: `src/lib/tag-optimization.ts`

- [ ] **Step 1: Add `applyOptimizationActions()` and `enforceOverrideLimits()`**

Add after `generateProposals()`:

```typescript
export function applyOptimizationActions(
  runId: number,
  actions: AIAction[]
): AIAction[] {
  const db = getDb();
  const applied: AIAction[] = [];

  for (const action of actions) {
    if (!action.approved) {
      applied.push(action);
      continue;
    }

    switch (action.type) {
      case "promote_candidate": {
        if (!action.target_tag) break;
        const existing = db
          .prepare(
            "SELECT action, oscillation_count FROM dynamic_vocab WHERE tag = ?"
          )
          .get(action.target_tag) as
          | { action: string; oscillation_count: number }
          | undefined;
        const oscCount =
          existing?.action === "remove"
            ? (existing.oscillation_count ?? 0) + 1
            : existing?.oscillation_count ?? 0;
        db.prepare(`
          INSERT INTO dynamic_vocab (tag, tier, action, reason, cooldown_until, oscillation_count, source_run_id)
          VALUES (?,?,?,?,?,?,?)
          ON CONFLICT(tag) DO UPDATE SET
            tier = excluded.tier, action = excluded.action, reason = excluded.reason,
            cooldown_until = excluded.cooldown_until, oscillation_count = excluded.oscillation_count,
            source_run_id = excluded.source_run_id
        `).run(
          action.target_tag,
          "tier3_topics",
          "add",
          action.reason ?? action.content ?? "",
          null,
          oscCount,
          runId
        );
        applied.push(action);
        break;
      }

      case "demote_tag": {
        if (!action.target_tag) break;
        if (action.target_tag in TIER1_DOMAIN) break;
        const existing = db
          .prepare(
            "SELECT action, oscillation_count FROM dynamic_vocab WHERE tag = ?"
          )
          .get(action.target_tag) as
          | { action: string; oscillation_count: number }
          | undefined;
        const oscCount =
          existing?.action === "add"
            ? (existing.oscillation_count ?? 0) + 1
            : existing?.oscillation_count ?? 0;
        const cooldownDate = new Date();
        cooldownDate.setDate(cooldownDate.getDate() + 60);
        db.prepare(`
          INSERT INTO dynamic_vocab (tag, tier, action, reason, cooldown_until, oscillation_count, source_run_id, created_at)
          VALUES (?,?,?,?,?,?,?, datetime('now'))
          ON CONFLICT(tag) DO UPDATE SET
            tier = excluded.tier, action = excluded.action, reason = excluded.reason,
            cooldown_until = excluded.cooldown_until, oscillation_count = excluded.oscillation_count,
            source_run_id = excluded.source_run_id, created_at = excluded.created_at
        `).run(
          action.target_tag,
          inferTier(action.target_tag),
          "remove",
          action.reason ?? action.content ?? "",
          cooldownDate.toISOString(),
          oscCount,
          runId
        );
        applied.push(action);
        break;
      }

      case "few_shot":
      case "negative_example":
      case "tag_note":
      case "rule_adjustment":
        db.prepare(
          "INSERT INTO prompt_overrides (override_type, content, target_tag, source_run_id) VALUES (?,?,?,?)"
        ).run(
          action.type,
          action.content ?? "",
          action.target_tag ?? null,
          runId
        );
        applied.push(action);
        break;
    }
  }

  enforceOverrideLimits();
  return applied;
}

function enforceOverrideLimits() {
  const db = getDb();
  const limits: Record<string, number> = {
    few_shot: 10,
    negative_example: 10,
    tag_note: 15,
    rule_adjustment: 5,
  };

  for (const [type, limit] of Object.entries(limits)) {
    const result = db
      .prepare(
        "SELECT COUNT(*) as cnt FROM prompt_overrides WHERE override_type = ? AND active = 1"
      )
      .get(type) as { cnt: number };

    if (result.cnt > limit) {
      db.prepare(`
        UPDATE prompt_overrides SET active = 0
        WHERE id IN (
          SELECT id FROM prompt_overrides
          WHERE override_type = ? AND active = 1
          ORDER BY id ASC
          LIMIT ?
        )
      `).run(type, result.cnt - limit);
    }
  }
}
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/lib/tag-optimization.ts
git commit -m "feat(optimization): add action application and override limits"
```

---

### Task 7: Core Optimization — Prompt Building and DB Readers

**Files:**
- Modify: `src/lib/tag-optimization.ts`

- [ ] **Step 1: Add `buildSystemPrompt()`, `getEffectiveVocab()`, and read helpers**

Add after `enforceOverrideLimits()`:

```typescript
// === Prompt Building ===

export function getEffectiveVocab(): EffectiveVocab {
  const db = getDb();
  const dynamicChanges = db
    .prepare("SELECT tag, tier, action FROM dynamic_vocab")
    .all() as Array<{ tag: string; tier: string; action: string }>;
  return computeEffectiveVocab(dynamicChanges);
}

export function getDynamicVocabRows(): Array<{
  tag: string;
  tier: string;
  action: string;
  reason: string | null;
}> {
  const db = getDb();
  return db
    .prepare("SELECT tag, tier, action, reason FROM dynamic_vocab")
    .all() as Array<{
    tag: string;
    tier: string;
    action: string;
    reason: string | null;
  }>;
}

export function getActiveOverrides(): Array<{
  override_type: string;
  content: string;
  target_tag: string | null;
}> {
  const db = getDb();
  return db
    .prepare(
      "SELECT override_type, content, target_tag FROM prompt_overrides WHERE active = 1 ORDER BY priority DESC"
    )
    .all() as Array<{
    override_type: string;
    content: string;
    target_tag: string | null;
  }>;
}

export function buildSystemPrompt(): string {
  const vocab = getEffectiveVocab();
  const overrides = getActiveOverrides();

  const fewShots = overrides.filter((o) => o.override_type === "few_shot");
  const negatives = overrides.filter(
    (o) => o.override_type === "negative_example"
  );
  const tagNotes = overrides.filter((o) => o.override_type === "tag_note");
  const rules = overrides.filter(
    (o) => o.override_type === "rule_adjustment"
  );

  // Format vocabulary
  const domainBlock = Object.entries(TIER1_DOMAIN)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  const toolsBlock = vocab.tier2.join(", ");
  const topicsBlock = vocab.tier3.join(", ");

  let prompt = `你是一个内容标签分类助手。根据文章标题和内容推荐标签。

## 标签词汇表

### 领域标签（必选一个）
${domainBlock}

### 工具标签（可选）
${toolsBlock}

### 主题标签（可选）
${topicsBlock}

## 分类规则
1. tags 数组只能包含词表中的标签
2. tags 必须包含至少一个领域标签
3. candidates 只在词表确实无法覆盖时才建议
4. 不要重复已有标签${rules.length > 0 ? "\n" + rules.map((r) => `5. ${r.content}`).join("\n") : ""}`;

  if (fewShots.length > 0) {
    prompt += `\n\n## 正面示例（参考这些场景选择标签）\n${fewShots
      .map(
        (f) =>
          `- ${f.target_tag ? `[${f.target_tag}] ` : ""}${f.content}`
      )
      .join("\n")}`;
  }

  if (negatives.length > 0) {
    prompt += `\n\n## 注意事项（避免以下错误）\n${negatives
      .map(
        (n) =>
          `- ${n.target_tag ? `[${n.target_tag}] ` : ""}${n.content}`
      )
      .join("\n")}`;
  }

  if (tagNotes.length > 0) {
    prompt += `\n\n## 标签说明\n${tagNotes
      .map((t) => `- ${t.target_tag}: ${t.content}`)
      .join("\n")}`;
  }

  return prompt;
}

// === History ===

export function getOptimizationHistory(): Array<{
  id: number;
  created_at: string;
  feedback_count: number;
  total_feedback_count: number;
  precision_before: number | null;
  recall_before: number | null;
  actions_taken: AIAction[];
  ai_response_error: boolean;
}> {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT id, created_at, feedback_count, total_feedback_count, precision_before, recall_before, actions_taken, ai_response FROM optimization_runs ORDER BY id DESC LIMIT 10"
    )
    .all() as Array<{
    id: number;
    created_at: string;
    feedback_count: number;
    total_feedback_count: number;
    precision_before: number | null;
    recall_before: number | null;
    actions_taken: string;
    ai_response: string | null;
  }>;

  return rows.map((r) => ({
    id: r.id,
    created_at: r.created_at,
    feedback_count: r.feedback_count,
    total_feedback_count: r.total_feedback_count,
    precision_before: r.precision_before,
    recall_before: r.recall_before,
    actions_taken: JSON.parse(r.actions_taken) as AIAction[],
    ai_response_error: r.ai_response !== null && r.actions_taken === "[]" && r.ai_response !== "null",
  }));
}
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/lib/tag-optimization.ts
git commit -m "feat(optimization): add prompt building, vocab reader, and history"
```

---

### Task 8: API Routes — Status, History, Vocab

**Files:**
- Create: `src/app/api/tag-optimization/status/route.ts`
- Create: `src/app/api/tag-optimization/history/route.ts`
- Create: `src/app/api/tag-optimization/vocab/route.ts`

- [ ] **Step 1: Create status endpoint**

```typescript
// src/app/api/tag-optimization/status/route.ts
import { NextResponse } from "next/server";
import { checkOptimizationTrigger } from "@/lib/tag-optimization";

export async function GET() {
  const result = checkOptimizationTrigger();
  return NextResponse.json(result);
}
```

- [ ] **Step 2: Create history endpoint**

```typescript
// src/app/api/tag-optimization/history/route.ts
import { NextResponse } from "next/server";
import { getOptimizationHistory } from "@/lib/tag-optimization";

export async function GET() {
  const history = getOptimizationHistory();
  return NextResponse.json(history);
}
```

- [ ] **Step 3: Create vocab endpoint**

```typescript
// src/app/api/tag-optimization/vocab/route.ts
import { NextResponse } from "next/server";
import { getEffectiveVocab, getDynamicVocabRows } from "@/lib/tag-optimization";

export async function GET() {
  const vocab = getEffectiveVocab();
  const dynamicRows = getDynamicVocabRows();
  return NextResponse.json({
    ...vocab,
    dynamicAdditions: dynamicRows
      .filter((r) => r.action === "add")
      .map(({ tag, tier, reason }) => ({ tag, tier, reason })),
    dynamicRemovals: dynamicRows
      .filter((r) => r.action === "remove")
      .map(({ tag, tier, reason }) => ({ tag, tier, reason })),
  });
}
```

- [ ] **Step 4: Verify all routes compile**

Run: `npx tsc --noEmit`

- [ ] **Step 5: Quick smoke test**

Run: `npm run dev`

Test: `curl http://localhost:3456/api/tag-optimization/status`
Expected: `{"shouldRun":false,"feedbackCount":0}` (or some count based on existing data)

Test: `curl http://localhost:3456/api/tag-optimization/history`
Expected: `[]`

Test: `curl http://localhost:3456/api/tag-optimization/vocab`
Expected: JSON with tier1/tier2/tier3 arrays matching static vocab

- [ ] **Step 6: Commit**

```bash
git add src/app/api/tag-optimization/
git commit -m "feat(api): add tag-optimization status, history, and vocab endpoints"
```

---

### Task 9: API Route — Optimization Run Pipeline

**Files:**
- Create: `src/app/api/tag-optimization/run/route.ts`

- [ ] **Step 1: Create the run endpoint**

```typescript
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  checkOptimizationTrigger,
  computeOptimizationStats,
  generateProposals,
  applyOptimizationActions,
  getEffectiveVocab,
  type OptimizationProposal,
  type AIAction,
} from "@/lib/tag-optimization";
import { TIER1_DOMAIN } from "@/lib/tag-vocab";

const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
const MINIMAX_MODEL = process.env.MINIMAX_MODEL ?? "MiniMax-Text-01";
const MINIMAX_URL = "https://api.minimax.chat/v1/text/chatcompletion_v2";

function buildMetaPrompt(
  stats: ReturnType<typeof computeOptimizationStats>,
  proposals: OptimizationProposal[]
): string {
  const vocab = getEffectiveVocab();
  const domainTags = Object.entries(TIER1_DOMAIN)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");

  const worstTags = Object.entries(stats.tagStats)
    .filter(([, s]) => s.suggested >= 3)
    .sort((a, b) => a[1].accuracy - b[1].accuracy)
    .slice(0, 3)
    .map(([tag, s]) => `${tag}: 推荐${s.suggested}次，仅保留${s.kept}次`)
    .join("; ");

  const missedTags = Object.entries(stats.tagStats)
    .filter(([, s]) => s.suggested === 0 && s.missedThenAdded >= 2)
    .map(([tag, s]) => `${tag}(${s.missedThenAdded}次)`)
    .join(", ");

  const topCandidates = Object.entries(stats.candidateStats)
    .filter(([, s]) => s.adoptionRate >= 0.5 && s.timesAccepted >= 2)
    .map(([tag, s]) => `${tag}(采纳${s.timesAccepted}/${s.timesGenerated})`)
    .join(", ");

  return `你是一个标签推荐系统的优化助手。根据以下用户反馈统计数据和优化提案，生成具体的 prompt 优化片段。

## 当前词汇表
领域: ${domainTags}
工具: ${vocab.tier2.join(", ")}
主题: ${vocab.tier3.join(", ")}

## 反馈统计摘要
- 总样本量: ${stats.totalCount}（仅含使用AI推荐的session），本轮新增: ${stats.window.incrementalCount}
- 平均精确率: ${(stats.avgPrecision * 100).toFixed(1)}%，平均召回率: ${(stats.avgRecall * 100).toFixed(1)}%
${worstTags ? `- 表现最差的标签: ${worstTags}` : ""}
${missedTags ? `- 用户经常手动添加但AI未推荐的标签: ${missedTags}` : ""}
${topCandidates ? `- 高采纳率candidate: ${topCandidates}` : ""}

## 优化提案
${JSON.stringify(proposals, null, 2)}

## 要求
对每个提案，输出一个 JSON 对象：
{
  "actions": [
    {
      "proposal_index": 0,
      "approved": true,
      "type": "few_shot",
      "content": "当文章讨论XXX时，应标记为 'workflow'",
      "target_tag": "workflow"
    },
    {
      "proposal_index": 1,
      "approved": false,
      "reason": "样本量太小，建议再观察"
    }
  ]
}

规则：
1. 你可以拒绝提案（approved: false），需说明理由
2. few_shot 内容应简洁，一句话说明使用场景
3. negative_example 应明确说明什么情况下不要使用该标签
4. 对于 promote_candidate 提案，确认该候选词是否真的值得成为正式词汇
5. 不要修改 tier1 domain 标签（${Object.keys(TIER1_DOMAIN).join(", ")}）
6. type 字段必须使用以下值之一：promote_candidate, demote_tag, few_shot, negative_example, tag_note, rule_adjustment`;
}

export async function POST() {
  if (!MINIMAX_API_KEY) {
    return NextResponse.json(
      { error: "MINIMAX_API_KEY not configured" },
      { status: 500 }
    );
  }

  const db = getDb();

  // Concurrency guard: no run within 60 seconds
  const lastRun = db
    .prepare(
      "SELECT created_at FROM optimization_runs ORDER BY id DESC LIMIT 1"
    )
    .get() as { created_at: string } | undefined;

  if (lastRun) {
    const elapsed =
      Date.now() - new Date(lastRun.created_at + "Z").getTime();
    if (elapsed < 60_000) {
      return NextResponse.json(
        { error: "优化正在进行中，请稍后再试" },
        { status: 409 }
      );
    }
  }

  // Check threshold
  const trigger = checkOptimizationTrigger();
  if (!trigger.shouldRun) {
    return NextResponse.json(
      {
        error: `反馈数量不足（${trigger.feedbackCount}/20），暂不需要优化`,
      },
      { status: 400 }
    );
  }

  // Compute stats
  const stats = computeOptimizationStats();

  // Generate proposals
  const proposals = generateProposals(stats);

  // Insert optimization_runs first (for FK reference)
  const runResult = db
    .prepare(
      `INSERT INTO optimization_runs
       (feedback_window_start, feedback_window_end, feedback_count, total_feedback_count,
        stats_snapshot, ai_response, actions_taken, precision_before, recall_before)
       VALUES (?, ?, ?, ?, ?, NULL, '[]', ?, ?)`
    )
    .run(
      stats.window.startId,
      stats.window.endId,
      stats.window.incrementalCount,
      stats.totalCount,
      JSON.stringify(stats),
      stats.avgPrecision,
      stats.avgRecall
    );
  const runId = Number(runResult.lastInsertRowid);

  // No proposals → record empty run
  if (proposals.length === 0) {
    return NextResponse.json({
      runId,
      message: "无优化提案，跳过本轮",
      stats: {
        totalCount: stats.totalCount,
        precision: stats.avgPrecision,
        recall: stats.avgRecall,
      },
      actions: [],
    });
  }

  // Call MiniMax for AI-assisted decision
  try {
    const metaPrompt = buildMetaPrompt(stats, proposals);
    const res = await fetch(MINIMAX_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MINIMAX_API_KEY}`,
      },
      body: JSON.stringify({
        model: MINIMAX_MODEL,
        messages: [
          {
            role: "system",
            content:
              "你是标签推荐系统的优化助手。按要求分析提案并返回JSON。",
          },
          { role: "user", content: metaPrompt },
        ],
        temperature: 0.3,
        max_tokens: 1500,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("MiniMax optimization API error:", errText);
      db.prepare(
        "UPDATE optimization_runs SET ai_response = ? WHERE id = ?"
      ).run(errText, runId);
      return NextResponse.json(
        { error: `MiniMax API error: ${res.status}`, runId },
        { status: 502 }
      );
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content ?? "";

    // Save raw response
    db.prepare(
      "UPDATE optimization_runs SET ai_response = ? WHERE id = ?"
    ).run(reply, runId);

    // Parse AI response
    const jsonMatch = reply.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { error: "AI 返回格式异常", raw: reply, runId },
        { status: 500 }
      );
    }

    let actions: AIAction[];
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { actions: AIAction[] };
      actions = parsed.actions ?? [];
    } catch {
      return NextResponse.json(
        { error: "AI 返回 JSON 解析失败", raw: reply, runId },
        { status: 500 }
      );
    }

    // Apply actions
    const applied = applyOptimizationActions(runId, actions);

    // Update the run record with final actions
    db.prepare(
      "UPDATE optimization_runs SET actions_taken = ? WHERE id = ?"
    ).run(JSON.stringify(applied), runId);

    return NextResponse.json({
      runId,
      stats: {
        totalCount: stats.totalCount,
        incrementalCount: stats.window.incrementalCount,
        precision: stats.avgPrecision,
        recall: stats.avgRecall,
      },
      proposalCount: proposals.length,
      actions: applied,
    });
  } catch (e) {
    console.error("Optimization pipeline error:", e);
    db.prepare(
      "UPDATE optimization_runs SET ai_response = ? WHERE id = ?"
    ).run(String(e), runId);
    return NextResponse.json(
      { error: String(e), runId },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/tag-optimization/run/route.ts
git commit -m "feat(api): add optimization run pipeline with MiniMax integration"
```

---

### Task 10: Modify suggest-tags to Use Dynamic Prompt

**Files:**
- Modify: `src/app/api/suggest-tags/route.ts`

- [ ] **Step 1: Replace hardcoded prompt with `buildSystemPrompt()`**

Replace the existing `buildVocabBlock()` function and the hardcoded prompt in the POST handler. The key changes:

1. Remove the `buildVocabBlock()` function (lines 8-23)
2. Import `buildSystemPrompt` from tag-optimization
3. Replace the hardcoded `prompt` variable with one that uses `buildSystemPrompt()`

The new file should look like:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { ALL_TAGS } from "@/lib/tag-vocab";
import { buildSystemPrompt, getEffectiveVocab } from "@/lib/tag-optimization";

const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
const MINIMAX_MODEL = process.env.MINIMAX_MODEL ?? "MiniMax-Text-01";
const MINIMAX_URL = "https://api.minimax.chat/v1/text/chatcompletion_v2";

function isValidCandidate(tag: string): boolean {
  return /^[a-z][a-z0-9-]{1,19}$/.test(tag);
}

export async function POST(request: NextRequest) {
  if (!MINIMAX_API_KEY) {
    return NextResponse.json({ error: "MINIMAX_API_KEY not configured" }, { status: 500 });
  }

  const { title, content, currentTags } = await request.json();
  const truncatedContent = content?.slice(0, 3000) ?? "";

  // Build effective tag list (static + dynamic)
  const vocab = getEffectiveVocab();
  const effectiveTags = [...vocab.tier1, ...vocab.tier2, ...vocab.tier3];

  const systemPrompt = buildSystemPrompt();

  const userPrompt = `## 输出格式

返回一个 JSON 对象（不要其他说明）：
{"tags": ["词表命中的标签"], "candidates": ["建议新增的标签"]}

## 新标签命名规则
- 全小写英文，单词间用连字符（如 vector-db、rag、fine-tuning）
- 2-20 个字符
- 不要与词表中已有标签语义重复
- candidates 只在词表确实无法覆盖时才建议 0-2 个

## 已有标签（不要重复）
${(currentTags ?? []).join(", ") || "无"}

## 文章标题
${title ?? "无标题"}

## 文章内容
${truncatedContent}`;

  try {
    const res = await fetch(MINIMAX_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MINIMAX_API_KEY}`,
      },
      body: JSON.stringify({
        model: MINIMAX_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 200,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("MiniMax API error:", err);
      return NextResponse.json({ error: `MiniMax API error: ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content ?? "";

    // Try to parse as {tags, candidates} object first
    const objMatch = reply.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        const parsed = JSON.parse(objMatch[0]) as { tags?: string[]; candidates?: string[] };
        const vocabTags = (parsed.tags ?? []).filter(
          (t: string) => !(currentTags ?? []).includes(t) && effectiveTags.includes(t)
        );
        const candidates = (parsed.candidates ?? []).filter(
          (t: string) =>
            !(currentTags ?? []).includes(t) &&
            !effectiveTags.includes(t) &&
            isValidCandidate(t)
        );
        return NextResponse.json({ tags: vocabTags, candidates });
      } catch {
        // Fall through to array parsing
      }
    }

    // Fallback: parse as plain array
    const arrMatch = reply.match(/\[[\s\S]*?\]/);
    if (!arrMatch) {
      return NextResponse.json({ error: "Failed to parse response", raw: reply }, { status: 500 });
    }

    const allTags = JSON.parse(arrMatch[0]) as string[];
    const vocabTags = allTags.filter(
      (t: string) => !(currentTags ?? []).includes(t) && effectiveTags.includes(t)
    );
    const candidates = allTags.filter(
      (t: string) =>
        !(currentTags ?? []).includes(t) &&
        !effectiveTags.includes(t) &&
        isValidCandidate(t)
    );

    return NextResponse.json({ tags: vocabTags, candidates });
  } catch (e) {
    console.error("MiniMax request failed:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Smoke test suggest-tags still works**

Run dev server, open the app, load an excerpt, click "AI 推荐" — should return tags as before.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/suggest-tags/route.ts
git commit -m "feat(suggest-tags): use dynamic prompt from buildSystemPrompt"
```

---

### Task 11: Frontend — Optimization UI in TagFeedbackView

**Files:**
- Modify: `src/components/TagFeedbackView.tsx`

- [ ] **Step 1: Add optimization status and trigger UI**

Add new state and fetch calls at the top of the `TagFeedbackView` component, plus new UI sections. The changes are:

1. Add state for optimization status, history, running state
2. Fetch status and history on mount
3. Add optimization trigger banner (before existing metrics)
4. Add optimization history section (after prompt hints)
5. Mark dynamic tags in the per-tag table

Replace the entire `TagFeedbackView.tsx` content with:

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";

interface TagStat {
  suggested: number;
  kept: number;
  removed: number;
  missedThenAdded: number;
}

interface Analysis {
  totalSessions: number;
  aiUsedSessions: number;
  avgPrecision: number;
  avgRecall: number;
  tagStats: Record<string, TagStat>;
  candidateStats: { total: number; accepted: number; dismissed: number };
  recentCorrections: {
    title: string | null;
    ai_suggested: string[];
    user_removed: string[];
    user_added: string[];
    created_at: string;
  }[];
  frequentUserAdds: { tag: string; count: number }[];
  frequentAiRemoves: { tag: string; count: number }[];
}

interface OptStatus {
  shouldRun: boolean;
  feedbackCount: number;
}

interface OptHistoryItem {
  id: number;
  created_at: string;
  feedback_count: number;
  total_feedback_count: number;
  precision_before: number | null;
  recall_before: number | null;
  actions_taken: Array<{
    approved: boolean;
    type?: string;
    target_tag?: string;
    content?: string;
    reason?: string;
  }>;
  ai_response_error: boolean;
}

interface DynamicVocab {
  dynamicAdditions: Array<{ tag: string; tier: string; reason: string | null }>;
  dynamicRemovals: Array<{ tag: string; tier: string; reason: string | null }>;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function BarCell({ value, max, color }: { value: number; max: number; color: string }) {
  const w = max > 0 ? (value / max) * 100 : 0;
  return (
    <td className="px-2 py-1.5">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-3 bg-[var(--bg-tertiary)] rounded overflow-hidden">
          <div className={`h-full rounded ${color}`} style={{ width: `${w}%` }} />
        </div>
        <span className="text-xs w-6 text-right">{value}</span>
      </div>
    </td>
  );
}

export default function TagFeedbackView() {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [optStatus, setOptStatus] = useState<OptStatus | null>(null);
  const [optHistory, setOptHistory] = useState<OptHistoryItem[]>([]);
  const [dynamicVocab, setDynamicVocab] = useState<DynamicVocab>({ dynamicAdditions: [], dynamicRemovals: [] });
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/tag-feedback/analysis").then((r) => r.json()),
      fetch("/api/tag-optimization/status").then((r) => r.json()),
      fetch("/api/tag-optimization/history").then((r) => r.json()),
      fetch("/api/tag-optimization/vocab").then((r) => r.json()),
    ])
      .then(([a, s, h, v]) => {
        setAnalysis(a);
        setOptStatus(s);
        setOptHistory(h);
        setDynamicVocab(v);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleRunOptimization = useCallback(async () => {
    setRunning(true);
    setRunResult(null);
    try {
      const res = await fetch("/api/tag-optimization/run", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setRunResult(`失败: ${data.error}`);
      } else {
        const actionCount = (data.actions ?? []).filter((a: { approved: boolean }) => a.approved).length;
        setRunResult(`完成: 执行了 ${actionCount} 个优化动作`);
        // Refresh data
        const [s, h, v] = await Promise.all([
          fetch("/api/tag-optimization/status").then((r) => r.json()),
          fetch("/api/tag-optimization/history").then((r) => r.json()),
          fetch("/api/tag-optimization/vocab").then((r) => r.json()),
        ]);
        setOptStatus(s);
        setOptHistory(h);
        setDynamicVocab(v);
      }
    } catch (e) {
      setRunResult(`错误: ${String(e)}`);
    } finally {
      setRunning(false);
    }
  }, []);

  if (loading) {
    return <div className="p-6 text-[var(--text-secondary)]">加载分析数据...</div>;
  }

  if (!analysis || analysis.aiUsedSessions === 0) {
    return (
      <div className="p-6 text-center text-[var(--text-secondary)]">
        <p className="text-lg mb-2">暂无 AI 打标数据</p>
        <p className="text-sm">使用 AI 推荐标签并归档文章后，这里会显示 AI 打标准确率分析</p>
      </div>
    );
  }

  // Build sets for dynamic tag marking
  const addedTags = new Set(dynamicVocab.dynamicAdditions.map((d) => d.tag));
  const removedTags = new Set(dynamicVocab.dynamicRemovals.map((d) => d.tag));

  const tagEntries = Object.entries(analysis.tagStats)
    .filter(([, s]) => s.suggested > 0 || s.missedThenAdded > 0)
    .sort((a, b) => (b[1].suggested + b[1].missedThenAdded) - (a[1].suggested + a[1].missedThenAdded));

  const maxSuggested = Math.max(...tagEntries.map(([, s]) => s.suggested), 1);

  return (
    <div className="p-5 space-y-6 overflow-y-auto max-h-[calc(100vh-120px)]">
      <h2 className="text-lg font-semibold">AI 打标准确率分析</h2>

      {/* Optimization trigger banner */}
      {optStatus?.shouldRun && (
        <div className="border border-[var(--accent)]/40 rounded-lg p-4 bg-[var(--accent)]/5 flex items-center justify-between">
          <div>
            <span className="text-sm font-medium">已积累 {optStatus.feedbackCount} 条新反馈，可运行优化</span>
            {runResult && <p className="text-xs text-[var(--text-secondary)] mt-1">{runResult}</p>}
          </div>
          <button
            onClick={handleRunOptimization}
            disabled={running}
            className="px-3 py-1.5 text-sm rounded bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-50"
          >
            {running ? "优化中..." : "运行优化"}
          </button>
        </div>
      )}

      {/* Overall metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="反馈样本" value={String(analysis.aiUsedSessions)} sub={`${analysis.totalSessions} 次归档`} />
        <MetricCard label="精确率 (Precision)" value={pct(analysis.avgPrecision)} sub="AI 推荐被保留的比例" color={analysis.avgPrecision >= 0.7 ? "text-green-400" : analysis.avgPrecision >= 0.5 ? "text-yellow-400" : "text-red-400"} />
        <MetricCard label="召回率 (Recall)" value={pct(analysis.avgRecall)} sub="最终标签中 AI 覆盖的比例" color={analysis.avgRecall >= 0.7 ? "text-green-400" : analysis.avgRecall >= 0.5 ? "text-yellow-400" : "text-red-400"} />
        <MetricCard
          label="候选采纳率"
          value={analysis.candidateStats.total > 0 ? pct(analysis.candidateStats.accepted / analysis.candidateStats.total) : "N/A"}
          sub={`${analysis.candidateStats.accepted}/${analysis.candidateStats.total} 采纳`}
        />
      </div>

      {/* Per-tag accuracy table */}
      <div>
        <h3 className="text-sm font-semibold mb-2 text-[var(--text-secondary)]">逐标签分析</h3>
        <div className="border border-[var(--border)] rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                <th className="px-2 py-1.5 text-left font-medium">标签</th>
                <th className="px-2 py-1.5 text-left font-medium">AI推荐</th>
                <th className="px-2 py-1.5 text-left font-medium">被保留</th>
                <th className="px-2 py-1.5 text-left font-medium">被删除</th>
                <th className="px-2 py-1.5 text-left font-medium">用户补充</th>
                <th className="px-2 py-1.5 text-right font-medium">准确率</th>
              </tr>
            </thead>
            <tbody>
              {tagEntries.map(([tag, stat]) => {
                const acc = stat.suggested > 0 ? stat.kept / stat.suggested : 0;
                const isDynamic = addedTags.has(tag);
                const isDemoted = removedTags.has(tag);
                return (
                  <tr key={tag} className="border-t border-[var(--border)] hover:bg-[var(--bg-tertiary)]">
                    <td className="px-2 py-1.5 font-mono text-xs">
                      <span className={isDemoted ? "line-through text-[var(--text-secondary)]" : ""}>
                        {tag}
                      </span>
                      {isDynamic && (
                        <span className="ml-1 px-1 py-0.5 text-[10px] rounded bg-green-500/20 text-green-400">+动态</span>
                      )}
                      {isDemoted && (
                        <span className="ml-1 px-1 py-0.5 text-[10px] rounded bg-red-500/20 text-red-400">已降权</span>
                      )}
                    </td>
                    <BarCell value={stat.suggested} max={maxSuggested} color="bg-blue-500" />
                    <BarCell value={stat.kept} max={maxSuggested} color="bg-green-500" />
                    <BarCell value={stat.removed} max={maxSuggested} color="bg-red-500" />
                    <BarCell value={stat.missedThenAdded} max={maxSuggested} color="bg-yellow-500" />
                    <td className={`px-2 py-1.5 text-right text-xs font-medium ${stat.suggested > 0 ? (acc >= 0.7 ? "text-green-400" : acc >= 0.4 ? "text-yellow-400" : "text-red-400") : "text-[var(--text-secondary)]"}`}>
                      {stat.suggested > 0 ? pct(acc) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Optimization insights */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {analysis.frequentAiRemoves.length > 0 && (
          <div className="border border-[var(--border)] rounded p-3">
            <h3 className="text-sm font-semibold mb-2 text-red-400">AI 常错标签（经常被你删除）</h3>
            <p className="text-xs text-[var(--text-secondary)] mb-2">考虑在 prompt 中加入负面指引，或收窄这些标签的适用范围</p>
            <div className="space-y-1">
              {analysis.frequentAiRemoves.map(({ tag, count }) => (
                <div key={tag} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-xs">{tag}</span>
                  <span className="text-xs text-red-400">{count} 次删除</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {analysis.frequentUserAdds.length > 0 && (
          <div className="border border-[var(--border)] rounded p-3">
            <h3 className="text-sm font-semibold mb-2 text-yellow-400">AI 常漏标签（经常需要手动补充）</h3>
            <p className="text-xs text-[var(--text-secondary)] mb-2">考虑在 prompt 中强调这些标签的适用场景</p>
            <div className="space-y-1">
              {analysis.frequentUserAdds.map(({ tag, count }) => (
                <div key={tag} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-xs">{tag}</span>
                  <span className="text-xs text-yellow-400">{count} 次补充</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Recent corrections */}
      {analysis.recentCorrections.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2 text-[var(--text-secondary)]">近期纠正记录</h3>
          <div className="space-y-2">
            {analysis.recentCorrections.map((c, i) => (
              <div key={i} className="border border-[var(--border)] rounded p-3 text-sm">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-medium truncate mr-2">{c.title ?? "Untitled"}</span>
                  <span className="text-xs text-[var(--text-secondary)] flex-shrink-0">{c.created_at.slice(0, 10)}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {c.ai_suggested.map((t) => (
                    <span key={`ai-${t}`} className={`px-1.5 py-0.5 text-xs rounded ${c.user_removed.includes(t) ? "bg-red-500/20 text-red-400 line-through" : "bg-green-500/20 text-green-400"}`}>
                      {t}
                    </span>
                  ))}
                  {c.user_added.map((t) => (
                    <span key={`user-${t}`} className="px-1.5 py-0.5 text-xs rounded bg-yellow-500/20 text-yellow-400">
                      +{t}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Prompt optimization hints */}
      <PromptHints analysis={analysis} />

      {/* Optimization history */}
      {optHistory.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2 text-[var(--text-secondary)]">优化运行历史</h3>
          <div className="space-y-3">
            {optHistory.map((run) => {
              const approved = run.actions_taken.filter((a) => a.approved);
              const rejected = run.actions_taken.filter((a) => !a.approved);
              return (
                <div key={run.id} className="border border-[var(--border)] rounded p-3 text-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">
                      {run.created_at.replace("T", " ").slice(0, 16)}
                    </span>
                    <span className="text-xs text-[var(--text-secondary)]">
                      全量 {run.total_feedback_count} 条，新增 {run.feedback_count} 条
                    </span>
                  </div>
                  {run.precision_before != null && (
                    <div className="text-xs text-[var(--text-secondary)] mb-2">
                      精确率: {pct(run.precision_before)}
                      {run.recall_before != null && ` | 召回率: ${pct(run.recall_before)}`}
                    </div>
                  )}
                  {run.ai_response_error && (
                    <div className="text-xs text-red-400 mb-2">AI 响应异常，本轮未执行优化</div>
                  )}
                  {approved.length > 0 && (
                    <div className="space-y-1">
                      {approved.map((a, i) => (
                        <div key={i} className="flex items-start gap-2 text-xs">
                          <span className="flex-shrink-0">
                            {a.type === "promote_candidate" && "✅"}
                            {a.type === "demote_tag" && "⛔"}
                            {a.type === "few_shot" && "📝"}
                            {a.type === "negative_example" && "⚠️"}
                            {a.type === "tag_note" && "📋"}
                            {a.type === "rule_adjustment" && "⚙️"}
                          </span>
                          <span>
                            {a.target_tag && <span className="font-mono">{a.target_tag}</span>}
                            {a.content && <span className="text-[var(--text-secondary)]"> — {a.content.slice(0, 60)}{a.content.length > 60 ? "..." : ""}</span>}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {rejected.length > 0 && (
                    <div className="mt-1 text-xs text-[var(--text-secondary)]">
                      AI 否决了 {rejected.length} 个提案
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, sub, color }: { label: string; value: string; sub: string; color?: string }) {
  return (
    <div className="border border-[var(--border)] rounded p-3">
      <div className="text-xs text-[var(--text-secondary)] mb-1">{label}</div>
      <div className={`text-xl font-semibold ${color ?? ""}`}>{value}</div>
      <div className="text-xs text-[var(--text-secondary)] mt-0.5">{sub}</div>
    </div>
  );
}

function PromptHints({ analysis }: { analysis: Analysis }) {
  const hints: string[] = [];

  if (analysis.avgPrecision < 0.6) {
    hints.push("精确率偏低 — AI 推荐了太多不相关的标签。考虑在 prompt 中要求「宁缺毋滥」，减少标签数量上限。");
  }
  if (analysis.avgRecall < 0.5) {
    hints.push("召回率偏低 — AI 遗漏了较多你需要的标签。考虑在 prompt 中给出更多标签使用场景的描述。");
  }

  const badTags = Object.entries(analysis.tagStats)
    .filter(([, s]) => s.suggested >= 3 && s.kept / s.suggested < 0.4)
    .map(([tag]) => tag);
  if (badTags.length > 0) {
    hints.push(`以下标签准确率低于 40%，建议在 prompt 中添加使用条件或排除说明：${badTags.join(", ")}`);
  }

  const missedTags = Object.entries(analysis.tagStats)
    .filter(([, s]) => s.suggested === 0 && s.missedThenAdded >= 2)
    .map(([tag]) => tag);
  if (missedTags.length > 0) {
    hints.push(`以下标签 AI 从未推荐但你多次手动添加，考虑在 prompt 中增加 few-shot 示例：${missedTags.join(", ")}`);
  }

  if (analysis.candidateStats.total >= 5 && analysis.candidateStats.accepted / analysis.candidateStats.total > 0.5) {
    const topAccepted = analysis.frequentUserAdds
      .filter(({ tag }) => !(tag in analysis.tagStats) || analysis.tagStats[tag].suggested === 0)
      .slice(0, 5)
      .map(({ tag }) => tag);
    if (topAccepted.length > 0) {
      hints.push(`候选标签采纳率较高，考虑将以下标签加入词表：${topAccepted.join(", ")}`);
    }
  }

  if (hints.length === 0) return null;

  return (
    <div className="border border-[var(--accent)]/30 rounded p-4 bg-[var(--accent)]/5">
      <h3 className="text-sm font-semibold mb-2 text-[var(--accent)]">Prompt 优化建议</h3>
      <ul className="space-y-2 text-sm">
        {hints.map((hint, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-[var(--accent)] flex-shrink-0">•</span>
            <span>{hint}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 2: Verify types**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Visual smoke test**

Run: `npm run dev`

Open `http://localhost:3456`, switch to the tag feedback view tab. Verify:
- Existing metrics still display correctly
- Per-tag table renders (no dynamic markers yet — none in DB)
- Optimization history section appears empty (no runs yet)
- If enough feedback exists, the optimization trigger banner should appear

- [ ] **Step 4: Commit**

```bash
git add src/components/TagFeedbackView.tsx
git commit -m "feat(ui): add optimization trigger, history, and dynamic vocab markers"
```

---

### Task 12: Integration Verification

- [ ] **Step 1: Type check the full project**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 2: Build check**

Run: `npm run build`

Expected: successful build with no errors.

- [ ] **Step 3: End-to-end smoke test**

Run: `npm run dev`

1. Open `http://localhost:3456`
2. Verify existing functionality works: load excerpt list, read an excerpt, AI tag suggest, archive
3. Check tag feedback view — metrics and per-tag table display
4. Check optimization status: `curl http://localhost:3456/api/tag-optimization/status`
5. Check vocab: `curl http://localhost:3456/api/tag-optimization/vocab`
6. If enough feedback (≥20), try clicking "运行优化" button
7. After optimization, verify history shows the run and any dynamic tag markers appear

- [ ] **Step 4: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: integration fixes for tag optimization pipeline"
```
