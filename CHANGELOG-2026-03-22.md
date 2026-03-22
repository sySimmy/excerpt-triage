# Changelog — 2026-03-22

## 功能一：收录时间筛选 + 随机排序

### 需求

- 按收录时间（`captured_at`）筛选最近的文章
- 支持随机排序模式，用 toggle 按钮切换

### 代码改动

**`src/lib/db.ts`**

- `getExcerpts()` 新增 `captured_after` 过滤参数：`captured_at >= @captured_after`
- `getExcerpts()` 新增 `sort` 参数：`"random"` → `ORDER BY RANDOM()`，默认 → `ORDER BY captured_at DESC, id DESC`（从 `published_at` 改为 `captured_at`）

**`src/app/api/excerpts/route.ts`**

- 从 query params 解析 `captured_within`（天数），转换为日期字符串传给 `captured_after`
- 透传 `sort` 参数

**`src/components/FilterBar.tsx`**

- `Filters` 接口新增 `captured_within`、`sort`、`_randomSeed` 字段
- 新增时间范围下拉：全部 / 今天 / 3天内 / 一周内 / 一个月内
- 新增 🔀 shuffle 按钮：未激活时单按钮，激活后分为左侧（换一批）+ 右侧 ×（退出随机）
- 移除"已归档"状态选项（配合功能二）

**`src/app/page.tsx`**

- `filters` state 新增 `captured_within`、`sort`、`_randomSeed`
- 随机模式下禁用无限滚动（`hasMore` 强制为 false）
- `_randomSeed` 变化触发列表刷新

---

## 功能二：收件箱 / 归档双视图

### 需求

将未分类和已归档文章分成两个独立视图：
- 收件箱：保持现有 triage 流程
- 归档：标签云筛选（多选交集）+ 按 tier-1 标签分组浏览 + 轻度编辑（标签/评分）

### 设计文档

`docs/superpowers/specs/2026-03-22-inbox-archive-dual-view-design.md`

### 新增文件

**`src/components/ViewTabs.tsx`**

顶部 `[收件箱] [归档]` Tab 切换栏。当前 Tab 有 accent 色底部高亮线。

**`src/components/ArchiveFilterBar.tsx`**

- 标签云：font-size 12px–24px 线性缩放，反映文章数量
- 多选交集筛选：点击标签 toggle 选中/取消
- 已选标签行：显示选中标签 + × 移除 + 清除按钮
- 搜索框 + 文章总数显示

**`src/components/ArchiveGroupList.tsx`**

- 按 `TIER1_DOMAIN`（from `tag-vocab.ts`）前端分组
- 多 tier-1 标签的文章出现在每个匹配组
- 无 tier-1 标签归入"未分类"组
- 组头：标签名 + 中文描述 + 文章数，可折叠/展开
- 空状态处理："没有同时包含这些标签的文章" + 清除筛选按钮
- 顶部显示去重文章总数

**`src/app/api/archive/tags/route.ts`**

`GET` 返回归档文章的标签统计（`location = 'archived'`）。

**`src/app/api/archive/excerpts/route.ts`**

`GET` 返回归档文章列表，支持 `tags`（逗号分隔，交集筛选）、`search`、`limit`、`offset`。

### 修改文件

**`src/lib/db.ts`**

- `getExcerpts()` 新增 `exclude_archived` 参数：`location != 'archived'`
- 新增 `getArchivedTags()`：统计归档文章标签，按 count 降序
- 新增 `getArchivedExcerpts(filters)`：支持 tags 交集（多个 `tags LIKE` AND 拼接）+ search + 分页

**`src/app/api/excerpts/route.ts`**

- 传 `exclude_archived: true`，收件箱不再显示已归档文章

**`src/components/ReadingPanel.tsx`**

- `onArchived`/`onDeleted`/`onNext` 改为可选 props（`?.()` 调用）
- 新增 `archiveMode?: boolean` prop：
  - 隐藏归档/删除/跳过按钮、来源类型选择器
  - 快捷键提示改为 "1-5 评分 · T AI标签 · E 编辑标签"
  - 键盘处理：`archiveMode` 时 Enter/D/S 不响应，仅保留 1-5/T

**`src/app/page.tsx`**

- 新增 `activeView` state：`'inbox' | 'archive'`
- 归档独立 state：`archiveItems`、`archiveTotal`、`archiveTagStats`、`archiveSelectedTags`、`archiveSearch`、`archiveSelectedId`、`archiveLoading`
- 切到归档 Tab 时 fetch `/api/archive/tags` + `/api/archive/excerpts`
- 键盘导航（↑↓/E）适配当前 activeView 的列表和选中项
- Tab 切换时各自筛选状态保留（React state）
