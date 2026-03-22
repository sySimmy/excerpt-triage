# Changelog — 2026-03-21

## 背景

将 excerpt-triage 从"0502 摘录辅助工具"升级为**唯一的摘录阅读入口**。Obsidian 侧的 QuickAdd 摘录工作流已废弃，0502 目录已删除。

---

## 架构变更

### 新的流转架构

```
0507 Raw-Excerpts (采集池)
    │
    │  excerpt-triage (唯一阅读入口)
    │
    ├── Enter  归档 → 0506 已读归档
    ├── D      删除 → 永久删除
    └── S      跳过 → 留在 0507
```

### 废弃的组件

- `0502 摘录/` — 整个目录已删除
- Obsidian QuickAdd 摘录命令（9 个）— 已从 data.json 移除
- `_quickadd/scripts/excerpt-status.js` — 已删除
- `Excerpts Dashboard.md` — 已删除（原 0502 看板）
- `QuickAdd 摘录工作流使用说明.md` — 已删除

---

## 代码改动

### `src/lib/archiver.ts`

**归档目标变更**

- Before: `ARCHIVE_BASE = "05 Library/0502 摘录"` → 按 source_type 写入子目录（Social-Thread/、Web-Articles/ 等）
- After: `ARCHIVE_BASE = "05 Library/0506 已读归档"` → 单层目录，不再按 source_type 分子目录

**归档 frontmatter 增强**

归档时写入的字段：
- `status: "已归档"`（之前是 `"archived"`）
- `archive_topic`: 自动推断的主题桶 slug
- `finished`: 归档日期（YYYY-MM-DD）
- 保留用户编辑的 `tags`、`signal`、`source_type`、`topic`

**inferArchiveTopic 优先级调整**

新增 tier-1 标签直接映射，优先于关键词正则匹配：

```typescript
import { TAG_TO_ARCHIVE_TOPIC } from "./tag-vocab";

// Priority: use tier-1 tag if present
for (const tag of tags) {
  const mapped = TAG_TO_ARCHIVE_TOPIC[tag.toLowerCase()];
  if (mapped) return mapped;
}
// Fallback: keyword regex matching (unchanged)
```

### `src/lib/scanner.ts`

**扫描目标变更**

- Before: `scanArchivedExcerpts` 扫描 `0502 摘录/`
- After: `scanArchivedExcerpts` 扫描 `0506 已读归档/`

**新增 `purgeStaleRecords()`**

`fullScan` 时先清理 SQLite 中指向已不存在文件的记录，避免幽灵条目。

### `src/lib/tag-vocab.ts` (新增)

标签词表，三层结构：

```typescript
TIER1_DOMAIN   // 7 个领域标签，对齐 archive_topic 7 桶
TIER2_TOOLS    // 5 个工具/产品标签
TIER3_TOPICS   // 13 个主题细分标签
ALL_TAGS       // 全部 25 个合法标签
TAG_TO_ARCHIVE_TOPIC  // tier-1 → archive_topic slug 映射
isVocabTag()   // 判断标签是否在词表内
getTagGroup()  // 返回标签所属层级
```

### `src/app/api/suggest-tags/route.ts`

**prompt 重写**

- Before: 传入 top 100 已有标签，AI 自由推荐 3-8 个
- After: 传入完整词表（分三层），要求 AI 只从词表选 1-4 个

**返回格式变更**

- Before: `{ tags: string[] }`
- After: `{ tags: string[], candidates: string[] }`
  - `tags`: 词表内命中的标签（直接可用）
  - `candidates`: 词表外建议的新标签（需用户确认）

**候选标签校验**

candidates 必须满足 `^[a-z][a-z0-9-]{1,19}$`（全小写英文+连字符，2-20 字符）

**额外校验**

返回的 tags 经过 `ALL_TAGS.includes(t)` 二次验证，防止 AI 幻觉。

### `src/components/ReadingPanel.tsx`

**候选标签 UI**

AI 推荐后，词表外的候选标签显示在独立行：
- 黄色虚线边框，视觉上与正式标签区分
- 每个候选有 ✓（采纳→加入 tags）和 ×（忽略→移除）按钮
- 切换文章时自动清空候选列表

### `src/components/FilterBar.tsx`

**新增 tag 筛选**

在 source_type 下拉后新增标签下拉，列出全部 25 个词表标签。

**Filters 接口扩展**

```typescript
interface Filters {
  status: string;
  source_type: string;
  search: string;
  tag: string;       // 新增
}
```

### `src/app/page.tsx`

- filters 初始值新增 `tag: ""`
- tag filter 作为 query param 传给 `/api/excerpts`
- tagSuggestions 优先使用词表标签，DB 标签作为补充

---

## Obsidian 侧联动更新

| 文件 | 改动 |
|------|------|
| `90 System/9003 规范/标签词表.md` | 新增，定义三层标签词表和使用规则 |
| `90 System/9003 规范/笔记属性使用规则.md` | 摘录三层改两层，status 枚举精简，tags 引用标签词表 |
| `Excerpts Raw Dashboard.md` | 移除 0502 引用，指向 triage app |
| `Excerpts Archive Dashboard.md` | 移除 Excerpts Dashboard 链接 |
| `Library Index.md` | 移除 0502 分区 |
| `Simmy 工作台 Dashboard.md` | Newsletter 查询改为查 0506 |

---

## 配置

无变化，仍使用 `.env.local`：

```
VAULT_PATH="/Users/simmysun/Library/Mobile Documents/iCloud~md~obsidian/Documents/everything"
MINIMAX_API_KEY="..."
MINIMAX_MODEL="MiniMax-Text-01"
```
