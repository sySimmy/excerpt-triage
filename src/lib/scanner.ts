import fs from "fs";
import path from "path";
import { upsertExcerpt, getDb } from "./db";
import { parseFrontmatter, normalizeFrontmatter } from "./frontmatter";

const RAW_EXCERPTS_DIR = "05 Library/0507 Raw-Excerpts";
const ARCHIVE_DIR = "05 Library/0506 已读归档";

function walkDir(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath));
    } else if (entry.name.endsWith(".md") && entry.name !== "_index.md") {
      results.push(fullPath);
    }
  }
  return results;
}

export function scanRawExcerpts(vaultPath: string): { scanned: number; added: number; errors: number } {
  const rawDir = path.join(vaultPath, RAW_EXCERPTS_DIR);
  const files = walkDir(rawDir);

  const db = getDb();
  const insertMany = db.transaction((filesToProcess: string[]) => {
    let added = 0;
    let errors = 0;

    for (const filePath of filesToProcess) {
      try {
        const { data } = parseFrontmatter(filePath);
        const normalized = normalizeFrontmatter(data, filePath);

        const title = normalized.title ?? path.basename(filePath, ".md");

        // Raw directory items should never be "archived" status
        const status = normalized.status === "archived" ? "to_process" : normalized.status;

        upsertExcerpt({
          file_path: filePath,
          title,
          source_type: normalized.source_type,
          source_name: normalized.source_name,
          author: normalized.author,
          url: normalized.url,
          published_at: normalized.published_at,
          captured_at: normalized.captured_at,
          topic: normalized.topic,
          signal: normalized.signal,
          status,
          tags: JSON.stringify(normalized.tags),
          location: "raw",
        });
        added++;
      } catch (e) {
        errors++;
        console.error(`Error scanning ${filePath}:`, e);
      }
    }

    return { added, errors };
  });

  const result = insertMany(files);
  return { scanned: files.length, ...result };
}

export function scanArchivedExcerpts(vaultPath: string): { scanned: number; added: number; errors: number } {
  const archiveDir = path.join(vaultPath, ARCHIVE_DIR);
  const files = walkDir(archiveDir);

  const db = getDb();
  const insertMany = db.transaction((filesToProcess: string[]) => {
    let added = 0;
    let errors = 0;

    for (const filePath of filesToProcess) {
      try {
        const { data } = parseFrontmatter(filePath);
        const normalized = normalizeFrontmatter(data, filePath);
        const title = normalized.title ?? path.basename(filePath, ".md");

        upsertExcerpt({
          file_path: filePath,
          title,
          source_type: normalized.source_type,
          source_name: normalized.source_name,
          author: normalized.author,
          url: normalized.url,
          published_at: normalized.published_at,
          captured_at: normalized.captured_at,
          topic: normalized.topic,
          signal: normalized.signal,
          status: "archived",
          tags: JSON.stringify(normalized.tags),
          location: "archived",
        });
        added++;
      } catch (e) {
        errors++;
        console.error(`Error scanning ${filePath}:`, e);
      }
    }

    return { added, errors };
  });

  const result = insertMany(files);
  return { scanned: files.length, ...result };
}

export function purgeStaleRecords(): number {
  const db = getDb();
  const rows = db.prepare("SELECT id, file_path FROM excerpts").all() as { id: number; file_path: string }[];
  let removed = 0;
  const deleteStmt = db.prepare("DELETE FROM excerpts WHERE id = ?");
  const purge = db.transaction(() => {
    for (const row of rows) {
      if (!fs.existsSync(row.file_path)) {
        deleteStmt.run(row.id);
        removed++;
      }
    }
  });
  purge();
  return removed;
}

export function fullScan(vaultPath: string) {
  const purged = purgeStaleRecords();
  const raw = scanRawExcerpts(vaultPath);
  const archived = scanArchivedExcerpts(vaultPath);
  return {
    raw,
    archived,
    purged,
    total: raw.scanned + archived.scanned,
  };
}
