CREATE TABLE schedule_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL,
  write_token TEXT NOT NULL DEFAULT ''
);
INSERT INTO schedule_state (id, revision) VALUES (1, 0);

CREATE TABLE lesson_overrides (
  date TEXT NOT NULL,
  period INTEGER NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  room TEXT NOT NULL DEFAULT '',
  teacher TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  removed INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (date, period)
);

CREATE TABLE change_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  revision INTEGER NOT NULL,
  at TEXT NOT NULL,
  date TEXT NOT NULL,
  period INTEGER NOT NULL,
  before TEXT,
  after TEXT
);
CREATE INDEX change_log_revision ON change_log (revision DESC);

CREATE TABLE login_failures (
  ip TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX login_failures_ip_at ON login_failures (ip, at);
