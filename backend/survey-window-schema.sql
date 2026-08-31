CREATE TABLE IF NOT EXISTS survey_periods (
  id bigserial PRIMARY KEY,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
  closed_at timestamptz,
  created_by text NOT NULL,
  closed_by text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS survey_control (
  id integer PRIMARY KEY CHECK (id = 1),
  period_id bigint REFERENCES survey_periods(id),
  revision integer NOT NULL DEFAULT 0
);
INSERT INTO survey_control(id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE leadership_assessment_responses
  ADD COLUMN IF NOT EXISTS survey_period_id bigint REFERENCES survey_periods(id);
CREATE INDEX IF NOT EXISTS leadership_assessment_period_idx
  ON leadership_assessment_responses(survey_period_id);
