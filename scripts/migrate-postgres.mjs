import crypto from "node:crypto";
import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");

const pool = new Pool({ connectionString });

function hashPassword(password) {
  const iterations = 210_000;
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 32, "sha256");
  return `pbkdf2_sha256$${iterations}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

try {
  await pool.query(`CREATE TABLE IF NOT EXISTS trainings (
    id serial PRIMARY KEY,
    title text NOT NULL,
    training_date date NOT NULL,
    trainer_name text DEFAULT 'Not assigned' NOT NULL,
    facilitator_name text DEFAULT 'Not assigned' NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
  )`);
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS trainings_title_date_idx ON trainings (title, training_date)");

  await pool.query(`CREATE TABLE IF NOT EXISTS feedback (
    id serial PRIMARY KEY,
    training_title text NOT NULL,
    training_date date NOT NULL,
    participant_name text,
    department text,
    overall_rating integer NOT NULL,
    trainer_rating integer DEFAULT 3 NOT NULL,
    clarity_rating integer NOT NULL,
    relevance_rating integer NOT NULL,
    confidence_rating integer NOT NULL,
    recommend_score integer NOT NULL,
    highlight text,
    improvement text,
    anonymous boolean DEFAULT true NOT NULL,
    respondent_token text,
    created_at timestamptz DEFAULT now() NOT NULL
  )`);
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS feedback_respondent_training_idx ON feedback (respondent_token, training_title, training_date)");

  await pool.query(`CREATE TABLE IF NOT EXISTS admin_users (
    id serial PRIMARY KEY,
    username text NOT NULL,
    password_hash text NOT NULL,
    display_name text NOT NULL DEFAULT 'Administrator',
    role text NOT NULL DEFAULT 'admin',
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`);
  await pool.query("ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'admin'");
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS admin_users_username_idx ON admin_users (lower(username))");

  const username = process.env.MINISTRY_ADMIN_USERNAME?.trim();
  const password = process.env.MINISTRY_ADMIN_PASSWORD;
  if (username && password) {
    await pool.query(
      `INSERT INTO admin_users (username, password_hash, display_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (lower(username)) DO UPDATE
       SET password_hash = excluded.password_hash, updated_at = now()`,
      [username, hashPassword(password), "Ministry Administrator"],
    );
  }

  console.log("PostgreSQL migration complete.");
} finally {
  await pool.end();
}
