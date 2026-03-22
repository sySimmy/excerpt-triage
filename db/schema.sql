CREATE TABLE IF NOT EXISTS excerpts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT UNIQUE NOT NULL,
  title TEXT,
  source_type TEXT,
  source_name TEXT,
  author TEXT,
  url TEXT,
  published_at TEXT,
  captured_at TEXT,
  topic TEXT,
  signal INTEGER DEFAULT 0,
  status TEXT DEFAULT 'to_process',
  tags TEXT DEFAULT '[]',
  location TEXT DEFAULT 'raw',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_status ON excerpts(status);
CREATE INDEX IF NOT EXISTS idx_source_type ON excerpts(source_type);
CREATE INDEX IF NOT EXISTS idx_signal ON excerpts(signal);
CREATE INDEX IF NOT EXISTS idx_location ON excerpts(location);
