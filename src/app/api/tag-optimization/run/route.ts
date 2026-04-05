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
import { isMinimaxConfigured, minimaxChat } from "@/lib/minimax";

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
  if (!isMinimaxConfigured()) {
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
    const reply = await minimaxChat({
      messages: [
        {
          role: "system",
          content:
            "你是标签推荐系统的优化助手。按要求分析提案并返回JSON。",
        },
        { role: "user", content: metaPrompt },
      ],
      temperature: 0.3,
      max_tokens: 8000,
    });

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
