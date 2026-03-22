# Excerpt Triage — 摘录分拣台

本地 Web App，逐篇阅读 Obsidian vault 中的 Raw-Excerpts，打标签、分类、归档。

## 流转架构

```
0507 Raw-Excerpts (采集池)
    │
    │  excerpt-triage (唯一阅读入口)
    │
    ├── Enter  归档 → 0506 已读归档 (打标 + archive_topic)
    ├── D      删除 → 永久删除
    └── S      跳过 → 留在 0507
```

## 位置

```
/Users/simmysun/excerpt-triage/
```

## 启动

```bash
cd /Users/simmysun/excerpt-triage
npm run dev
```

打开浏览器访问 `http://localhost:3456`

## 快捷键

| 快捷键 | 操作 |
|--------|------|
| `↑/↓` | 切换文件 |
| `1-5` | 快速评分 |
| `Enter` | 归档并下一篇 |
| `S` | 跳过 |
| `D` | 删除 |
| `E` | 编辑标签 |

## 功能

- **自动扫描**：启动时索引 `0507 Raw-Excerpts/` 的所有 .md 文件
- **逐篇阅读**：左侧列表 + 右侧阅读面板，类似邮件客户端
- **筛选排序**：按状态、来源类型、关键词筛选
- **标签编辑**：手动添加 + AI 推荐（MiniMax）
- **英文翻译**：检测到英文内容自动显示翻译按钮（MiniMax）
- **归档**：一键移动文件到 `0506 已读归档/` 并更新 frontmatter（写入 archive_topic、finished 等）

## 归档写入的字段

归档时自动写入以下 frontmatter：

- `status: 已归档`
- `archive_topic`: 按内容自动推断的主题分类
- `finished`: 归档日期
- `tags`, `signal`, `source_type`, `topic`: 保留 triage 中编辑的值

## 配置

环境变量在 `.env.local` 中：

```
VAULT_PATH="/Users/simmysun/Library/Mobile Documents/iCloud~md~obsidian/Documents/everything"
MINIMAX_API_KEY="你的key"
MINIMAX_MODEL="MiniMax-Text-01"
```

## 技术栈

Next.js + SQLite (better-sqlite3) + Tailwind CSS
