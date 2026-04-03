# Excerpt Triage Cloud — Design Spec

## Overview

将现有的本地 excerpt-triage 应用迁移到云端，支持手机端分拣操作（阅读、打标签、评分、归档），同时保留 Obsidian vault 作为采集入口。

### 目标

- 手机浏览器可访问，支持 PWA 添加到主屏幕
- 桌面和手机共用同一个应用，数据实时同步
- Obsidian vault 继续作为内容采集来源
- 新建独立项目 `excerpt-triage-cloud/`，不修改原项目

### 非目标

- 多用户支持
- 手机端内容采集
- 原生 APP（后续可考虑）
- 离线模式

## Architecture

### 系统组成

三个独立部分：

1. **Cloud App** — Next.js 15 部署在 Vercel，提供 Web UI 和 API
2. **Cloud Database** — Supabase PostgreSQL，数据唯一真实来源
3. **Local Sync Agent** — Mac 上的 Node.js 脚本，桥接 vault 和 Supabase

### 数据流

```
采集：Obsidian 剪藏 → vault/.md 文件 → sync agent → Supabase
分拣：手机/桌面浏览器 → Vercel App → Supabase（读写）
归档：用户点归档 → Supabase 状态更新 → sync agent 移动 vault 文件（0507 → 0506）
```

### 项目结构

```
excerpt-triage-cloud/
├── src/                        # Next.js 应用
│   ├── app/                    # App Router pages + API routes
│   │   ├── page.tsx            # 主页面（响应式，桌面双栏/手机单栏）
│   │   ├── layout.tsx          # Root layout + PWA meta tags
│   │   ├── login/              # 密码登录页
│   │   └── api/                # API routes（从原项目迁移）
│   ├── components/             # React 组件
│   └── lib/                    # 核心逻辑
│       ├── supabase.ts         # Supabase client 初始化
│       ├── auth.ts             # 密码验证 + cookie 管理
│       ├── minimax.ts          # MiniMax API client（不变）
│       ├── tag-vocab.ts        # 标签词表（不变）
│       ├── tag-optimization.ts # 标签优化（不变）
│       └── inbox-filters.ts    # 筛选逻辑（不变）
├── sync-agent/                 # 本地同步脚本
│   ├── index.ts                # 入口，watch/手动模式
│   ├── scanner.ts              # vault 文件扫描 + frontmatter 解析
│   ├── archiver.ts             # 文件移动逻辑
│   ├── frontmatter.ts          # YAML frontmatter 读写
│   ├── supabase.ts             # Supabase client
│   ├── package.json            # 独立依赖
│   └── .env.local              # VAULT_PATH, SUPABASE_URL, SUPABASE_SERVICE_KEY
├── supabase/
│   └── migrations/
│       └── 001_initial.sql     # PostgreSQL schema
├── public/
│   ├── manifest.json           # PWA manifest
│   └── icons/                  # PWA 图标
├── package.json
├── next.config.mjs
├── tsconfig.json
└── .env.example
```

## Database Schema (Supabase PostgreSQL)

### `excerpts` 表

从 SQLite 迁移，主要变化：

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | `BIGINT GENERATED ALWAYS AS IDENTITY` | 主键 |
| `file_path` | `TEXT UNIQUE` | vault 相对路径（如 `0507 Raw-Excerpts/xxx.md`） |
| `title` | `TEXT` | 标题 |
| `content` | `TEXT` | **新增** — 摘录正文（原来存在 .md 文件中） |
| `source_type` | `TEXT` | rss/social/newsletter/video/report/article |
| `source_name` | `TEXT` | 来源名称 |
| `author` | `TEXT` | 作者 |
| `url` | `TEXT` | 原文链接 |
| `published_at` | `TIMESTAMPTZ` | 发布时间 |
| `captured_at` | `TIMESTAMPTZ` | 采集时间 |
| `topic` | `TEXT` | 归档主题 |
| `signal` | `INTEGER` | 评分 0-5 |
| `status` | `TEXT` | to_process/reading/read/deep_read/archived |
| `tags` | `JSONB` | 标签数组 |
| `location` | `TEXT` | raw/archived |
| `synced_at` | `TIMESTAMPTZ` | **新增** — 最后同步时间 |
| `created_at` | `TIMESTAMPTZ DEFAULT NOW()` | 创建时间 |
| `updated_at` | `TIMESTAMPTZ DEFAULT NOW()` | 更新时间 |

索引：`status`、`source_type`、`signal`、`location`

### `activity_log` 表

结构不变，类型调整（`INTEGER` → `BIGINT`，`TEXT` timestamp → `TIMESTAMPTZ`）。

### `tag_feedback` 表

结构不变，tags 相关字段从 `TEXT`（JSON string）改为 `JSONB`。

### `optimization_runs` + `dynamic_vocab` 表

结构不变，类型调整同上。

### `prompt_overrides` 表

