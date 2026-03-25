# AI 标签推荐自优化机制 — 设计文档

## 一、概述

基于用户归档时的标签反馈数据，每积累 20 次归档自动触发一轮优化。优化 pipeline：统计分析 → 规则引擎生成提案 → AI 辅助决策 → 写入 DB。下次 AI 推荐标签时，从 DB 读取动态配置拼装到 prompt 中，实现闭环。

```
归档 → tag_feedback 累积
          ↓ (每20次)
  统计分析（全量历史）
          ↓
  规则引擎生成提案
          ↓
  AI 辅助决策（MiniMax）
          ↓
  写入 DB（dynamic_vocab + prompt_overrides）
          ↓
  下次 suggest-tags 读取新配置 → 更准的推荐
```

### 设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 优化方式 | Prompt + 词汇表联动 | 单一维度不够，需要联动 |
| 触发方式 | 每 ~20 次归档批量触发 | 个人工具，数据量小，频繁触发无意义 |
| 存储位置 | 数据库 | 运行时动态读取，无需重启；代码中静态定义作为初始种子 |
| 安全边界 | Tier 分级管理 | tier1 锁死，tier2/3 允许增删，candidate → tier3 |
| 决策方式 | 规则引擎 + AI 辅助 | 规则引擎产出提案，AI 细化内容并可否决 |

---

## 二、数据库 Schema

三张新表：

```sql
-- 优化运行记录
CREATE TABLE optimization_runs (
  id INTEGER PRIMARY KEY,
  feedback_window_start INTEGER NOT NULL,  -- 本轮增量起始 feedback id（用于触发去重）
  feedback_window_end INTEGER NOT NULL,    -- 本轮增量结束 feedback id
  feedback_count INTEGER NOT NULL,         -- 本轮增量 feedback 数
  total_feedback_count INTEGER NOT NULL,   -- 全量 feedback 数（统计基于此）
  stats_snapshot TEXT NOT NULL,            -- JSON: 全量统计摘要
  ai_response TEXT,                        -- JSON: AI 原始建议
  actions_taken TEXT NOT NULL,             -- JSON: 实际执行的动作
  precision_before REAL,
  recall_before REAL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- 动态词汇表（叠加在静态 tag-vocab.ts 之上）
CREATE TABLE dynamic_vocab (
  id INTEGER PRIMARY KEY,
  tag TEXT NOT NULL UNIQUE,
  tier TEXT NOT NULL CHECK(tier IN ('tier2_tools','tier3_topics')),
  action TEXT NOT NULL CHECK(action IN ('add','remove')),
  reason TEXT,
  cooldown_until TEXT,                     -- 振荡防护：此日期前不允许反向操作
  source_run_id INTEGER REFERENCES optimization_runs(id),
  created_at TEXT DEFAULT (datetime('now'))
);

-- 动态 prompt 片段
CREATE TABLE prompt_overrides (
  id INTEGER PRIMARY KEY,
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

### 设计要点

- `dynamic_vocab` 的 `action='remove'` 只让 AI 不再推荐该标签，用户手动输入不受影响
- tier1 domain 标签不出现在此表中，代码层面硬性阻止
- `prompt_overrides` 按 type 分组、priority 排序，拼装进 suggest-tags 的 system prompt
- `optimization_runs` 用 feedback id 范围标记增量窗口（用于触发去重），但统计分析基于全量历史
- `cooldown_until` 实现振荡防护：被 demote 的标签在 cooldown 期内不接受恢复提案

---

## 三、优化 Pipeline

### 3.1 触发条件

在 `saveTagFeedback()` 之后检查：

```typescript
function checkOptimizationTrigger(): { shouldRun: boolean; feedbackCount: number } {
  const lastRun = db.prepare(
    'SELECT feedback_window_end FROM optimization_runs ORDER BY id DESC LIMIT 1'
  ).get();

  const lastEndId = lastRun?.feedback_window_end ?? 0;
  const newCount = db.prepare(
    'SELECT COUNT(*) as cnt FROM tag_feedback WHERE id > ?'
  ).get(lastEndId).cnt;

  return { shouldRun: newCount >= 20, feedbackCount: newCount };
}
```

归档 API (`/api/archive`) 在成功归档并保存 feedback 后调用此检查。若触发，返回 `{ optimizationReady: true }` 通知前端。

### 3.2 统计分析

基于**全量** `tag_feedback` 历史计算，而非仅本轮窗口：

```typescript
interface OptimizationStats {
  window: { startId: number; endId: number; incrementalCount: number };
  totalCount: number;

