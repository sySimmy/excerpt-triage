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

CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  excerpt_id INTEGER,
  action TEXT NOT NULL,          -- archive, delete
  title TEXT,
  source_type TEXT,
  source_name TEXT,
  tags TEXT DEFAULT '[]',
  signal INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_activity_action ON activity_log(action);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity_log(created_at);

-- Track AI tag suggestions vs user final tags for accuracy analysis
CREATE TABLE IF NOT EXISTS tag_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  excerpt_id INTEGER NOT NULL,
  title TEXT,
  tags_before_ai TEXT DEFAULT '[]',       -- tags before AI was invoked
  ai_suggested TEXT DEFAULT '[]',          -- vocab tags AI added directly
  ai_candidates TEXT DEFAULT '[]',         -- novel candidate tags AI suggested
  accepted_candidates TEXT DEFAULT '[]',   -- candidates user accepted
  dismissed_candidates TEXT DEFAULT '[]',  -- candidates user dismissed
  user_added TEXT DEFAULT '[]',            -- tags user added manually (not from AI)
  user_removed TEXT DEFAULT '[]',          -- AI tags user later removed
  final_tags TEXT DEFAULT '[]',            -- tags at archive time
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE INDEX IF NOT EXISTS idx_tag_feedback_excerpt ON tag_feedback(excerpt_id);
CREATE INDEX IF NOT EXISTS idx_tag_feedback_created ON tag_feedback(created_at);

-- === Tag Optimization ===

CREATE TABLE IF NOT EXISTS optimization_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  feedback_window_start INTEGER NOT NULL,
  feedback_window_end INTEGER NOT NULL,
  feedback_count INTEGER NOT NULL,
  total_feedback_count INTEGER NOT NULL,
  stats_snapshot TEXT NOT NULL,
  ai_response TEXT,
  actions_taken TEXT NOT NULL DEFAULT '[]',
  precision_before REAL,
  recall_before REAL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dynamic_vocab (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tag TEXT NOT NULL UNIQUE,
  tier TEXT NOT NULL CHECK(tier IN ('tier2_tools','tier3_topics')),
  action TEXT NOT NULL CHECK(action IN ('add','remove')),
  reason TEXT,
  cooldown_until TEXT,
  oscillation_count INTEGER DEFAULT 0,
  source_run_id INTEGER REFERENCES optimization_runs(id),
  created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS prompt_overrides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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
