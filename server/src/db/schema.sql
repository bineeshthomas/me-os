DROP TABLE IF EXISTS activities;

CREATE TABLE IF NOT EXISTS projects (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_steps (
  id         SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  done       BOOLEAN NOT NULL DEFAULT FALSE,
  position   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS project_steps_project_idx ON project_steps (project_id);

CREATE TABLE IF NOT EXISTS notes (
  id         SERIAL PRIMARY KEY,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS items (
  id         SERIAL PRIMARY KEY,
  kind       TEXT NOT NULL CHECK (kind IN ('task', 'call', 'email', 'meeting', 'reminder')),
  title      TEXT NOT NULL,
  due_at     TIMESTAMPTZ,
  done       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS items_kind_idx ON items (kind, done);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Messages: a new item kind with the app it should be sent on
ALTER TABLE items ADD COLUMN IF NOT EXISTS app TEXT CHECK (app IN ('whatsapp', 'teams'));
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_kind_check;
ALTER TABLE items ADD CONSTRAINT items_kind_check CHECK (kind IN ('task', 'call', 'email', 'message', 'meeting', 'reminder'));

-- Completed items drop off the cards after the day they were ticked
ALTER TABLE items ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
UPDATE items SET completed_at = now() WHERE done AND completed_at IS NULL;

CREATE TABLE IF NOT EXISTS links (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  url        TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Projects sort by last activity (created, edited, or any step changed)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;
UPDATE projects SET updated_at = created_at WHERE updated_at IS NULL;
ALTER TABLE projects ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE projects ALTER COLUMN updated_at SET NOT NULL;

-- Daily review: one entry per day
CREATE TABLE IF NOT EXISTS daily_reviews (
  date         DATE PRIMARY KEY,
  wins         TEXT NOT NULL DEFAULT '',
  went_well    TEXT NOT NULL DEFAULT '',
  blocker      TEXT NOT NULL DEFAULT '',
  learned      TEXT NOT NULL DEFAULT '',
  priorities   JSONB NOT NULL DEFAULT '[]',
  brain_dump   TEXT NOT NULL DEFAULT '',
  gratitude    TEXT NOT NULL DEFAULT '',
  rating       INTEGER CHECK (rating BETWEEN 1 AND 5),
  energy       INTEGER CHECK (energy BETWEEN 1 AND 5),
  stress       INTEGER CHECK (stress BETWEEN 0 AND 100),
  completed_at TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Check-in habits ("worked out", "read") with a streak
CREATE TABLE IF NOT EXISTS habits (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  icon       TEXT NOT NULL DEFAULT '✅',
  points     INTEGER NOT NULL DEFAULT 10 CHECK (points > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS habit_logs (
  habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  date     DATE NOT NULL,
  PRIMARY KEY (habit_id, date)
);

-- Long-term goals, advanced by tiny daily steps worth points
CREATE TABLE IF NOT EXISTS goals (
  id            SERIAL PRIMARY KEY,
  title         TEXT NOT NULL,
  why           TEXT NOT NULL DEFAULT '',
  target_points INTEGER NOT NULL DEFAULT 100 CHECK (target_points > 0),
  achieved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS goal_entries (
  id         SERIAL PRIMARY KEY,
  goal_id    INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  points     INTEGER NOT NULL CHECK (points > 0),
  note       TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS goal_entries_goal_idx ON goal_entries (goal_id, date);

-- Starter habits, added once (deleting them later won't bring them back)
INSERT INTO habits (name, icon, points)
  SELECT v.name, v.icon, 10 FROM (VALUES ('Worked out', '💪'), ('Read a book', '📖')) AS v(name, icon)
  WHERE NOT EXISTS (SELECT 1 FROM settings WHERE key = 'habits_seeded');
INSERT INTO settings (key, value) VALUES ('habits_seeded', '1') ON CONFLICT (key) DO NOTHING;