  // 整体指标
  avgPrecision: number;
  avgRecall: number;
  candidateAdoptionRate: number;

  // 每个标签的表现（全量历史）
  tagStats: Record<string, {
    suggested: number;
    kept: number;
    removed: number;
    missedThenAdded: number;
    accuracy: number;          // kept / suggested
  }>;

  // Candidate 表现（全量历史）
  candidateStats: Record<string, {
    timesGenerated: number;
    timesAccepted: number;
    timesDismissed: number;
    adoptionRate: number;
  }>;
}
```

全量历史统计保证每个标签有足够样本量，避免小样本噪声导致误判。

### 3.3 规则引擎：生成优化提案

```typescript
interface OptimizationProposal {
  type: 'promote_candidate'
       | 'demote_tag'
       | 'add_few_shot'
       | 'add_negative'
       | 'add_tag_note'
       | 'adjust_rule';
  tag?: string;
  reason: string;
  stats: Record<string, number>;
}
```

**规则定义：**

| 条件 | 提案 |
|------|------|
| candidate 在 ≥3 个不同摘录被采纳，采纳率 ≥60% | `promote_candidate` → tier3 |
| vocab 标签准确率 <30%（且 suggested ≥5） | `demote_tag` |
| vocab 标签准确率 30%-50%（且 suggested ≥5） | `add_negative`（说明何时不该推荐） |
| 标签被用户手动添加 ≥3 次但 AI 从未推荐 | `add_few_shot`（教 AI 识别场景） |
| 整体 precision <50% | `adjust_rule`（倾向少推荐） |
| 整体 recall <40% | `adjust_rule`（倾向多推荐） |
| 被 demote 的标签在 demotion 之后被用户手动添加 ≥3 次，且已过 cooldown | `promote_candidate`（恢复） |

**振荡防护：**
- 被 demote 的标签设置 `cooldown_until` 为当前时间 + 2 个优化周期的预估时间（默认 60 天）
- 规则引擎在生成恢复提案前检查 cooldown，未过期则跳过
- 恢复时序：只统计 `dynamic_vocab.created_at`（demotion 时间）之后的 `tag_feedback` 中 `user_added` 包含该标签的记录

### 3.4 AI 辅助决策

将统计摘要 + 规则提案发给 MiniMax，让 AI 生成具体的 prompt 片段内容。

**Meta-prompt：**

```
你是一个标签推荐系统的优化助手。根据以下用户反馈统计数据和优化提案，
生成具体的 prompt 优化片段。

## 当前词汇表
{完整词汇表，含动态变更}

## 反馈统计摘要
- 总样本量: {totalCount}，本轮新增: {incrementalCount}
- 平均精确率: {precision}%，平均召回率: {recall}%
- 表现最差的标签: {tag}: 推荐{n}次，仅保留{m}次
- 用户经常手动添加但AI未推荐的标签: {tags}
- 高采纳率candidate: {candidates}

## 优化提案
{proposals as JSON}

