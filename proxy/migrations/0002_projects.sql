CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  lesson TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL,
  code TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'private',
  editable INTEGER NOT NULL DEFAULT 0,
  rev INTEGER NOT NULL DEFAULT 1,
  forked_from TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS projects_owner ON projects(owner, updated_at DESC);
CREATE INDEX IF NOT EXISTS projects_public ON projects(visibility, updated_at DESC);
CREATE TABLE IF NOT EXISTS project_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  rev INTEGER NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  code TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS project_versions_project ON project_versions(project_id, created_at DESC);
