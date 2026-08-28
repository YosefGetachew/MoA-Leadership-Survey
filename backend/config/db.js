const { Pool } = require("pg");

const pool = new Pool(process.env.DATABASE_URL ? {
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
} : {
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || "moa_reform_feedback",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD,
});

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id serial PRIMARY KEY,
      username text NOT NULL,
      password_hash text NOT NULL,
      display_name text NOT NULL,
      role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin','viewer')),
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS admin_users_username_idx ON admin_users(lower(username));

    CREATE TABLE IF NOT EXISTS survey_settings (
      key text PRIMARY KEY,
      value text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS survey_sectors (
      id serial PRIMARY KEY,
      code text NOT NULL UNIQUE,
      name_en text NOT NULL,
      name_am text,
      leadership_level text NOT NULL DEFAULT 'high_level' CHECK (leadership_level IN ('high_level','middle_level','lower_level')),
      active boolean NOT NULL DEFAULT true,
      sort_order integer NOT NULL DEFAULT 100,
      created_by text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS survey_sectors_active_order_idx
      ON survey_sectors(active,sort_order,name_en);
    ALTER TABLE survey_sectors ADD COLUMN IF NOT EXISTS leadership_level text;
    UPDATE survey_sectors SET leadership_level='high_level' WHERE leadership_level IS NULL;
    ALTER TABLE survey_sectors ALTER COLUMN leadership_level SET DEFAULT 'high_level';
    ALTER TABLE survey_sectors ALTER COLUMN leadership_level SET NOT NULL;
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='survey_sectors_leadership_level_check') THEN
        ALTER TABLE survey_sectors ADD CONSTRAINT survey_sectors_leadership_level_check
          CHECK (leadership_level IN ('high_level','middle_level','lower_level'));
      END IF;
    END $$;
    CREATE INDEX IF NOT EXISTS survey_sectors_level_active_order_idx
      ON survey_sectors(leadership_level,active,sort_order,name_en);

    CREATE TABLE IF NOT EXISTS leadership_assessment_responses (
      id bigserial PRIMARY KEY,
      survey_version text NOT NULL,
      leadership_level text NOT NULL CHECK (leadership_level IN ('high_level','middle_level','lower_level')),
      evaluated_leadership_position text,
      evaluated_sector text,
      evaluator_name text,
      evaluator_organization text,
      evaluator_position text,
      evaluator_contact text,
      overall_responses jsonb NOT NULL DEFAULT '{}'::jsonb,
      responses jsonb NOT NULL,
      answered_count integer NOT NULL CHECK (answered_count > 0),
      na_count integer NOT NULL DEFAULT 0 CHECK (na_count >= 0),
      respondent_token text NOT NULL,
      completed_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS leadership_assessment_once_idx
      ON leadership_assessment_responses(respondent_token,survey_version);
    CREATE INDEX IF NOT EXISTS leadership_assessment_completed_idx
      ON leadership_assessment_responses(completed_at DESC);
    CREATE INDEX IF NOT EXISTS leadership_assessment_level_idx
      ON leadership_assessment_responses(leadership_level);
    ALTER TABLE leadership_assessment_responses ADD COLUMN IF NOT EXISTS evaluated_sector text;
    ALTER TABLE leadership_assessment_responses ADD COLUMN IF NOT EXISTS evaluated_leadership_position text;
    ALTER TABLE leadership_assessment_responses ADD COLUMN IF NOT EXISTS evaluator_name text;
    ALTER TABLE leadership_assessment_responses ADD COLUMN IF NOT EXISTS evaluator_organization text;
    ALTER TABLE leadership_assessment_responses ADD COLUMN IF NOT EXISTS evaluator_position text;
    ALTER TABLE leadership_assessment_responses ADD COLUMN IF NOT EXISTS evaluator_contact text;
    ALTER TABLE leadership_assessment_responses ADD COLUMN IF NOT EXISTS overall_responses jsonb NOT NULL DEFAULT '{}'::jsonb;

    INSERT INTO survey_sectors(code,name_en,name_am,leadership_level,sort_order) VALUES
      ('crop_development','Crop Development','የሰብል ልማት','high_level',10),
      ('livestock_development','Livestock Development','የእንስሳት ልማት','high_level',20),
      ('agricultural_extension','Agricultural Extension','የግብርና ኤክስቴንሽን','high_level',30),
      ('natural_resources','Natural Resources Management','የተፈጥሮ ሀብት አስተዳደር','high_level',40),
      ('irrigation_development','Irrigation Development','የመስኖ ልማት','high_level',50),
      ('inputs_mechanization','Agricultural Inputs and Mechanization','የግብርና ግብዓትና ሜካናይዜሽን','high_level',60),
      ('agricultural_marketing','Agricultural Marketing','የግብርና ግብይት','high_level',70),
      ('food_nutrition_security','Food and Nutrition Security','የምግብና ሥነ ምግብ ዋስትና','high_level',80),
      ('planning_policy_monitoring','Planning, Policy and Monitoring','ዕቅድ፣ ፖሊሲና ክትትል','high_level',90),
      ('research_innovation','Research and Innovation','ምርምርና ፈጠራ','high_level',100),
      ('administration_enabling','Administration and Enabling Services','አስተዳደርና ድጋፍ ሰጪ አገልግሎቶች','high_level',110),
      ('regional_agriculture','Regional Agriculture Bureau / Office','የክልል ግብርና ቢሮ / ጽሕፈት ቤት','high_level',120),
      ('accountable_institution','Accountable Institution','ተጠሪ ተቋም','high_level',130),
      ('project_program','Project or Program','ፕሮጀክት ወይም ፕሮግራም','high_level',140)
    ON CONFLICT(code) DO NOTHING;

    INSERT INTO survey_sectors(code,name_en,name_am,leadership_level,sort_order,created_by)
      SELECT 'middle_level_' || code,name_en,name_am,'middle_level',sort_order,NULL
      FROM survey_sectors WHERE leadership_level='high_level' AND created_by IS NULL AND code NOT LIKE 'middle_level_%' AND code NOT LIKE 'lower_level_%'
    ON CONFLICT(code) DO NOTHING;
    INSERT INTO survey_sectors(code,name_en,name_am,leadership_level,sort_order,created_by)
      SELECT 'lower_level_' || code,name_en,name_am,'lower_level',sort_order,NULL
      FROM survey_sectors WHERE leadership_level='high_level' AND created_by IS NULL AND code NOT LIKE 'middle_level_%' AND code NOT LIKE 'lower_level_%'
    ON CONFLICT(code) DO NOTHING;

    INSERT INTO survey_settings(key,value,updated_at) VALUES
      ('active_survey_version','leadership-reform-v2-2026-08-28',now()),
      ('final_survey_source','Revised Likert Scale Survey Tool file_Vf1.docx',now()),
      ('final_survey_source_sha256','CDA717D35DD56C1C29161CD10A2677731787FAEBAD9176ADE14D03B441594CE3',now())
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at;
  `);
}

async function query(text, values = []) {
  return (await pool.query(text, values)).rows;
}

module.exports = { pool, ensureSchema, query };