从 SQLite 迁移，结构不变。用于 `tag-optimization.ts` 的 `buildSystemPrompt()` 函数，存储 AI 标签建议的 prompt 覆盖配置。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | `BIGINT GENERATED ALWAYS AS IDENTITY` | 主键 |
| `key` | `TEXT UNIQUE` | prompt 配置 key |
| `value` | `TEXT` | prompt 内容 |
| `created_at` | `TIMESTAMPTZ DEFAULT NOW()` | 创建时间 |
| `updated_at` | `TIMESTAMPTZ DEFAULT NOW()` | 更新时间 |

### `excerpts` 表补充说明

**`content` 字段**：存储 frontmatter 剥离后的正文（纯 Markdown）。sync agent 解析 .md 文件时用 `gray-matter` 分离 frontmatter 和 content，仅存储 content 部分。

**`translation` 字段**（新增 `TEXT`）：存储翻译结果。现有系统把译文追加到 .md 文件末尾，云端版本独立存储，避免污染原文。下行同步时 sync agent 将译文以 `\n---\n## 译文\n` 格式追加回 .md 文件。

**`location` 字段统一**：统一使用 `raw` / `archived` 两个值。原项目 `archiver.ts` 中的 `inbox` 值统一为 `raw`。

**`deleted_at` 字段**（新增 `TIMESTAMPTZ`）：软删除标记。云端删除操作设置此字段而非物理删除行，sync agent 检测到 `deleted_at` 非空时删除对应 vault 文件，然后物理删除数据库行。

## API Layer

### 迁移策略

接口签名不变，内部实现从 `better-sqlite3` 改为 `@supabase/supabase-js`。所有查询从同步变异步。

### 路由分类

**直接迁移（改数据源，纯 DB 查询）：**
- `GET /api/excerpts` — 查询 Supabase `excerpts` 表
- `GET /api/archive/excerpts` — 查询 `location = 'archived'`
- `GET /api/archive/tags` — 聚合归档标签
- `GET /api/tags` — 查询所有标签
- `GET /api/stats` — 统计查询（注意：SQLite 的 `julianday()` 需改为 PostgreSQL 的 `EXTRACT(EPOCH FROM ...)`、`DATE_TRUNC()` 等）
- `POST /api/tag-feedback` — 保存反馈
- `GET /api/tag-feedback/analysis` — 反馈分析
- `GET /api/tag-optimization/status` — 优化状态查询
- `GET /api/tag-optimization/vocab` — 词表查询
- `GET /api/tag-optimization/history` — 优化历史
- `POST /api/tag-optimization/run` — 触发优化

**需要重构（去除本地文件系统依赖）：**
- `PATCH /api/excerpts/[id]` — 现有实现会写回 vault frontmatter 和追加翻译到文件。云端版本只更新 Supabase（tags/signal/status/translation），sync agent 负责写回 vault 文件
- `POST /api/sync` — 改为查询 sync agent 同步状态（最后同步时间、待同步数量），不再直接扫描文件
- `POST /api/archive` — 更新 Supabase 状态为 `archived`，不再直接移动文件；sync agent 负责实际文件移动
- `DELETE /api/archive` — 设置 `deleted_at` 软删除标记，sync agent 检测后删除 vault 文件并物理删除 DB 行
- `POST /api/archive/unarchive` — 更新状态回 `to_process`，sync agent 把文件移回
- `GET/POST /api/deep-read` — POST 现有实现调用 `updateFrontmatterFields()` 写本地文件，云端版本只更新 Supabase status
- `POST /api/format` — 现有实现用 `fs.readFileSync` 读本地文件内容，云端版本从 Supabase `content` 字段读取

**不变：**
- `POST /api/suggest-tags` — MiniMax API 调用
- `POST /api/translate` — MiniMax API 调用，但翻译结果存入 `excerpts.translation` 字段而非追加到文件

**移除（不适用于云端）：**
- `POST /api/notebooklm` — 依赖本地 Python 脚本 `scripts/push-to-notebooklm.py`，无法在 Vercel 运行。如需保留，后续可作为 sync agent 的本地命令实现
- `POST /api/stats/summary` — 如依赖本地文件系统则移除，如纯 AI 调用则归入"不变"类

### 读取正文

现有系统阅读时实时读取 .md 文件。迁移后直接从 `excerpts.content` 字段读取，`GET /api/excerpts` 的详情查询返回 content 字段。列表查询排除 content 以减少传输量。

## Access Protection

单用户简单密码保护：

- 环境变量 `ACCESS_PASSWORD` 存储密码
- `/login` 页面：密码输入表单
- 验证通过后设置 HTTP-only cookie（30 天有效期）
- Next.js middleware 检查 cookie，未认证请求重定向到 `/login`
- API routes 同样检查 cookie，未认证返回 401
- `/api/suggest-tags`、`/api/translate`、`/api/format` 等所有路由均需认证

## Mobile UI (Responsive)

### 适配策略

Tailwind 响应式断点，一套代码：
- `md:` 以上（≥768px）→ 桌面双栏布局（现有布局）
- `md:` 以下 → 手机单栏布局

