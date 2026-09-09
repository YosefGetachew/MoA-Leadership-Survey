CREATE TABLE IF NOT EXISTS survey_periods (
  id bigserial PRIMARY KEY,
  survey_id bigint NOT NULL DEFAULT 1 REFERENCES surveys(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
  closed_at timestamptz,
  created_by text NOT NULL,
  closed_by text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE survey_periods ADD COLUMN IF NOT EXISTS survey_id bigint REFERENCES surveys(id);
UPDATE survey_periods SET survey_id=1 WHERE survey_id IS NULL;
ALTER TABLE survey_periods ALTER COLUMN survey_id SET DEFAULT 1;
ALTER TABLE survey_periods ALTER COLUMN survey_id SET NOT NULL;
CREATE TABLE IF NOT EXISTS survey_control (
  id integer PRIMARY KEY CHECK (id = 1),
  survey_id bigint NOT NULL DEFAULT 1 REFERENCES surveys(id),
  period_id bigint REFERENCES survey_periods(id),
  revision integer NOT NULL DEFAULT 0
);
INSERT INTO survey_control(id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE survey_control ADD COLUMN IF NOT EXISTS survey_id bigint REFERENCES surveys(id);
UPDATE survey_control SET survey_id=1 WHERE survey_id IS NULL;
ALTER TABLE survey_control ALTER COLUMN survey_id SET DEFAULT 1;
ALTER TABLE survey_control ALTER COLUMN survey_id SET NOT NULL;
ALTER TABLE leadership_assessment_responses
  ADD COLUMN IF NOT EXISTS survey_period_id bigint REFERENCES survey_periods(id);
CREATE INDEX IF NOT EXISTS leadership_assessment_period_idx
  ON leadership_assessment_responses(survey_period_id);
