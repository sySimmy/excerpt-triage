# Material Library (素材库) — Design Spec

## Overview

A personal material/asset library for collecting, organizing, and retrieving visual and reference materials across product, marketing, promotion, display, store design, and PR categories. Built as an independent web application with the same architecture as excerpt-triage, backed by Obsidian vault storage.

**Primary use cases:**
1. Quick retrieval of inspiration references during planning
2. Curating categorized case collections for team/client proposals
3. Long-term industry benchmark accumulation and trend review

---

## 1. Vault Directory Structure

Root directory in vault (sibling to existing Raw-Excerpts/已读归档). `MATERIAL_ROOT` is relative to `VAULT_PATH`, e.g., `05 Library/0508 素材库`.

```
05 Library/0508 素材库/
├── 产品/
├── 营销案例/
├── 促销活动/
├── 陈列/
├── 门店装修/
├── PR/
└── _attachments/
    └── 2026-03/
        ├── img_001.jpg
        └── img_002.jpg
```

- Folders serve as **primary category**; each material belongs to exactly one folder.
- Multi-dimensional retrieval is handled via frontmatter tags, not folder nesting.
- Images stored in `_attachments/YYYY-MM/` and referenced by **relative path within `_attachments/`** in frontmatter (e.g., `2026-03/img_001.jpg`).

---

## 2. Material File Format

Each material is a single `.md` file with YAML frontmatter:

```yaml
---
title: "泡泡玛特 x 迪士尼联名毛绒系列"
category: 产品
subcategory: 线上
brands: [泡泡玛特, 迪士尼]
tags: [毛绒, IP联名, 限定款]
source_url: "https://..."
images: [2026-03/img_001.jpg, 2026-03/img_002.jpg]
signal: 0
status: 待整理
captured: 2026-03-26
---

备注、分析、要点...
```

### Field Definitions

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| title | string | yes | Material title |
| category | string | yes | Primary category: 产品/营销案例/促销活动/陈列/门店装修/PR |
| subcategory | string | no | Sub-category (线上/线下), applicable to 营销案例 and 促销活动 |
| brands | string[] | no | Brand tags (array) |
| tags | string[] | no | Attribute/technique/category tags (毛绒, 快闪, 联名, etc.) |
| source_url | string | no | Source URL |
| images | string[] | no | Image paths relative to `_attachments/` (e.g., `2026-03/img_001.jpg`) |
| signal | number | no | Quality rating 0-5 (default 0) |
| status | string | yes | 待整理 / 已整理 / 已删除 (soft delete) |
| captured | string | yes | Capture date YYYY-MM-DD |

### Material types by category

| Category | Typical form | Key fields |
|----------|-------------|------------|
| 产品 | Photos + link | images, source_url, brands |
| 营销案例 | Link (article/post) | source_url, subcategory (线上/线下) |
| 促销活动 | Link | source_url, subcategory (线上/线下) |
| 陈列 | On-site photos | images |
| 门店装修 | On-site photos | images |
| PR | Link (article) | source_url |

---

## 3. Database Design

SQLite database in `.nosync/` directory (local-only, excluded from iCloud sync). Vault `.md` files are source of truth; DB is an index cache rebuilt by scanner.

### Table: `materials`

```sql
CREATE TABLE materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT UNIQUE NOT NULL,
  title TEXT,
  category TEXT NOT NULL,
  subcategory TEXT,
  brands TEXT,          -- JSON array
  tags TEXT,            -- JSON array
  source_url TEXT,
  images TEXT,          -- JSON array of paths relative to _attachments/
  signal INTEGER DEFAULT 0,
  status TEXT DEFAULT '待整理',
  captured_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_materials_category ON materials(category);
CREATE INDEX idx_materials_status ON materials(status);
CREATE INDEX idx_materials_signal ON materials(signal);
CREATE INDEX idx_materials_captured_at ON materials(captured_at);
```

### Sync behavior

- Scanner walks `MATERIAL_ROOT` directory recursively (skips `_attachments/`)
- Parses `.md` files, extracts frontmatter
- Upserts to DB on `file_path` conflict with per-field conflict resolution:
  - **Vault-wins** (always overwritten from .md): `title`, `category`, `subcategory`, `source_url`, `images`, `captured_at`
  - **DB-wins** (preserved if user edited via web): `signal`, `status`, `tags`, `brands`
- Detects deleted files and removes from DB
- Scanner maps frontmatter `captured` → DB `captured_at`

---

## 4. Web Panel Design

### 4.1 Dashboard (Home)

- **Stats bar:** Total materials count, per-category counts
- **Recent activity:** Materials added in last 7 days (derived from `materials.created_at`, no separate activity log table in V1)
- **Category cards:** 6 cards (产品/营销案例/促销活动/陈列/门店装修/PR), each showing count and recent thumbnail. Click to enter filtered list view.

### 4.2 List View (Core browsing interface)

Left-right split layout (same as excerpt-triage):

**Left panel — Material cards:**
- Thumbnail (first image) + title + brand badges + date
- Text-only card for materials without images
- Infinite scroll (50 items per page)

**Right panel — Detail view:**
- Image gallery (multi-image carousel/grid)
- Full metadata display and inline editing
- Markdown content rendering (notes/analysis)
- Action buttons: edit tags, rate signal, mark as 已整理

### 4.3 Filter Bar

| Dimension | Type | Options |
|-----------|------|---------|
| Category | single-select | 产品/营销案例/促销活动/陈列/门店装修/PR/全部 |
| Subcategory | single-select | 线上/线下/全部 (only shown when category is 营销案例/促销活动/全部) |
| Brands | multi-select | Dynamic from DB (with counts) |
| Tags | multi-select | Dynamic from DB (with counts) |
| Signal | range | 0-5 |
| Time range | preset | 最近 7/30/90 天/全部 |
| Status | single-select | 待整理/已整理/全部 |
| Search | text | Title keyword (LIKE). Body content search is out of scope for V1 |

