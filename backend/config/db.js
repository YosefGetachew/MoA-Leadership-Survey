const { Pool } = require("pg");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const questionSeed = require("../../frontend/src/levelSurveyQuestions.json");

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

const ministry = [["ministry_of_agriculture", "Ministry of Agriculture", "ግብርና ሚኒስቴር"]];
const stateMinisterUnits = [
  ["natural_resource_development_sector", "Natural Resource Development Sector", "የተፈጥሮ ሀብት ልማት ዘርፍ"],
  ["livestock_fishery_resources_development_sector", "Livestock and Fishery Resources Development Sector", "የእንስሳትና ዓሣ ሀብት ልማት ዘርፍ"],
  ["agriculture_horticulture_development_sector", "Agriculture and Horticulture Development Sector", "የግብርናና ሆርቲካልቸር ልማት ዘርፍ"],
  ["agricultural_investment_input_supply_development_sector", "Agricultural Investment and Input Supply Development Sector", "የግብርና ኢንቨስትመንትና ግብዓት አቅርቦት ልማት ዘርፍ"],
];
const accountableInstitutions = [
  ["agricultural_transformation_institute", "Ethiopian Agricultural Transformation Institute (ATI)", "የኢትዮጵያ ግብርና ሽግግር ኢንስቲትዩት (ATI)"],
  ["agricultural_research_institute", "Ethiopian Institute of Agricultural Research (EIAR)", "የኢትዮጵያ ግብርና ምርምር ኢንስቲትዩት (EIAR)"],
  ["coffee_tea_authority", "Ethiopian Coffee and Tea Authority", "የኢትዮጵያ ቡናና ሻይ ባለሥልጣን"],
  ["agricultural_authority", "Ethiopian Agricultural Authority (EAA)", "የኢትዮጵያ ግብርና ባለሥልጣን (EAA)"],
  ["animal_health_institute", "Animal Health Institute (AHI)", "የእንስሳት ጤና ኢንስቲትዩት (AHI)"],
  ["cooperative_commission", "Ethiopian Cooperative Commission", "የኢትዮጵያ ኅብረት ሥራ ኮሚሽን"],
  ["biodiversity_institute", "Ethiopian Biodiversity Institute (EBI)", "የኢትዮጵያ ብዝሃ ሕይወት ኢንስቲትዩት (EBI)"],
  ["forestry_development", "Ethiopian Forestry Development (EFD)", "የኢትዮጵያ ደን ልማት (EFD)"],
  ["livestock_development_institute", "Livestock Development Institute (LDI)", "የእንስሳት ልማት ኢንስቲትዩት (LDI)"],
];
const executiveOffices = [
  ["audit_executive_office", "Audit Executive Office", null],
  ["legal_service_executive_office", "Legal Service Executive Office", null],
  ["public_relations_communication_executive_office", "Public Relations and Communication Executive Office", null],
  ["ethics_anti_corruption_executive_office", "Ethics and Anti-Corruption Executive Office", null],
  ["information_communication_technology_executive_office", "Information and Communication Technology Executive Office", null],
  ["procurement_executive_office", "Procurement Executive Office", null],
  ["competency_human_resource_administration_executive_office", "Competency and Human Resource Administration Executive Office", null],
  ["basic_service_executive_office", "Basic Service Executive Office", null],
  ["finance_executive_office", "Finance Executive Office", null],
  ["strategic_affairs_executive_office", "Strategic Affairs Executive Office", null],
  ["women_children_youth_inclusion_executive_office", "Women, Children and Youth Inclusion Executive Office", null],
  ["organizational_change_executive_office", "Organizational Change Executive Office", null],
];
const leadExecutiveOffices = [
  ["plant_protection_lead_executive_office", "Plant Protection Lead Executive Office", null],
  ["horticulture_development_lead_executive_office", "Horticulture Development Lead Executive Office", null],
  ["agriculture_horticulture_extension_lead_executive_office", "Agriculture and Horticulture Extension Lead Executive Office", null],
  ["crop_development_lead_executive_office", "Crop Development Lead Executive Office", null],
  ["cotton_development_lead_executive_office", "Cotton Development Lead Executive Office", null],
  ["feed_resource_development_lead_executive_office", "Feed Resource Development Lead Executive Office", null],
  ["animal_health_veterinary_public_health_lead_executive_office", "Animal Health and Veterinary Public Health Lead Executive Office", null],
  ["livestock_fisheries_development_lead_executive_office", "Livestock and Fisheries Development Lead Executive Office", null],
  ["livestock_fisheries_extension_lead_executive_office", "Livestock and Fisheries Extension Lead Executive Office", null],
  ["rural_land_administration_use_lead_executive_office", "Rural Land Administration and Use Lead Executive Office", null],
  ["natural_resource_development_protection_utilization_lead_executive_office", "Natural Resource Development, Protection and Utilization Lead Executive Office", null],
  ["smallholder_irrigation_development_lead_executive_office", "Smallholder Irrigation Development Lead Executive Office", null],
  ["soil_resource_development_lead_executive_office", "Soil Resource Development Lead Executive Office", null],
  ["agricultural_investment_product_marketing_lead_executive_office", "Agricultural Investment and Product Marketing Lead Executive Office", null],
  ["urban_agriculture_development_lead_executive_office", "Urban Agriculture Development Lead Executive Office", null],
  ["agricultural_mechanization_lead_executive_office", "Agricultural Mechanization Lead Executive Office", null],
  ["agricultural_input_supply_distribution_lead_executive_office", "Agricultural Input Supply and Distribution Lead Executive Office", null],
  ["policy_strategy_study_research_lead_executive_office", "Policy and Strategy Study and Research Lead Executive Office", null],
];
const coordinationOffices = [
  ["food_security_coordination_office", "Food Security Coordination Office", null],
  ["food_nutrition_office", "Food and Nutrition Office", null],
];
const operationalUnits = [...executiveOffices, ...leadExecutiveOffices, ...coordinationOffices];
const registryByPosition = {
  minister: ministry,
  state_minister: stateMinisterUnits,
  advisor_to_minister: ministry,
  director_general: accountableInstitutions,
  lead_executive: leadExecutiveOffices,
  executive: executiveOffices,
  project_coordinator: coordinationOffices,
  team_leader: operationalUnits,
  desk_head: operationalUnits,
};
const levelByPosition = {
  minister: "high_level", state_minister: "high_level", advisor_to_minister: "high_level", director_general: "high_level",
  lead_executive: "middle_level", executive: "middle_level", project_coordinator: "middle_level",
  team_leader: "lower_level", desk_head: "lower_level",
};

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id serial PRIMARY KEY,
      username text NOT NULL,
      password_hash text NOT NULL,
      display_name text NOT NULL,
      role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin','survey_admin','viewer')),
      active boolean NOT NULL DEFAULT true,
      email text,
      must_change_password boolean NOT NULL DEFAULT false,
      session_version integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS admin_users_username_idx ON admin_users(lower(username));
    ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS email text;
    ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
    CREATE UNIQUE INDEX IF NOT EXISTS admin_users_email_idx ON admin_users(lower(email)) WHERE email IS NOT NULL;
    ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 0;
    ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS admin_users_role_check;
    ALTER TABLE admin_users ADD CONSTRAINT admin_users_role_check CHECK (role IN ('admin','survey_admin','viewer'));
    CREATE TABLE IF NOT EXISTS password_reset_requests (
      user_id integer PRIMARY KEY REFERENCES admin_users(id) ON DELETE CASCADE,
      requested_at timestamptz NOT NULL DEFAULT now(),
      resolved_at timestamptz
    );
    CREATE TABLE IF NOT EXISTS admin_invitations (
      user_id integer PRIMARY KEY REFERENCES admin_users(id) ON DELETE CASCADE,
      token_hash text NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS admin_password_resets (
      user_id integer PRIMARY KEY REFERENCES admin_users(id) ON DELETE CASCADE,
      token_hash text NOT NULL UNIQUE,
      expires_at timestamptz NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS survey_settings (
      key text PRIMARY KEY,
      value text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS surveys (
      id bigserial PRIMARY KEY,
      name_en text NOT NULL,
      name_am text,
      slug text NOT NULL UNIQUE,
      settings jsonb NOT NULL DEFAULT '{}'::jsonb,
      published boolean NOT NULL DEFAULT false,
      archived boolean NOT NULL DEFAULT false,
      created_by text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    INSERT INTO surveys(id,name_en,name_am,slug,published,created_by)
      VALUES(1,'Leadership Assessment Survey','የአመራር ምዘና ዳሰሳ','leadership-assessment',true,'system')
      ON CONFLICT(id) DO NOTHING;
    SELECT setval(pg_get_serial_sequence('surveys','id'),GREATEST(1,(SELECT max(id) FROM surveys)),true);
    CREATE UNIQUE INDEX IF NOT EXISTS surveys_one_published_idx ON surveys(published) WHERE published=true;
    ALTER TABLE surveys ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;

    CREATE TABLE IF NOT EXISTS survey_questions (
      survey_id bigint NOT NULL DEFAULT 1 REFERENCES surveys(id),
      code text NOT NULL,
      leadership_level text NOT NULL CHECK (leadership_level IN ('high_level','middle_level','lower_level')),
      text_en text NOT NULL,
      text_am text NOT NULL,
      dimension text,
      sort_order integer NOT NULL CHECK (sort_order >= 0),
      active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      updated_by text,
      PRIMARY KEY(survey_id,code)
    );
    ALTER TABLE survey_questions DROP CONSTRAINT IF EXISTS survey_questions_leadership_level_check;
    ALTER TABLE survey_questions ADD CONSTRAINT survey_questions_leadership_level_check
      CHECK (leadership_level IN ('high_level','middle_level','lower_level','open_ended'));
    ALTER TABLE survey_questions ADD COLUMN IF NOT EXISTS survey_id bigint REFERENCES surveys(id);
    UPDATE survey_questions SET survey_id=1 WHERE survey_id IS NULL;
    ALTER TABLE survey_questions ALTER COLUMN survey_id SET DEFAULT 1;
    ALTER TABLE survey_questions ALTER COLUMN survey_id SET NOT NULL;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='survey_questions'::regclass AND conname='survey_questions_pkey' AND pg_get_constraintdef(oid)='PRIMARY KEY (code)') THEN
        ALTER TABLE survey_questions DROP CONSTRAINT survey_questions_pkey;
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='survey_questions'::regclass AND contype='p') THEN
        ALTER TABLE survey_questions ADD CONSTRAINT survey_questions_pkey PRIMARY KEY(survey_id,code);
      END IF;
    END $$;
    CREATE INDEX IF NOT EXISTS survey_questions_category_order_idx
      ON survey_questions(survey_id,leadership_level,active,sort_order,code);

    CREATE TABLE IF NOT EXISTS survey_sectors (
      id serial PRIMARY KEY,
      code text NOT NULL UNIQUE,
      name_en text NOT NULL,
      name_am text,
      leadership_level text NOT NULL DEFAULT 'high_level' CHECK (leadership_level IN ('high_level','middle_level','lower_level')),
      leadership_position text,
      active boolean NOT NULL DEFAULT true,
      sort_order integer NOT NULL DEFAULT 100,
      created_by text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS survey_sectors_active_order_idx
      ON survey_sectors(active,sort_order,name_en);
    ALTER TABLE survey_sectors ADD COLUMN IF NOT EXISTS leadership_level text;
    ALTER TABLE survey_sectors ADD COLUMN IF NOT EXISTS leadership_position text;
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
    CREATE INDEX IF NOT EXISTS survey_sectors_position_active_order_idx
      ON survey_sectors(leadership_level,leadership_position,active,sort_order,name_en);
    ALTER TABLE survey_sectors DROP CONSTRAINT IF EXISTS survey_sectors_leadership_position_check;
    ALTER TABLE survey_sectors ADD CONSTRAINT survey_sectors_leadership_position_check
      CHECK (leadership_position IS NULL OR leadership_position IN ('minister','state_minister','advisor_to_minister','director_general','commissioner','bureau_head','equivalent_senior_executive','lead_executive','executive','advisor','project_coordinator','team_leader','desk_head'));

    CREATE TABLE IF NOT EXISTS leadership_assessment_responses (
      id bigserial PRIMARY KEY,
      survey_version text NOT NULL,
      leadership_level text NOT NULL CHECK (leadership_level IN ('high_level','middle_level','lower_level','all_levels')),
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
    ALTER TABLE leadership_assessment_responses ADD COLUMN IF NOT EXISTS evaluator_level text;
    ALTER TABLE leadership_assessment_responses ADD COLUMN IF NOT EXISTS sex text CHECK (sex IN ('male','female'));
    ALTER TABLE leadership_assessment_responses ADD COLUMN IF NOT EXISTS age integer CHECK (age BETWEEN 18 AND 100);
    ALTER TABLE leadership_assessment_responses ADD COLUMN IF NOT EXISTS work_experience integer CHECK (work_experience >= 0 AND work_experience <= age);
    ALTER TABLE leadership_assessment_responses ADD COLUMN IF NOT EXISTS assessment_targets jsonb NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE leadership_assessment_responses ADD COLUMN IF NOT EXISTS open_ended_responses jsonb NOT NULL DEFAULT '{}'::jsonb;
    ALTER TABLE leadership_assessment_responses ADD COLUMN IF NOT EXISTS survey_id bigint REFERENCES surveys(id);
    UPDATE leadership_assessment_responses SET survey_id=1 WHERE survey_id IS NULL;
    ALTER TABLE leadership_assessment_responses ALTER COLUMN survey_id SET DEFAULT 1;
    ALTER TABLE leadership_assessment_responses ALTER COLUMN survey_id SET NOT NULL;
    CREATE INDEX IF NOT EXISTS leadership_assessment_survey_idx ON leadership_assessment_responses(survey_id,completed_at DESC);
    ALTER TABLE leadership_assessment_responses DROP CONSTRAINT IF EXISTS leadership_assessment_responses_leadership_level_check;
    ALTER TABLE leadership_assessment_responses ADD CONSTRAINT leadership_assessment_responses_leadership_level_check
      CHECK (leadership_level IN ('high_level','middle_level','lower_level','all_levels'));
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='leadership_assessment_responses'::regclass AND conname='leadership_assessment_evaluator_level_check') THEN
        ALTER TABLE leadership_assessment_responses ADD CONSTRAINT leadership_assessment_evaluator_level_check
          CHECK (evaluator_level IS NULL OR evaluator_level IN ('senior_leadership','middle_leadership','lower_leadership','expert'));
      END IF;
    END $$;

    INSERT INTO survey_settings(key,value,updated_at) VALUES
      ('active_survey_version','leadership-demographics-v4',now()),
      ('final_survey_source','Revised Likert Scale Survey Tool file_Vf1.docx',now()),
      ('final_survey_source_sha256','CDA717D35DD56C1C29161CD10A2677731787FAEBAD9176ADE14D03B441594CE3',now()),
      ('sector_registry_source','https://www.moa.gov.et/officals/; https://www.moa.gov.et/accountable-institutions/',now()),
      ('sector_registry_verified_on','2026-08-28',now())
    ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at;
  `);

  await pool.query(readFileSync(path.join(__dirname, "..", "survey-window-schema.sql"), "utf8"));
  const questionRows = questionSeed.flatMap(section => section.questions.map((question, index) => ({
    code: question.code,
    leadership_level: section.level,
    text_en: question.text,
    text_am: question.textAm,
    dimension: question.dimension || null,
    sort_order: (index + 1) * 10,
  })));
  await pool.query(
    `INSERT INTO survey_questions(survey_id,code,leadership_level,text_en,text_am,dimension,sort_order)
     SELECT 1,code,leadership_level,text_en,text_am,dimension,sort_order
     FROM jsonb_to_recordset($1::jsonb) AS x(code text,leadership_level text,text_en text,text_am text,dimension text,sort_order integer)
     ON CONFLICT(survey_id,code) DO NOTHING`,
    [JSON.stringify(questionRows)],
  );
  await pool.query(
    `INSERT INTO survey_questions(survey_id,code,leadership_level,text_en,text_am,dimension,sort_order)
     SELECT s.id,code,'open_ended',text_en,text_am,'Qualitative feedback',sort_order
     FROM surveys s CROSS JOIN jsonb_to_recordset($1::jsonb) AS x(code text,text_en text,text_am text,sort_order integer)
     ON CONFLICT(survey_id,code) DO NOTHING`,
    [JSON.stringify([
      { code: 'GQ1', sort_order: 10, text_en: 'What is one thing that works particularly well in the Ministry of Agriculture?', text_am: 'በግብርና ሚኒስቴር ውስጥ በተለየ ሁኔታ በጥሩ ሁኔታ የሚሰራው አንድ ነገር ምንድን ነው?' },
      { code: 'GQ2', sort_order: 20, text_en: 'What is the one leadership practice that most prevents you from performing your work effectively?', text_am: 'ሥራዎን ውጤታማ በሆነ መንገድ እንዳያከናውኑ በጣም የሚያግድዎት አንድ የአመራር ልምድ (አሰራር) ምንድን ነው?' },
      { code: 'GQ3', sort_order: 30, text_en: 'What is one reform action that would most improve employee performance?', text_am: 'የሰራተኞችን አፈጻጸም የበለጠ የሚያሻሽለው አንድ የማሻሻያ (ሪፎርም) እርምጃ ምንድን ነው?' },
    ])],
  );
  await pool.query(`UPDATE survey_sectors SET active=false,updated_at=now() WHERE created_by IS NULL`);
  const officialRows = Object.entries(registryByPosition).flatMap(([leadershipPosition, organizations]) =>
    organizations.map(([baseCode, nameEn, nameAm], index) => ({
      code: `${leadershipPosition}_${baseCode}`,
      nameEn,
      nameAm,
      leadershipLevel: levelByPosition[leadershipPosition],
      leadershipPosition,
      sortOrder: (index + 1) * 10,
    })),
  );
  await pool.query(
    `INSERT INTO survey_sectors(code,name_en,name_am,leadership_level,leadership_position,sort_order,created_by,active)
     SELECT code,name_en,name_am,leadership_level,leadership_position,sort_order,NULL,true
     FROM jsonb_to_recordset($1::jsonb) AS x(code text,name_en text,name_am text,leadership_level text,leadership_position text,sort_order integer)
     ON CONFLICT(code) DO UPDATE SET
       name_en=excluded.name_en,name_am=excluded.name_am,leadership_level=excluded.leadership_level,
       leadership_position=excluded.leadership_position,sort_order=excluded.sort_order,active=true,updated_at=now()`,
    [JSON.stringify(officialRows.map((row) => ({
      code: row.code,
      name_en: row.nameEn,
      name_am: row.nameAm,
      leadership_level: row.leadershipLevel,
      leadership_position: row.leadershipPosition,
      sort_order: row.sortOrder,
    })))],
  );
}

async function query(text, values = []) {
  return (await pool.query(text, values)).rows;
}

async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(async (text, values = []) => (await client.query(text, values)).rows);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}

module.exports = { pool, ensureSchema, query, withTransaction };
