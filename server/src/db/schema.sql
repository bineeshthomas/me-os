CREATE TABLE IF NOT EXISTS activities (
  id          SERIAL PRIMARY KEY,
  title       TEXT NOT NULL,
  notes       TEXT,
  date        DATE NOT NULL DEFAULT CURRENT_DATE,
  start_time  TIME,
  end_time    TIME,
  done        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activities_date_idx ON activities (date);