### 4.4 Material Creation (via Web panel)

- Form: title, category, subcategory, brands, tags, source_url, notes
- Image upload: drag-and-drop or click, auto-saved to `_attachments/YYYY-MM/`. Accepted types: jpg, png, webp, gif. Max 10MB per file. No server-side thumbnail generation in V1 (CSS handles display sizing)
- On submit: generates `.md` file in the corresponding category folder
- File naming: timestamp-based (`YYYYMMDD-HHMMSS.md`) to avoid CJK slugification issues

### 4.5 Material Creation (via Vault)

- User creates `.md` file manually in the category folder
- Fills in frontmatter fields
- Next sync picks it up and indexes to DB

---

## 5. API Design

```
POST   /api/sync              # Scan vault → sync to DB
GET    /api/materials          # List (filterable, paginated)
GET    /api/materials/:id      # Single material detail (reads .md body from disk)
PATCH  /api/materials/:id      # Update metadata (writes back to .md)
POST   /api/materials          # Create new material (generates .md + handles images)
DELETE /api/materials/:id      # Soft delete (sets status to 已删除, hides from UI; user manually removes vault file)
POST   /api/upload             # Image upload to _attachments/
GET    /api/images             # Serve image from _attachments/ (query: path=YYYY-MM/filename.jpg)
GET    /api/stats              # Dashboard statistics
GET    /api/brands             # Brand list with counts
GET    /api/tags               # Tag list with counts
```

All endpoints return JSON. API layer is stateless and independent — designed to be consumed by future mobile app/mini-program clients.

**Image serving:** `GET /api/images?path=2026-03/img_001.jpg` reads the file from `_attachments/` on disk and streams it to the browser. The client constructs image URLs via this endpoint since vault paths are server-side only.

**Brand/tag filtering:** Uses JSON `LIKE` matching (e.g., `LIKE '%"brandname"%'`), same pattern as excerpt-triage. Adequate for personal-scale data (< 10k records).

---

## 6. Tech Stack & Project Structure

**Stack:** Next.js 15 (App Router) + React 19 + TypeScript 5.8 (strict) + SQLite (better-sqlite3) + Tailwind CSS 4 + SWR

**Port:** 3457

```
material-library/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Dashboard + routing state
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   └── api/
│   │       ├── sync/route.ts
│   │       ├── materials/route.ts
│   │       ├── materials/[id]/route.ts
│   │       ├── upload/route.ts
│   │       ├── stats/route.ts
│   │       ├── brands/route.ts
│   │       └── tags/route.ts
│   ├── components/
│   │   ├── Dashboard.tsx         # Stats + category cards
│   │   ├── MaterialList.tsx      # Left panel card list
│   │   ├── MaterialDetail.tsx    # Right panel detail view
│   │   ├── FilterBar.tsx         # Multi-dimension filters
│   │   ├── ImageGallery.tsx      # Image carousel/grid
│   │   ├── MaterialForm.tsx      # Create/edit form
│   │   ├── TagEditor.tsx         # Tag input with autocomplete
│   │   └── BrandEditor.tsx       # Brand input with autocomplete
│   └── lib/
│       ├── db.ts                 # SQLite schema + queries
│       ├── scanner.ts            # Vault scanner
│       ├── frontmatter.ts        # YAML parse/serialize
│       ├── image.ts              # Image upload, path resolution, thumbnail
│       └── env.ts                # VAULT_PATH, MATERIAL_ROOT
├── .env.local                    # VAULT_PATH, MATERIAL_ROOT
├── package.json
└── tsconfig.json
```

---

## 7. Key Differences from excerpt-triage

| Dimension | excerpt-triage | Material Library |
|-----------|---------------|-----------------|
| Core object | Text excerpts | Visual materials (images + links) |
| Workflow | Inbox → triage → archive | Collect → organize → retrieve |
| Categories | By source type (RSS/social/etc.) | By use case (产品/营销/etc.) |
| Tag dimensions | Single (topic tags) | Multi (brands + attribute/technique tags) |
| Image handling | None | Core feature (upload, gallery, thumbnails) |
| AI features | Tag suggestions, translation, formatting | None in V1 |
| Detail view | Markdown rendering | Image gallery + metadata |
| Creation | Vault-only (scanner imports) | Web form + vault (dual entry) |

---

## 8. V1 Scope Boundaries

**In scope:**
- Vault directory structure and `.md` file format
- Scanner + SQLite sync
- Dashboard with category overview
- List view with multi-dimensional filtering
- Detail view with image gallery
- Material creation via web form (with image upload)
- Material editing (metadata + tags + rating)
- Material soft deletion (hides from UI; vault file remains for manual cleanup)

**Out of scope (future):**
- AI tag suggestions
- Link auto-scraping/parsing (manual input only)
- Case collection export (PDF/PPT)
- Multi-user / permissions
- Mobile app / mini-program (API layer is ready)
- Advanced image features (auto-crop, watermark, EXIF extraction)

---

## 9. Environment Configuration

```env
VAULT_PATH="/path/to/obsidian/vault"    # Supports ~ expansion
MATERIAL_ROOT="05 Library/0508 素材库"   # Relative to VAULT_PATH
```

SQLite DB at `.nosync/material-library.db` (local-only, excluded from iCloud).

**Project independence:** `material-library/` is a sibling directory to `excerpt-triage/` in the same parent folder. It has its own `package.json`, `node_modules`, and `.env.local`. No code is shared at the TypeScript level; architectural patterns are replicated.
