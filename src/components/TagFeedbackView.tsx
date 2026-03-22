"use client";

import { useState, useEffect } from "react";

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

  useEffect(() => {
    fetch("/api/tag-feedback/analysis")
      .then((r) => r.json())
      .then(setAnalysis)
      .finally(() => setLoading(false));
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

  const tagEntries = Object.entries(analysis.tagStats)
    .filter(([, s]) => s.suggested > 0 || s.missedThenAdded > 0)
    .sort((a, b) => (b[1].suggested + b[1].missedThenAdded) - (a[1].suggested + a[1].missedThenAdded));

  const maxSuggested = Math.max(...tagEntries.map(([, s]) => s.suggested), 1);

  return (
    <div className="p-5 space-y-6 overflow-y-auto max-h-[calc(100vh-120px)]">
      <h2 className="text-lg font-semibold">AI 打标准确率分析</h2>

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
                return (
                  <tr key={tag} className="border-t border-[var(--border)] hover:bg-[var(--bg-tertiary)]">
                    <td className="px-2 py-1.5 font-mono text-xs">{tag}</td>
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
        {/* AI frequently wrong */}
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

        {/* AI frequently misses */}
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

  // Tags with < 40% accuracy but suggested > 2 times
  const badTags = Object.entries(analysis.tagStats)
    .filter(([, s]) => s.suggested >= 3 && s.kept / s.suggested < 0.4)
    .map(([tag]) => tag);
  if (badTags.length > 0) {
    hints.push(`以下标签准确率低于 40%，建议在 prompt 中添加使用条件或排除说明：${badTags.join(", ")}`);
  }

  // Tags frequently added by user but never suggested
  const missedTags = Object.entries(analysis.tagStats)
    .filter(([, s]) => s.suggested === 0 && s.missedThenAdded >= 2)
    .map(([tag]) => tag);
  if (missedTags.length > 0) {
    hints.push(`以下标签 AI 从未推荐但你多次手动添加，考虑在 prompt 中增加 few-shot 示例：${missedTags.join(", ")}`);
  }

  // Candidate acceptance rate
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
