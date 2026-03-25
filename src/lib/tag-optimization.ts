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

// === Stats Computation ===

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
    .get(lastEndId) as { startId: number | null; endId: number | null; cnt: number };

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

// === Proposal Generation ===

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
    if (tag in TIER1_DOMAIN) continue;
    if (ts.suggested >= 5 && ts.accuracy < 0.3) {
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
    if (ts.suggested >= 5 && ts.accuracy >= 0.3 && ts.accuracy < 0.5) {
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
        stats: { suggested: ts.suggested, kept: ts.kept, removed: ts.removed },
      });
    }
  }

  // 4. Add few-shot for frequently missed tags
  for (const [tag, ts] of Object.entries(stats.tagStats)) {
    if (ts.suggested === 0 && ts.missedThenAdded >= 3) {
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
    .prepare(
      "SELECT tag, created_at, cooldown_until, oscillation_count FROM dynamic_vocab WHERE action = 'remove'"
    )
    .all() as Array<{
    tag: string;
    created_at: string;
    cooldown_until: string | null;
    oscillation_count: number;
  }>;

  for (const dv of demotedTags) {
    if (dv.oscillation_count >= 3) continue;
    if (dv.cooldown_until && new Date(dv.cooldown_until) > new Date()) continue;

    const rows = db
      .prepare("SELECT user_added FROM tag_feedback WHERE created_at > ?")
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

// === Apply Actions ===

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
          VALUES (?,?,?,?,?,?,?, datetime('now', 'localtime'))
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
4. 不要重复已有标签${rules.length > 0 ? "\n" + rules.map((r, i) => `${5 + i}. ${r.content}`).join("\n") : ""}`;

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
    ai_response_error:
      r.ai_response !== null &&
      r.actions_taken === "[]" &&
      r.ai_response !== "null",
  }));
}