## 要求
对每个提案，输出一个 JSON 对象：
{
  "actions": [
    {
      "proposal_index": 0,
      "approved": true,
      "type": "few_shot",
      "content": "例如：当文章讨论XXX时，应标记为 'workflow'",
      "target_tag": "workflow"
    },
    {
      "proposal_index": 1,
      "approved": true,
      "type": "negative_example",
      "content": "注意：'ai-coding' 仅用于直接讨论AI辅助编程的内容，
                  不要因为文章提到了AI就使用此标签",
      "target_tag": "ai-coding"
    },
    {
      "proposal_index": 2,
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
5. 不要修改 tier1 domain 标签
```

### 3.5 执行优化动作

AI 返回后，按动作类型写入 DB：

```typescript
function applyOptimizationActions(runId: number, actions: AIAction[]) {
  for (const action of actions) {
    if (!action.approved) continue;

    switch (action.type) {
      case 'promote_candidate':
        db.prepare(
          'INSERT OR REPLACE INTO dynamic_vocab (tag, tier, action, reason, source_run_id) VALUES (?,?,?,?,?)'
        ).run(action.target_tag, 'tier3_topics', 'add', action.reason, runId);
        break;

      case 'demote_tag':
        // 硬性检查：tier1 标签拒绝 demote
        if (TIER1_DOMAIN.includes(action.target_tag)) break;
        const cooldownDate = new Date();
        cooldownDate.setDate(cooldownDate.getDate() + 60);
        db.prepare(
          'INSERT OR REPLACE INTO dynamic_vocab (tag, tier, action, reason, cooldown_until, source_run_id) VALUES (?,?,?,?,?,?)'
        ).run(action.target_tag, inferTier(action.target_tag), 'remove', action.reason, cooldownDate.toISOString(), runId);
        break;

      case 'few_shot':
      case 'negative_example':
      case 'tag_note':
      case 'rule_adjustment':
        // 写入 prompt_overrides
        db.prepare(
          'INSERT INTO prompt_overrides (override_type, content, target_tag, source_run_id) VALUES (?,?,?,?)'
        ).run(action.type, action.content, action.target_tag ?? null, runId);
        break;
    }
  }

  // 执行条数上限淘汰
  enforceOverrideLimits();
}
```

---

## 四、Prompt 拼装

`/api/suggest-tags` 路由构建 system prompt 时，从 DB 读取动态配置叠加到静态 prompt 上。

```typescript
function buildSystemPrompt(): string {
  // 1. 构建有效词汇表
  const staticVocab = { ...TIER1_DOMAIN, ...TIER2_TOOLS, ...TIER3_TOPICS };
  const dynamicChanges = db.prepare(
    'SELECT tag, tier, action FROM dynamic_vocab'
  ).all();
  const effectiveVocab = computeEffectiveVocab(staticVocab, dynamicChanges);

  // 2. 读取 prompt 片段
  const overrides = db.prepare(
    'SELECT override_type, content, target_tag FROM prompt_overrides WHERE active = 1 ORDER BY priority DESC'
  ).all();

  const fewShots = overrides.filter(o => o.override_type === 'few_shot');
  const negatives = overrides.filter(o => o.override_type === 'negative_example');
  const tagNotes = overrides.filter(o => o.override_type === 'tag_note');
  const rules = overrides.filter(o => o.override_type === 'rule_adjustment');

  // 3. 拼装
  let prompt = `你是一个内容标签分类助手。根据文章标题和内容推荐标签。

## 标签词汇表
${formatVocab(effectiveVocab)}

## 分类规则
${BASE_RULES}
${rules.map(r => '- ' + r.content).join('\n')}`;

  if (fewShots.length > 0) {
    prompt += `\n\n## 正面示例\n${fewShots.map(f =>
      `- ${f.target_tag ? `[${f.target_tag}] ` : ''}${f.content}`
    ).join('\n')}`;
  }

  if (negatives.length > 0) {
    prompt += `\n\n## 注意事项（避免以下错误）\n${negatives.map(n =>
      `- ${n.target_tag ? `[${n.target_tag}] ` : ''}${n.content}`
    ).join('\n')}`;
  }

  if (tagNotes.length > 0) {
    prompt += `\n\n## 标签说明\n${tagNotes.map(t =>
      `- ${t.target_tag}: ${t.content}`
    ).join('\n')}`;
  }

  prompt += `\n\n请以 JSON 格式返回：{"tags": [...], "candidates": [...]}`;

  return prompt;
}
```

**`computeEffectiveVocab` 逻辑：**
- 以静态词汇表为基础
- `dynamic_vocab` 中 `action='add'` 的标签加入对应 tier
- `action='remove'` 的标签从词汇表移除（不出现在 AI prompt 中）
- tier1 标签始终保留，即使 DB 中有错误记录也忽略

**无动态数据时行为：** DB 无任何 dynamic_vocab 或 prompt_overrides 记录时，`buildSystemPrompt()` 输出与当前硬编码 prompt 完全一致。零配置降级。

---

## 五、词汇表进化规则

| 动作 | 门槛 | 安全约束 |
|------|------|----------|
| Candidate → tier3 正式词汇 | ≥3 个不同摘录采纳，采纳率 ≥60% | AI 确认后才执行 |
| tier2/3 标签移出推荐 | 准确率 <30%，且 ≥5 次推荐 | tier1 硬性锁死；AI 可否决；设置 60 天 cooldown |
| 被 demote 的标签恢复 | demotion 后用户手动添加 ≥3 次，且 cooldown 已过 | 需 AI 确认 |
| prompt 片段条数上限 | few_shot ≤10, negative ≤10, tag_note ≤15, rule ≤5 | 超出时按 id 升序淘汰最旧的（标记 active=0） |

---

## 六、前端集成

### 6.1 优化触发

归档 API 返回 `optimizationReady: true` 时，前端在 `TagFeedbackView` 面板显示提示：

```
┌──────────────────────────────────────┐
│  🔄 已积累 23 条新反馈，可运行优化    │
│  [运行优化]                          │
└──────────────────────────────────────┘
```

点击按钮 → `POST /api/tag-optimization/run` → 等待结果 → 显示本轮执行的动作摘要。

### 6.2 优化历史

在 `TagFeedbackView` 中新增区域展示：

```
最近优化 — 2026-03-25 14:30
├── 📊 样本量: 全量 156 条，本轮新增 22 条
├── 精确率: 58%（待下轮验证）
├── 执行动作:
│   ├── ✅ 新增词汇: 'prompt-engineering' → tier3
│   ├── ⛔ 移出推荐: 'tool'（准确率 22%）
│   ├── 📝 新增正面示例: [workflow] 当文章讨论...
│   └── ⚠️ 新增负面示例: [ai-coding] 不要因为...
└── AI 否决了 1 个提案: 'xxx' 样本量不足
```

### 6.3 动态词汇表标记

在 TagFeedbackView 的标签统计区域：

- 动态新增的标签显示 `+动态` 标记
- 被移出推荐的标签显示 `已降权` 标记（灰色删除线）

---

## 七、API 路由

| 路由 | 方法 | 用途 |
|------|------|------|
| `/api/tag-optimization/run` | POST | 触发优化 pipeline |
| `/api/tag-optimization/status` | GET | 查询是否达到触发阈值 |
| `/api/tag-optimization/history` | GET | 获取优化运行历史 |
| `/api/tag-optimization/vocab` | GET | 获取当前有效词汇表（静态+动态） |

### `/api/tag-optimization/run` 流程

1. 检查 feedback 窗口是否满足阈值（≥20），不满足返回 400
2. 调用 `computeOptimizationStats()` 基于全量历史生成统计摘要
3. 调用 `generateProposals(stats)` 规则引擎生成提案
4. 如果无提案，记录空运行并返回
5. 调用 MiniMax API 发送 meta-prompt + 提案
6. 解析 AI 返回，调用 `applyOptimizationActions()`
7. 写入 `optimization_runs` 记录
8. 返回本轮动作摘要

### `/api/suggest-tags` 修改

唯一改动：用 `buildSystemPrompt()` 替换当前硬编码的 prompt 构建逻辑，运行时从 DB 读取动态配置拼装。无动态配置时行为与现在完全一致。

---

## 八、安全边界

| 边界 | 实现方式 |
|------|----------|
| tier1 标签不可变 | `applyOptimizationActions` 硬编码检查 + `dynamic_vocab` CHECK 约束不含 tier1 |
| AI 可否决提案 | meta-prompt 明确允许 `approved: false`，只执行 approved 的动作 |
| 振荡防护 | `cooldown_until` 字段，被 demote 的标签 60 天内不接受恢复提案 |
| prompt 不会无限膨胀 | 每个 override_type 有条数上限，超限自动淘汰旧条目 |
| 优化不影响手动操作 | `dynamic_vocab` remove 只影响 AI prompt，用户手动输入不受限 |
| 可追溯 | 每条动态记录关联 `source_run_id`，可追溯到哪轮优化产生 |
| 无副作用降级 | DB 无动态数据时，suggest-tags 行为与当前完全一致 |

---

## 九、文件变更清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `db/schema.sql` | 修改 | 新增 3 张表 |
| `src/lib/db.ts` | 修改 | 新增: `checkOptimizationTrigger()`, `computeOptimizationStats()`, `generateProposals()`, `applyOptimizationActions()`, `getEffectiveVocab()`, `getActiveOverrides()`, `enforceOverrideLimits()` |
| `src/lib/tag-vocab.ts` | 修改 | 新增: `computeEffectiveVocab()`, `inferTier()` |
| `src/app/api/tag-optimization/run/route.ts` | 新增 | 触发优化 pipeline |
| `src/app/api/tag-optimization/status/route.ts` | 新增 | 查询触发阈值 |
| `src/app/api/tag-optimization/history/route.ts` | 新增 | 优化运行历史 |
| `src/app/api/tag-optimization/vocab/route.ts` | 新增 | 有效词汇表查询 |
| `src/app/api/suggest-tags/route.ts` | 修改 | `buildSystemPrompt()` 读取 DB 动态配置 |
| `src/app/api/archive/route.ts` | 修改 | 归档后检查优化触发条件，返回 `optimizationReady` |
| `src/components/TagFeedbackView.tsx` | 修改 | 新增优化触发按钮、历史展示、动态词汇标记 |