### 手机布局

**列表视图：**
- 顶部 tab 导航（收件箱/精读/归档/统计）
- 横向滚动筛选器（来源类型 pill）
- 卡片式列表，显示标题、来源、标签、评分
- 点击卡片进入阅读视图

**阅读视图：**
- 顶部导航栏：返回按钮 + 当前位置（1/23）+ 下一篇
- 标题、元信息、标签编辑、信号评分
- 正文内容（Markdown 渲染）
- 底部固定操作栏：归档、跳过、精读、翻译、删除

### PWA 配置

- `public/manifest.json`：应用名 "摘录分拣台"、图标、`display: standalone`、主题色 `#1a1a2e`
- `layout.tsx` 添加 PWA meta tags（`theme-color`、`apple-mobile-web-app-capable`）
- Service Worker：仅用于 PWA 安装和加速加载（缓存静态资源），不做离线数据缓存。无网络时显示"需要网络连接"提示页

## Local Sync Agent

### 职责

Mac 上运行的 Node.js 脚本，双向同步 vault 和 Supabase。

### 上行同步（vault → Supabase）

1. 扫描 `0507 Raw-Excerpts/` 和 `0506 已读归档/` 目录
2. 解析 .md 文件 frontmatter + 正文
3. 按 `file_path` 匹配：新文件 → INSERT，已有文件 → 比较 `updated_at`，本地更新则 UPDATE
4. `synced_at` 标记同步时间

### 下行同步（Supabase → vault）

1. 查询 `updated_at > last_sync_time` 的记录
2. `location` 变为 `archived` → 移动文件到 `0506`，更新 frontmatter
3. 记录被删除 → 删除或移动对应文件
4. `unarchive` → 移回 `0507`

### 运行模式

- **watch 模式**：`node sync.js --watch`
  - chokidar 监听文件变化 → 即时上行同步
  - 每 30 秒轮询 Supabase → 下行同步
- **手动模式**：`node sync.js` — 全量同步一次后退出

### 冲突处理

单用户场景，按字段职责分离，避免整行覆盖：

- **上行（vault → cloud）**：sync agent 只更新 `content`、frontmatter 元数据（title/source_type/author 等）、`file_path`。不覆盖用户在云端操作产生的字段（tags/signal/status/location/translation）
- **下行（cloud → vault）**：sync agent 只把 tags/signal/status/topic/translation 写回 vault frontmatter。不覆盖文件正文
- **Upsert 防御逻辑**：复用原项目 `upsertExcerpt` 的 CASE 逻辑——不覆盖已有的 signal（> 0）、非空 tags、deep_read/archived 状态

这样即使上行和下行同时发生，它们操作的字段不重叠，不会产生冲突。

### 代码复用

从原项目复用：
- `scanner.ts` — 文件遍历、frontmatter 解析
- `frontmatter.ts` — YAML 读写
- `archiver.ts` — 文件移动、目录归类

改造：数据写入目标从 SQLite 改为 Supabase SDK。

### 开机自启（可选）

macOS `launchd` plist，Mac 开机后自动启动 watch 模式。

## Deployment

### Vercel

- Next.js 15 原生支持
- 环境变量：`SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_KEY`、`MINIMAX_API_KEY`、`MINIMAX_MODEL`、`ACCESS_PASSWORD`、`NOTEBOOKLM_NOTEBOOK_ID`（可选，如保留该功能）
- 移除 `better-sqlite3` 依赖（无需 native binding）
- 移除 `VAULT_PATH`（云端不访问本地文件系统）

### Supabase

- 免费版（500MB 数据库、50K 月活跃用户、1GB 文件存储）
- 用 migration SQL 初始化表结构
- 开启 Row Level Security，策略：
  - `anon` key（Vercel 使用）：所有表 SELECT/INSERT/UPDATE/DELETE（通过 middleware 密码验证控制访问）
  - `service_role` key（sync agent 使用）：绕过 RLS 全权限
  - RLS 策略实质上是 `USING (true)` + `WITH CHECK (true)`，因为访问控制在应用层（密码 cookie）而非数据库层
- 容量预估：假设每条摘录 content 平均 5KB，1000 条约 5MB，500MB 限制足够日常使用

### Sync Agent

- 仅在 Mac 本地运行
- 独立的 `package.json` 和 `.env.local`
- 依赖：`@supabase/supabase-js`、`chokidar`、`gray-matter`、`dotenv`

## Migration Path

### 从原项目到新项目的迁移步骤

1. 创建 `excerpt-triage-cloud/` 项目，初始化 Next.js
2. 设置 Supabase 项目，运行 migration SQL
3. 迁移 API routes（改数据源）
4. 迁移 UI 组件（加响应式断点）
5. 实现密码保护
6. 配置 PWA
7. 开发 sync agent
8. 部署到 Vercel
9. 用 sync agent 做首次全量同步（vault → Supabase）
10. 验证桌面和手机端功能
